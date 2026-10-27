/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { webcrypto } from "node:crypto";
import { jest } from "@jest/globals";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { state as pmState, view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import { createPageEditor, installPageFeature, runPageCommand, setEditorActive } from "../../../src/page/editor.js";
import { COMMAND_FEATURES } from "../../../src/page/features/registry.js";
import * as tocFeature from "../../../src/page/features/toc.js";
import * as titleIcon from "../../../src/page/features/title-icon.js";
import * as I from "../../../src/page/items.js";
import { blockMap, orderedIds } from "../../../src/page/model.js";
import { runsOf } from "../../../src/page/inline.js";
import { parseModel, project, renderModel, revOf } from "../../../src/page/projection.js";
import { createStore } from "../../../src/live/store.js";
import { createYPageBinding } from "../../../src/page/ybind/index.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { yValueOf } from "../../../src/page/ybind/provider.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";
import { createPageJournal, pageJournalContext } from "../../../src/page/ybind/recovery-replay.js";
import { createFormatGate } from "../../../src/page/format-gate.js";
import { PAGE_FORMAT } from "../../../src/page/format-level.js";
import { sortBy, setColumnWidth } from "../../../src/page/table.js";
import { remoteDependencies } from "../../../src/page/export-assets.js";
import { liveTags } from "../../../src/server/rooms/live-data-tags.js";
import { NEIGHBOUR } from "../../fixtures/page/formats/m13-cases.mjs";
import { editor } from "./view-helpers.js";

/**
 * Step 16's integration fixture: one document that holds one of every M13 feature, made the
 * way a person makes it. A mention, a date and an emoji come from their own commands; the
 * table of contents from its menu item; the icon and the cover from the title commands; the
 * table carries a sort and two column widths; one block is put where it is by the touch
 * drag; and a block arrives from a Markdown file. Every one of them asks the format gate
 * first, so before the host advertises the format the fixture's own document is untouched.
 *
 * On that document the fixture takes a local edit, a peer's edit and the edit an older
 * writer (R, the release before any floor-1 format) makes to a neighbouring paragraph, then
 * saves it, strips its live tags, reopens it and switches view and edit twice, and exports
 * it as Markdown and as a reading copy. The records have to come back exactly, every
 * feature once and from one participant, and the recovery journal and the provider's own
 * caches have to stay inside the caps the M11 and M12 tests already assert.
 */

// The journal names its lineage with a digest, so the page has a real crypto in this realm.
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });

const ADA = { id: "ada-lovelace", name: "Ada Lovelace" };
const MENTION_KEY = 'x["mention",{"id":"ada-lovelace"}]';
const DATE_KEY = (date) => `x["date",{"date":"${date}"}]`;
const ICON = "\u{1F308}";
const EMOJI = "\u{1F680}";
const AUTHORITY = { host: "https://example.com", documentId: "notes", principalId: "acct-1" };
const COVER = "/uploads/cover.png";
const IMPORTED = "# Imported\n\nImported body\n";
const COVER_MAX = 256;
const LOOSE_MAX = 32;

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    try { cleanup(); } catch {}
  }
  document.body.innerHTML = "";
  jest.restoreAllMocks();
  delete globalThis.clay;
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const settle = async (turns = 8) => {
  for (let i = 0; i < turns; i++) await new Promise((done) => setTimeout(done, 0));
};
const waitFor = async (check, turns = 200) => {
  for (let i = 0; i < turns; i++) {
    if (check()) return true;
    await new Promise((done) => setTimeout(done, 5));
  }
  return false;
};

// clay.people, as a page finds it: the roster a mention is picked from. Nothing here writes.
const people = () => {
  globalThis.clay = { people: {
    list: () => [ADA],
    available: async () => [ADA],
    add: () => { throw new Error("a mention never records a person"); },
  } };
};

const articleOf = (inner, rev = "0") => {
  const parsed = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body><article data-page="1" data-rev="${rev}">\n${inner}\n</article></body></html>`,
    "text/html",
  );
  return parsed.querySelector("article");
};
// The page value a document opens with, from the projection's own bytes.
const seedOf = (records) => {
  const model = project(records);
  return clone(seedPageFromArticle(articleOf(renderModel(model), revOf(model))));
};
const fileOf = (inner, rev, value) =>
  `<!doctype html>\n<html>\n<head><title>Notebook</title></head>\n<body>\n<article data-page="1" data-rev="${rev}">\n${inner}\n</article><script type="application/json" merge="page" clay="live">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>\n</body>\n</html>`;

// A host that owns the canonical floor, as the gate's adapter seam states it.
const gateHost = () => {
  const calls = { activate: 0 };
  const state = { floor: 0, admitted: [PAGE_FORMAT] };
  return {
    calls,
    state,
    async read() { return { floor: state.floor }; },
    async capabilities() { return state.admitted; },
    async activate({ floor }) {
      calls.activate += 1;
      state.floor = Math.max(state.floor, floor);
      return { accepted: true, receipt: { accepted: true } };
    },
  };
};

// One response as the export's download transport hands it over: a body counted as it streams.
const respond = (body = "", { type = "image/png", status = 200 } = {}) => {
  const parts = [new TextEncoder().encode(body)];
  let at = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => {
        const key = String(name).toLowerCase();
        if (key === "content-type") return type;
        return null;
      },
    },
    body: {
      getReader: () => ({
        read: () => (at < parts.length ? Promise.resolve({ done: false, value: parts[at++] }) : Promise.resolve({ done: true, value: undefined })),
        cancel: () => { at = parts.length; return Promise.resolve(); },
      }),
    },
  };
};

// The recovery channel a page journals into, as M11's own tests fake it: each append is one
// batch, and a compaction retires the batches it names.
function fakeChannel(writer) {
  const records = new Map();
  let seq = 0;
  const compactions = [];
  const retire = (named) => { for (const item of named || []) records.delete(item?.id); return named || []; };
  return {
    records,
    compactions,
    async append({ key, context, update, origin = "local", base = null }) {
      const revision = ++seq;
      const id = `${writer}-${revision}`;
      const capsuleId = `capsule:${writer}:${key}`;
      if (!records.has(capsuleId)) {
        records.set(capsuleId, {
          id: capsuleId,
          kind: "binary",
          revision: 0,
          context,
          payload: { base: base ? base.slice() : new Uint8Array(0), dependencies: new Uint8Array(0), owned: new Uint8Array(0) },
        });
      }
      records.set(id, { id, kind: "binary-batch", revision, capsuleId, origin, context, payload: update.slice() });
      return { ok: true, id, revision };
    },
    async list() { return { ok: true, records: [...records.values()] }; },
    async checkpoint({ records: named = [] } = {}) { return { ok: true, retired: retire(named) }; },
    async compact({ records: named = [] } = {}) {
      compactions.push(named.map((entry) => entry.id));
      const batches = named.map(({ id }) => records.get(id)).filter(Boolean);
      const capsule = batches.length ? records.get(batches[0].capsuleId) : null;
      if (capsule) {
        const owned = [capsule.payload.owned, ...batches.filter((batch) => batch.origin !== "dependency").map((batch) => batch.payload)].filter((bytes) => bytes && bytes.byteLength);
        const dependencies = [capsule.payload.dependencies, ...batches.filter((batch) => batch.origin === "dependency").map((batch) => batch.payload)].filter((bytes) => bytes && bytes.byteLength);
        capsule.payload = {
          base: capsule.payload.base,
          dependencies: dependencies.length ? Y.mergeUpdatesV2(dependencies) : new Uint8Array(0),
          owned: owned.length ? Y.mergeUpdatesV2(owned) : new Uint8Array(0),
        };
      }
      return { ok: true, retired: retire(named) };
    },
    async markAcknowledged() { return { ok: true, acknowledged: 0 }; },
    async flush() { return { ok: true }; },
  };
}

// The room two tabs share: what one tab writes locally the other receives as a peer's edit.
function makeRoom(value) {
  const room = { value: clone(value), queue: [] };
  room.join = (tab, store) => store.onLocal((ops) => {
    const applied = [];
    for (const op of ops) {
      if (op.path.length !== 2 || op.path[0] !== "y") continue;
      if (op.op === "set") room.value.y[op.path[1]] = op.value;
      else if (op.op === "del") delete room.value.y[op.path[1]];
      applied.push(op);
    }
    if (applied.length) room.queue.push({ tab, ops: applied });
  });
  room.deliver = (tab, store) => {
    for (const item of room.queue.splice(0)) {
      if (item.tab === tab) continue;
      store.rebase(clone(room.value), { source: "remote", frame: { ops: item.ops } });
    }
  };
  return room;
}

// The fixture's editor: the page editor over a live binding, with the two block features
// whose node views its blocks need. The binding is attached before they install, because
// their install is a transaction, and it is the bridge that answers it.
function openEditor(binding, options = {}) {
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { doc: binding.doc(), dispatch: (tr) => binding.dispatch(tr), history: false, ...options });
  // jsdom has no layout, so the editor is told not to measure a caret it cannot see.
  view.scrollToSelection = () => {};
  binding.attach(view);
  installPageFeature({ view, upload: options.upload }, "toc", tocFeature);
  installPageFeature({ view }, "titleIcon", titleIcon);
  cleanups.push(() => { if (!view.isDestroyed) view.destroy(); mount.remove(); binding.dispose(); binding.ydoc.destroy(); });
  return view;
}

// A plain view over a live binding, for a peer: the same records through Yjs, no editor chrome.
function bindingView(binding) {
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  cleanups.push(() => { if (!view.isDestroyed) view.destroy(); mount.remove(); });
  return view;
}

const record = (view, id) => blockMap(view.state.doc)[id];
const blockPos = (view, id) => {
  let found = null;
  view.state.doc.forEach((node, pos) => { if (found === null && node.attrs.id === id) found = pos; });
  return found;
};
const endOf = (view, id) => blockPos(view, id) + 1 + view.state.doc.nodeAt(blockPos(view, id)).textContent.length;
const caret = (view, pos) => view.dispatch(view.state.tr.setSelection(pmState.TextSelection.create(view.state.doc, pos)));
const pickerEl = () => document.querySelector(".page-mention-picker");
const options = () => [...document.querySelectorAll(".page-mention-picker .page-menu-item")];
const choose = (text) => {
  const found = options().find((option) => option.textContent.startsWith(text));
  expect([text, Boolean(found)]).toEqual([text, true]);
  found.click();
};
const importPanel = () => document.querySelector(".page-import-preview");

// The records the page starts from: a title, the lines each command will write into, a line
// for the older writer's neighbour edit, and a table that carries a sort and two widths.
const START = () => ({
  h: { t: "heading", pos: "00000001", level: 1, c: "Notebook" },
  m: { t: "paragraph", pos: "00000002", c: "" },
  d: { t: "paragraph", pos: "00000003", c: "" },
  e: { t: "paragraph", pos: "00000004", c: "" },
  t: { t: "paragraph", pos: "00000005", c: "" },
  tb: {
    t: "table",
    pos: "00000006",
    cols: { c1: { pos: "00000001", name: "Name", width: 220 }, c2: { pos: "00000002", name: "Owner", width: 160 } },
    rows: {
      r1: { pos: "00000001", cells: { c1: "Ada", c2: "Kim" } },
      r2: { pos: "00000002", cells: { c1: "Bob", c2: "Sam" } },
    },
    sort: { col: "c1", dir: "asc" },
  },
  z: { t: "paragraph", pos: "00000007", c: NEIGHBOUR.c },
});

// The fixture. Every feature is written by its own command, in order, through the real format
// gate: the gate knows no floor until the host advertises the format, so the first attempt at
// a newer format writes nothing at all.
async function fixture() {
  people();
  const adapter = gateHost();
  const advertised = { value: false };
  const gate = createFormatGate({ host: adapter, supported: () => advertised.value });
  const channel = fakeChannel("w-a");
  const journal = createPageJournal({
    channel,
    key: "page",
    context: (base) => pageJournalContext({ authority: AUTHORITY, base }),
  });
  const store = createStore({ name: "page", value: seedOf(START()) });
  const ydoc = new Y.Doc();
  ydoc.clientID = 1111;
  const binding = createYPageBinding({ store, ydoc, captureTimeout: 0, journal });
  const room = makeRoom(store.value);
  room.join("mine", store);
  const upload = async () => ({ ok: true, uploads: [{ url: COVER }] });
  const view = openEditor(binding, { upload, formatGate: () => gate });
  await settle(2);

  const doc = view.state.doc;

  // Before the floor: the table of contents is a newer format, so its command is refused and
  // the document it would have changed is the very same document afterwards.
  const tocIndex = view.state.doc.childCount - 2;
  const refused = await I.runTocItem(view, tocIndex);
  expect(refused).toMatchObject({ ok: false, code: "page-format-unsupported" });
  expect(refused.retry).toBe(false);
  expect(view.state.doc).toBe(doc);
  expect(record(view, "t").t).toBe("paragraph");

  // The icon's picker refuses the same way: the list opens, a choice writes nothing, and no
  // activation was attempted for it either.
  expect(await runPageCommand(view, "titleIcon", {})).toEqual({ ok: true, picker: true });
  expect(await waitFor(() => options().length > 0)).toBe(true);
  choose(ICON);
  await settle(2);
  expect(record(view, "h").pageIcon).toBeUndefined();
  expect(view.state.doc).toBe(doc);
  expect([gate.floor, adapter.state.floor, adapter.calls.activate]).toEqual([0, 0, 0]);

  // The host advertises the format, and the same commands now write.
  advertised.value = true;

  // The page icon: the picker offers glyphs and one choice decorates the title.
  expect(await runPageCommand(view, "titleIcon", {})).toEqual({ ok: true, picker: true });
  await waitFor(() => options().length > 0);
  choose(ICON);
  expect(await waitFor(() => record(view, "h").pageIcon === ICON)).toBe(true);
  expect(record(view, "h").c).toBe("Notebook");

  // The page cover: one upload, one address on the title, one undo entry.
  expect(await runPageCommand(view, "titleCover", {})).toEqual({ ok: true, picker: true });
  const chooser = document.querySelector("input.page-cover-input");
  Object.defineProperty(chooser, "files", { configurable: true, get: () => [new File(["bytes"], "cover.png", { type: "image/png" })] });
  chooser.dispatchEvent(new Event("change"));
  expect(await waitFor(() => record(view, "h").pageCoverSrc === COVER)).toBe(true);
  // The focal point is the default one, drawn on the picture beside the title, not in it.
  expect(view.dom.querySelector("img[data-page-cover]").getAttribute("style")).toBe("object-position:50% 50%");
  expect(view.dom.querySelector("header[data-page-heading] h1").textContent).toBe("Notebook");

  // The mention: the action types its @ and the pick writes the name under the mark.
  caret(view, blockPos(view, "m") + 1);
  expect(await runPageCommand(view, "mentions", {})).toEqual({ ok: true, picker: true });
  expect(await waitFor(() => options().length === 1)).toBe(true);
  options()[0].click();
  expect(await waitFor(() => record(view, "m").c === `${ADA.name} `)).toBe(true);
  expect(runsOf(record(view, "m").m)).toEqual([[ADA.name.length, MENTION_KEY], [1, ""]]);
  view.dispatch(view.state.tr.insertText("wrote this"));

  // The date: Today is the local calendar day, written as its ISO text under the date mark.
  caret(view, blockPos(view, "d") + 1);
  expect(await runPageCommand(view, "dates", {})).toEqual({ ok: true, picker: true });
  await waitFor(() => options().length === 2);
  options()[0].click();
  expect(await waitFor(() => /^\d{4}-\d{2}-\d{2} $/.test(record(view, "d").c))).toBe(true);
  const date = record(view, "d").c.slice(0, 10);
  expect(runsOf(record(view, "d").m)).toEqual([[10, DATE_KEY(date)], [1, ""]]);

  // The emoji: plain Unicode, no mark and nothing a reader needs this code to show.
  caret(view, blockPos(view, "e") + 1);
  expect(await runPageCommand(view, "emoji", {})).toEqual({ ok: true, picker: true });
  await waitFor(() => options().length > 0);
  choose(EMOJI);
  expect(await waitFor(() => record(view, "e").c === EMOJI)).toBe(true);
  expect(record(view, "e").m).toBeUndefined();
  view.dispatch(view.state.tr.insertText(" Ship it"));

  // The table of contents: a block that stores no heading list and draws one from the page.
  const at = orderedIds(blockMap(view.state.doc)).indexOf("t");
  expect(await I.runTocItem(view, at)).toEqual({ ok: true });
  expect(record(view, "t").t).toBe("toc");
  expect(record(view, "t").maxLevel).toBe(3);

  // The table's own commands, from a cell of the table: a sort and a width, each one
  // transaction and each reversible, so the fixture keeps the sort and widths it started with.
  let cell = null;
  view.state.doc.descendants((node, pos) => { if (cell === null && node.type.name === "table_cell") cell = pos + 1; });
  caret(view, cell);
  const table = record(view, "tb");
  const rows = orderedIds(table.rows);
  sortBy("c1", "desc")(view.state, view.dispatch);
  expect(orderedIds(record(view, "tb").rows)).toEqual([...rows].reverse());
  expect(record(view, "tb").sort).toEqual({ col: "c1", dir: "desc" });
  sortBy("c1", "asc")(view.state, view.dispatch);
  expect(orderedIds(record(view, "tb").rows)).toEqual(rows);
  expect(record(view, "tb").sort).toEqual({ col: "c1", dir: "asc" });
  expect(setColumnWidth("c1", 260)(view.state, view.dispatch)).toBe(true);
  expect(record(view, "tb").cols.c1.width).toBe(260);
  expect(setColumnWidth("c1", 220)(view.state, view.dispatch)).toBe(true);
  expect(record(view, "tb").cols.c1.width).toBe(220);

  // The import: the preview lists what the file holds, and Insert writes it where the caret is.
  caret(view, endOf(view, "z"));
  expect(await runPageCommand(view, "importMarkdown", { file: { name: "notes.md", size: IMPORTED.length, text: async () => IMPORTED } })).toEqual({ ok: true, preview: true });
  expect(importPanel()).not.toBeNull();
  importPanel().querySelector('[data-import="insert"]').click();
  expect(await waitFor(() => !importPanel())).toBe(true);
  const imported = orderedIds(blockMap(view.state.doc)).map((id) => blockMap(view.state.doc)[id]).filter((block) => block.c === "Imported" || block.c === "Imported body");
  expect(imported.map((block) => [block.t, block.level ?? null])).toEqual([["heading", 1], ["paragraph", null]]);
  // The TOC is derived: the imported heading is its one entry, and the title is not.
  expect([...view.dom.querySelectorAll(".page-toc nav a")].map((a) => a.textContent)).toEqual(["Imported"]);

  // The touch drag: one block put where it is by a finger on the grip, one move, one order.
  touchLayout(view);
  const before = orderedIds(blockMap(view.state.doc));
  await touchHold(view, before.indexOf("m"));
  gripOf(view).dispatchEvent(pointer("pointermove", { x: 5, y: 3 * ROW + 24 }));
  gripOf(view).dispatchEvent(pointer("pointerup", { x: 5, y: 3 * ROW + 24 }));
  const after = orderedIds(blockMap(view.state.doc));
  expect(after.indexOf("m")).toBe(after.indexOf("e") + 1);
  expect(after.filter((id) => id !== "m")).toEqual(before.filter((id) => id !== "m"));

  await settle();
  return { view, store, binding, journal, channel, gate, adapter, advertised, room };
}

const ROW = 30;
const pointer = (type, props = {}) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: props.x ?? 0, clientY: props.y ?? 0 });
  Object.defineProperty(event, "pointerId", { value: props.pointerId ?? 1 });
  Object.defineProperty(event, "pointerType", { value: props.pointerType ?? "touch" });
  return event;
};
const shellOf = (view) => view.dom.parentElement;
const gripOf = (view) => shellOf(view).querySelector(".page-grip");
// The fake layout the touch test uses: rows of thirty px, and a caret at each block's top.
function touchLayout(view) {
  Object.defineProperty(document, "scrollingElement", { configurable: true, value: document.documentElement });
  let at = 0;
  view.state.doc.forEach((node, _, i) => {
    const dom = view.nodeDOM(at);
    if (dom) dom.getBoundingClientRect = () => ({ left: 0, top: i * ROW, width: 600, height: 20, right: 600, bottom: i * ROW + 20 });
    at += node.nodeSize;
  });
  view.posAtCoords = ({ top }) => {
    const i = Math.max(0, Math.min(Math.floor(top / ROW), view.state.doc.childCount - 1));
    let pos = 0;
    for (let k = 0; k < i; k++) pos += view.state.doc.child(k).nodeSize;
    return { pos: pos + 1, inside: pos };
  };
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
}
const touchHold = async (view, i) => {
  shellOf(view).dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: i * ROW + 2 }));
  gripOf(view).dispatchEvent(pointer("pointerdown", { x: -20, y: i * ROW + 10 }));
  await new Promise((done) => setTimeout(done, 320));
};

// The R harness the format contract uses: R's file opened, its neighbouring paragraph edited
// through the editor, and the checkpoint the next boot takes from the article alone.
const openR = (records) => {
  const model = project(records);
  const article = articleOf(renderModel(model), revOf(model));
  return { model, article, seeded: blocksFromYValue(seedPageFromArticle(article)) };
};
const seedValueOf = (blocks) => {
  const model = project(blocks);
  return seedPageFromArticle(articleOf(renderModel(model), revOf(model)));
};
const editNeighbour = (blocks) => {
  const store = createStore({ name: "page", value: clone(seedValueOf(blocks)) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  cleanups.push(() => { binding.dispose(); binding.ydoc.destroy(); });
  const view = bindingView(binding);
  let neighbour = null;
  view.state.doc.forEach((node, pos) => { if (neighbour === null && node.attrs.id === NEIGHBOUR.id) neighbour = { node, pos }; });
  expect(neighbour).toBeTruthy();
  view.dispatch(view.state.tr.insertText(NEIGHBOUR.add, neighbour.pos + 1 + neighbour.node.textContent.length));
  return blocksFromYValue(yValueOf(binding.ydoc));
};

// A block's place in the order is the writer's own bookkeeping and is re-derived on open;
// everything else in its record is the content these assertions are about. A table keeps its
// rows as ids and cell values, in the order the table holds them.
const withoutPos = ({ id, pos, m, rows, ...rest }) => ({
  ...rest,
  ...(m ? { m: Array.isArray(m[0]) ? m : runsOf(m) } : {}),
  ...(rows ? { rows: orderedIds(rows).map((id) => [id, rows[id].cells]) } : {}),
});
const contentsOf = (records) => orderedIds(records).map((id) => [id, withoutPos(records[id])]);
const ordered = (records) => orderedIds(records).map((id) => [id, records[id]]);

test("the fixture holds one of every feature, each written by one participant once the floor rose", async () => {
  const { view, adapter } = await fixture();
  const records = blockMap(view.state.doc);

  // One admission: every newer-format write in the fixture is the same one participant's,
  // through the one gate, so a feature is never half-written by two.
  expect(adapter.calls.activate).toBe(1);
  expect(adapter.state.floor).toBe(PAGE_FORMAT);

  // One of every feature, in the stored representation the M13 matrix names.
  const marked = (name) => ordered(records).filter(([, block]) => (block.m ?? []).some((key) => String(key).includes(`"${name}"`)));
  const mentions = marked("mention");
  expect(mentions.map(([, block]) => block.c)).toEqual(["Ada Lovelace wrote this"]);
  const dates = marked("date");
  expect(dates).toHaveLength(1);
  expect(dates[0][1].c).toMatch(/^\d{4}-\d{2}-\d{2} $/);
  const emoji = ordered(records).filter(([, block]) => block.c?.includes(EMOJI));
  expect(emoji).toHaveLength(1);
  expect(emoji[0][1].m).toBeUndefined();
  expect(ordered(records).filter(([, block]) => block.t === "toc")).toHaveLength(1);
  expect(records.h.pageIcon).toBe(ICON);
  expect(records.h.pageCoverSrc).toBe(COVER);
  expect(records.h.c).toBe("Notebook");
  const tables = ordered(records).filter(([, block]) => block.t === "table");
  expect(tables).toHaveLength(1);
  expect(tables[0][1].sort).toEqual({ col: "c1", dir: "asc" });
  expect([tables[0][1].cols.c1.width, tables[0][1].cols.c2.width]).toEqual([220, 160]);
  // The imported Markdown block, and the order the touch drag left behind.
  expect(ordered(records).filter(([, block]) => block.c === "Imported" || block.c === "Imported body").map(([, block]) => block.t)).toEqual(["heading", "paragraph"]);
  const order = orderedIds(records);
  expect(order.indexOf("m")).toBe(order.indexOf("e") + 1);
  expect(order.indexOf("m")).toBeGreaterThan(order.indexOf("d"));
});

test("a local edit, a peer's edit and an older writer's neighbour edit leave every feature exactly as it was", async () => {
  const { view, store, binding, room } = await fixture();
  const before = blockMap(view.state.doc);
  const ids = orderedIds(before);

  // The local edit: this tab types at the end of the neighbour line.
  view.dispatch(view.state.tr.insertText(NEIGHBOUR.add, endOf(view, NEIGHBOUR.id)));
  await settle();
  expect(record(view, NEIGHBOUR.id).c).toBe(NEIGHBOUR.c + NEIGHBOUR.add);

  // The peer's edit: a second tab over the same room opens with the same records, writes into
  // the neighbour line, and its work reaches this one the way a room's answer does.
  const peerStore = createStore({ name: "page", value: clone(room.value) });
  const peerDoc = new Y.Doc();
  peerDoc.clientID = 2222;
  const peer = createYPageBinding({ store: peerStore, ydoc: peerDoc, captureTimeout: 0 });
  cleanups.push(() => { peer.dispose(); peer.ydoc.destroy(); });
  room.join("peer", peerStore);
  const peerView = bindingView(peer);
  peerView.dispatch(peerView.state.tr.insertText(" from a peer", endOf(peerView, NEIGHBOUR.id)));
  await settle();
  room.deliver("mine", store);
  await settle();
  expect(record(view, NEIGHBOUR.id).c).toBe(`${NEIGHBOUR.c}${NEIGHBOUR.add} from a peer`);

  // Both participants hold one document: every feature's record is the same in each.
  await settle();
  const mine = blocksFromYValue(yValueOf(binding.ydoc));
  const theirs = blocksFromYValue(yValueOf(peer.ydoc));
  for (const id of ids) if (id !== NEIGHBOUR.id) expect(withoutPos(theirs[id])).toEqual(withoutPos(mine[id]));
  expect(withoutPos(theirs[NEIGHBOUR.id])).toEqual(withoutPos(mine[NEIGHBOUR.id]));

  // The older writer: R's file is this fixture's records. It edits the neighbour and keeps
  // every feature it has no schema for, and the record comes back whole.
  const { seeded } = openR(before);
  expect(Object.keys(seeded)).toEqual(ids);
  expect(contentsOf(seeded)).toEqual(contentsOf(before));
  const rSaved = project(editNeighbour(seeded));
  const rReopened = parseModel(articleOf(renderModel(rSaved), revOf(rSaved)));
  expect(rReopened.map((item) => item.id)).toEqual(ids);
  const rMap = Object.fromEntries(rReopened.map((item) => [item.id, item]));
  const live = new Map(project(before).map((item) => [item.id, item]));
  for (const id of ids) if (id !== NEIGHBOUR.id) expect(withoutPos(rMap[id])).toEqual(withoutPos(live.get(id)));
  expect(rReopened.find((item) => item.id === NEIGHBOUR.id).c).toBe(NEIGHBOUR.c + NEIGHBOUR.add);
});

test("the saved file without its live tags reopens to the same records, through two view and edit switches", async () => {
  const { view, store } = await fixture();
  view.dispatch(view.state.tr.insertText(NEIGHBOUR.add, endOf(view, NEIGHBOUR.id)));
  await settle();
  const before = blockMap(view.state.doc);

  // The save: the article this writer renders, and the page value the editor captures from it.
  const model = project(before);
  const inner = renderModel(model);
  const rev = revOf(model);
  const value = clone(seedPageFromArticle(articleOf(inner, rev)));
  const file = fileOf(inner, rev, value);
  expect(liveTags(file).map((tag) => tag.name)).toEqual(["page"]);

  // The live tags stripped: the article alone is the whole document.
  const stripped = fileOf(inner, rev, value).replace(/<script[\s\S]*?<\/script>/g, "");
  expect(liveTags(stripped)).toEqual([]);

  const reopenedStore = createStore({ name: "page", value: clone(seedPageFromArticle(articleOf(inner, rev))) });
  const ydoc = new Y.Doc();
  ydoc.clientID = 3333;
  const binding = createYPageBinding({ store: reopenedStore, ydoc, captureTimeout: 0 });
  const reopened = openEditor(binding);
  await settle(2);

  // Exact semantic equality: the same records, in the same order, with the place the file
  // states rather than the one the live session had.
  expect(contentsOf(blockMap(reopened.state.doc))).toEqual(contentsOf(before));
  expect(orderedIds(blockMap(reopened.state.doc))).toEqual(orderedIds(before));

  // Two switches out of and back into edit: the records never change, and nothing a picker
  // left behind survives the exit.
  for (let round = 0; round < 2; round++) {
    expect(setEditorActive(reopened, false)).toBe(false);
    expect(pickerEl()).toBeNull();
    expect(setEditorActive(reopened, true)).toBe(true);
    await settle(2);
    expect(contentsOf(blockMap(reopened.state.doc))).toEqual(contentsOf(before));
  }
  // And the commands still are there to run: the reopened page exports, on demand.
  expect(await runPageCommand(reopened, "exportMarkdown")).toEqual({ ok: true, preview: true });
  expect(document.querySelector(".page-export-preview")).not.toBeNull();
});

test("both exports carry the fixture: the Markdown extensions and a copy with nothing left to load", async () => {
  const { view } = await fixture();
  const records = blockMap(view.state.doc);
  const date = records.d.c.slice(0, 10);

  // Markdown: what the format cannot say is written as semantic HTML and listed.
  expect(await runPageCommand(view, "exportMarkdown")).toEqual({ ok: true, preview: true });
  const panel = document.querySelector(".page-export-preview");
  expect([...panel.querySelectorAll(".page-export-extensions .page-export-row")].map((row) => row.textContent)).toEqual(["Page icon", "Page cover", "Table of contents"]);
  const losses = [...panel.querySelectorAll(".page-export-losses .page-export-row")].map((row) => row.textContent);
  // The mention is a named loss (its label is all Markdown keeps); a date is its ISO text,
  // and the table's widths and sort are the two constructs Markdown cannot state.
  expect(losses).toEqual(["mention", "column width", "sort"]);

  // The download is the file, and it holds the label, the ISO day and the three extensions.
  const anchors = [];
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { anchors.push(this); });
  const blobs = [];
  URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:export"; };
  URL.revokeObjectURL = () => {};
  panel.querySelector('[data-export="download"]').click();
  await settle();
  // The Markdown file is named for the page, as the editable download always was.
  expect(anchors[0].download).toBe("notes.md");
  const text = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blobs[0]);
  });
  expect(text).toContain(ADA.name);
  expect(text).toContain(date);
  expect(text).toContain("<header");
  expect(text).toContain('data-page-icon aria-hidden="true"');
  expect(text).toContain('data-type="toc"');
  expect(text).toContain("Imported body");

  // The reading copy: one static file, the icon and cover on the title, the TOC as links.
  const original = globalThis.fetch;
  const asked = [];
  globalThis.fetch = (url) => { asked.push(String(url)); return Promise.resolve(respond("cover")); };
  try {
    const answer = await runPageCommand(view, "exportHtml");
    expect(answer).toMatchObject({ ok: true, title: "Notebook", name: "Notebook.html" });
    expect(asked).toEqual(["https://example.com/uploads/cover.png"]);
    const copy = document.querySelector(".page-export-panel");
    expect(copy.querySelectorAll(".page-export-losses li")).toHaveLength(0);
    copy.querySelector('[data-act="download"]').click();
    await settle();
  } finally {
    globalThis.fetch = original;
  }
  expect(anchors[anchors.length - 1].download).toBe("Notebook.html");
  const html = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blobs[blobs.length - 1]);
  });
  const page = new DOMParser().parseFromString(html, "text/html");
  const header = page.querySelector("article header[data-page-heading]");
  expect(header.querySelector("h1").textContent).toBe("Notebook");
  expect(header.querySelector("[data-page-icon]").textContent).toBe(ICON);
  expect(header.querySelector("img[data-page-cover]").getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  expect(page.querySelector("article").textContent).toContain("Imported body");
  expect(page.querySelector("script")).toBeNull();
  expect(remoteDependencies(html)).toEqual([]);
});

test("M11's journal and M12's provider stay inside the caps their own tests assert", async () => {
  const { view, binding, channel, journal, store } = await fixture();
  const edits = 70;
  for (let i = 0; i < edits; i++) {
    view.dispatch(view.state.tr.insertText("x", endOf(view, NEIGHBOUR.id)));
  }
  expect(await waitFor(() => channel.compactions.length > 0)).toBe(true);

  // The journal compacts at sixty-four batches and retires the ones it named.
  expect(channel.compactions[0]).toHaveLength(64);
  expect(journal.names().length).toBeLessThanOrEqual(64);

  // The provider's coverage memo and its live-reference set stay what the long session caps.
  const diag = binding.provider._diagnostics();
  const retained = Object.keys(store.value.y).length + Object.keys(store.authoritative.y).length;
  expect(diag.cover).toBeLessThanOrEqual(COVER_MAX);
  expect(diag.known).toBeLessThanOrEqual(retained + diag.fold);
  const keys = Object.keys(store.authoritative.y);
  const folds = new Set(keys.filter((key) => key[0] === "m").map((key) => key.split(".")[0]));
  expect(folds.size).toBeLessThanOrEqual(1);
  expect(keys.filter((key) => key[0] !== "m").length).toBeLessThanOrEqual(LOOSE_MAX);
});

test("a plain document fetches no command module, and each row loads once, on its ask", async () => {
  const loads = new Map();
  for (const [id, row] of Object.entries(COMMAND_FEATURES)) {
    loads.set(id, 0);
    jest.spyOn(row, "load").mockImplementation(() => {
      loads.set(id, loads.get(id) + 1);
      return Promise.resolve({ createFeature: () => ({ run: () => ({ ok: true, ran: id }), dispose() {} }) });
    });
  }

  // The control: a plain document, typed in, switched out of edit and back, saved.
  const plain = editor([["a", "paragraph", "First line"], ["z", "paragraph", NEIGHBOUR.c]]);
  plain.dispatch(plain.state.tr.insertText(" still plain", endOf(plain, "a")));
  setEditorActive(plain, false);
  setEditorActive(plain, true);
  await settle();
  expect([...loads.entries()]).toEqual(Object.keys(COMMAND_FEATURES).map((id) => [id, 0]));
  expect(plain.state.doc.textContent).toBe(`First line still plain${NEIGHBOUR.c}`);

  // Each row is fetched on the ask, once, and no other row comes with it.
  const asked = new Set();
  for (const id of Object.keys(COMMAND_FEATURES)) {
    expect(await runPageCommand(plain, id, {})).toEqual({ ok: true, ran: id });
    asked.add(id);
    expect([...loads.entries()]).toEqual(Object.keys(COMMAND_FEATURES).map((other) => [other, asked.has(other) ? 1 : 0]));
  }
});
