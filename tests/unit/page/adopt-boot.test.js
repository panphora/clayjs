/**
 * When a hand-edited article is adopted: the boot file before the editor mounts,
 * and every newer file that arrives as clay:sync-applied. Only the checkpoint
 * writer adopts; autosave is held while an adoption waits, so a checkpoint
 * cannot save the old article over the hand edit first.
 */
import { jest } from "@jest/globals";
import { createPageEditor } from "../../../src/page/editor.js";
import { blocksOfValues, project, renderModel, revOf } from "../../../src/page/projection.js";
import { blockMap } from "../../../src/page/model.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { readFile, installAdoption } from "../../../src/page/adopt-boot.js";

const RECORD = { blocks: {
  h: { t: "heading", pos: "1", level: 1, c: "Title" },
  a: { t: "paragraph", pos: "2", c: "First paragraph" },
  b: { t: "paragraph", pos: "3", c: "Second paragraph" },
}, deleted: {} };

function fileHtml(record, edit = () => {}) {
  const blocks = blocksOfValues([record]);
  const model = project(blocks);
  const html = `<!DOCTYPE html><html><head><script type="application/json" merge="page" clay="live">${JSON.stringify(record)}</script></head><body><article class="page" clay="freeze" data-page="1" data-rev="${revOf(model)}">${renderModel(model)}</article></body></html>`;
  const d = new DOMParser().parseFromString(html, "text/html");
  edit(d);
  return "<!DOCTYPE html>" + d.documentElement.outerHTML;
}
const fileOf = (html) => readFile(new DOMParser().parseFromString(html, "text/html"));
const editA = (d) => { d.querySelector('[data-id="a"]').textContent = "First paragraph, edited by hand"; };
const clone = (v) => JSON.parse(JSON.stringify(v));

const peerRecord = { blocks: {
  h: { t: "heading", pos: "1", level: 1, c: "Title" },
  a: { t: "paragraph", pos: "2", c: "First paragraph" },
  b: { t: "paragraph", pos: "3", c: "Second paragraph, typed by a peer" },
}, deleted: {} };

function open() {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const view = createPageEditor(mount, { blocks: clone(RECORD.blocks) });
  return {
    view,
    close() {
      view.destroy();
      mount.remove();
    },
  };
}

function counters() {
  const counts = { holds: 0, releases: 0, checkpoints: 0, notices: [], frames: [] };
  counts.hold = () => counts.holds++;
  counts.release = () => counts.releases++;
  counts.requestCheckpoint = () => counts.checkpoints++;
  counts.notice = (c) => counts.notices.push(c);
  counts.onFrame = (e) => counts.frames.push(e.detail);
  return counts;
}

test("untouched boot file: nothing adopted, nothing held", async () => {
  const ed = open();
  const before = blockMap(ed.view.state.doc);
  const c = counters();
  const controller = installAdoption({ view: ed.view, source: fileOf(fileHtml(RECORD)), hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  await controller.idle();
  expect(blockMap(ed.view.state.doc)).toEqual(before);
  expect(c.holds).toBe(0);
  expect(c.checkpoints).toBe(0);
  expect(c.notices).toEqual([]);
  controller.dispose();
  ed.close();
});

test("hand-edited boot file: adopted, held, checkpointed, announced, undoable", async () => {
  const ed = open();
  const c = counters();
  document.addEventListener("clay:page-adopted", c.onFrame);
  const controller = installAdoption({ view: ed.view, source: fileOf(fileHtml(RECORD, editA)), hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  await controller.idle();
  const blocks = blockMap(ed.view.state.doc);
  expect(blocks.a.c).toBe("First paragraph, edited by hand");
  expect(blocks.h.c).toBe("Title");
  expect(blocks.b.c).toBe("Second paragraph");
  expect(c.holds).toBe(1);
  expect(c.releases).toBe(1);
  expect(c.checkpoints).toBe(1);
  expect(c.notices).toEqual([{ edited: 1, created: 0, deleted: 0, moved: false }]);
  expect(c.frames).toEqual([{ edited: 1, created: 0, deleted: 0, moved: false }]);
  expect(history.undo(ed.view.state, ed.view.dispatch)).toBe(true);
  expect(blockMap(ed.view.state.doc).a.c).toBe("First paragraph");
  document.removeEventListener("clay:page-adopted", c.onFrame);
  controller.dispose();
  ed.close();
});

test("not the checkpoint writer: never holds autosave, never dispatched", async () => {
  const ed = open();
  const before = blockMap(ed.view.state.doc);
  const c = counters();
  const controller = installAdoption({ view: ed.view, source: fileOf(fileHtml(RECORD, editA)), isAdopter: () => false, hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  await controller.idle();
  expect(blockMap(ed.view.state.doc)).toEqual(before);
  expect(c.holds).toBe(0);
  expect(c.releases).toBe(0);
  expect(c.checkpoints).toBe(0);
  expect(c.notices).toEqual([]);
  controller.dispose();
  ed.close();
});

test("waits for an IME composition to end before adopting", async () => {
  const ed = open();
  const before = blockMap(ed.view.state.doc);
  const c = counters();
  let release;
  const gate = new Promise((r) => (release = r));
  const controller = installAdoption({ view: ed.view, source: fileOf(fileHtml(RECORD, editA)), idle: () => gate, hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  await new Promise((r) => setTimeout(r, 10));
  expect(blockMap(ed.view.state.doc)).toEqual(before);
  expect(c.holds).toBe(1);
  expect(c.releases).toBe(0);
  release();
  await controller.idle();
  expect(blockMap(ed.view.state.doc).a.c).toBe("First paragraph, edited by hand");
  expect(c.releases).toBe(1);
  controller.dispose();
  ed.close();
});

test("a newer file arrives with a hand edit: adopted once, repeats ignored", async () => {
  const ed = open();
  const c = counters();
  const controller = installAdoption({ view: ed.view, hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: fileHtml(RECORD, editA) } }));
  await controller.idle();
  expect(blockMap(ed.view.state.doc).a.c).toBe("First paragraph, edited by hand");
  expect(c.notices).toEqual([{ edited: 1, created: 0, deleted: 0, moved: false }]);
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: fileHtml(RECORD, editA) } }));
  await controller.idle();
  expect(c.notices).toHaveLength(1);
  expect(c.holds).toBe(1);
  controller.dispose();
  ed.close();
});

test("a peer's freshly rendered file is not adopted", async () => {
  const ed = open();
  const before = blockMap(ed.view.state.doc);
  const c = counters();
  const controller = installAdoption({ view: ed.view, hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: fileHtml(peerRecord) } }));
  await controller.idle();
  expect(c.notices).toEqual([]);
  expect(c.holds).toBe(0);
  expect(blockMap(ed.view.state.doc)).toEqual(before);
  controller.dispose();
  ed.close();
});

test("a pre-save snapshot: old article, newer tags, is not adopted", async () => {
  const ed = open();
  const c = counters();
  const html = fileHtml(RECORD);
  const d = new DOMParser().parseFromString(html, "text/html");
  d.querySelector('script[merge="page"]').textContent = JSON.stringify(peerRecord);
  const frame = "<!DOCTYPE html>" + d.documentElement.outerHTML;
  const controller = installAdoption({ view: ed.view, hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: frame } }));
  await controller.idle();
  expect(c.notices).toEqual([]);
  expect(c.holds).toBe(0);
  controller.dispose();
  ed.close();
});

test("article and data both edited: kept the data, warned", async () => {
  const ed = open();
  const before = blockMap(ed.view.state.doc);
  const c = counters();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const html = fileHtml(RECORD, editA);
  const d = new DOMParser().parseFromString(html, "text/html");
  d.querySelector('script[merge="page"]').textContent = JSON.stringify(peerRecord);
  const frame = "<!DOCTYPE html>" + d.documentElement.outerHTML;
  const controller = installAdoption({ view: ed.view, hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: frame } }));
  await controller.idle();
  expect(c.notices).toEqual([]);
  expect(c.holds).toBe(0);
  expect(blockMap(ed.view.state.doc)).toEqual(before);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain("changed together");
  warn.mockRestore();
  controller.dispose();
  ed.close();
});

test("the hold is released when waiting fails", async () => {
  const ed = open();
  const before = blockMap(ed.view.state.doc);
  const c = counters();
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  const controller = installAdoption({ view: ed.view, source: fileOf(fileHtml(RECORD, editA)), ready: Promise.reject(new Error("no lane")), hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  await controller.idle();
  expect(blockMap(ed.view.state.doc)).toEqual(before);
  expect(c.holds).toBe(1);
  expect(c.releases).toBe(1);
  expect(error).toHaveBeenCalled();
  error.mockRestore();
  controller.dispose();
  ed.close();
});
