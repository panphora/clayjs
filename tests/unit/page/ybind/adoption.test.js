import { jest } from "@jest/globals";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { blockMap, identityPlugin } from "../../../../src/page/model.js";
import { structurePlugin } from "../../../../src/page/blocks.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { project, renderModel, revOf, fragmentCleaner } from "../../../../src/page/projection.js";
import { shapeOf } from "../../../../src/page/ybind/bridge.js";
import { ADOPT, classifyFile, planAdoption, adoptionTransaction } from "../../../../src/page/adopt.js";
import { readFile, installAdoption } from "../../../../src/page/adopt-boot.js";
import { createYPageBinding, migrateHybridValues, blocksFromYValue, YDecodeError } from "../../../../src/page/ybind/index.js";

globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};
const clone = (value) => JSON.parse(JSON.stringify(value));
const record = { blocks: {
  h1: { t: "heading", pos: "1", level: 1, c: "Quarterly notes" },
  p1: { t: "paragraph", pos: "2", c: "Revenue grew and costs stayed flat." },
  p2: { t: "paragraph", pos: "3", c: "Keep me exactly as I am." },
  p3: { t: "paragraph", pos: "4", c: "Delete me from the article." },
} };
let opened, controllers, value;
beforeEach(() => { opened = []; controllers = []; value = migrateHybridValues([record]); });
afterEach(() => {
  for (const controller of controllers) controller.dispose();
  for (const { view, binding, mount } of opened) { view.destroy(); binding.dispose(); binding.ydoc.destroy(); mount.remove(); }
  jest.restoreAllMocks();
});

function file(edit = () => {}, from = value) {
  const model = project(blocksFromYValue(from));
  const doc = document.implementation.createHTMLDocument("");
  const tag = doc.createElement("script");
  tag.type = "application/json";
  tag.setAttribute("merge", "page");
  tag.setAttribute("clay", "live");
  tag.textContent = JSON.stringify(from);
  doc.head.appendChild(tag);
  const article = doc.createElement("article");
  article.setAttribute("data-page", "1");
  article.setAttribute("data-rev", revOf(model));
  article.innerHTML = renderModel(model, { clean: fragmentCleaner(doc) });
  doc.body.appendChild(article);
  edit(article);
  return { ...readFile(doc), html: "<!DOCTYPE html>" + doc.documentElement.outerHTML };
}
const handEdit = (article) => { article.querySelector('[data-id="p1"]').textContent = "Revenue fell and costs stayed flat."; };
const classify = (source) => classifyFile(source.article, source.tags);
function open() {
  const store = createStore({ name: "page", value: clone(value) });
  const binding = createYPageBinding({ store });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [structurePlugin(), identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  const tab = { store, binding, mount, view };
  opened.push(tab);
  return tab;
}
const blocks = (tab) => blockMap(tab.view.state.doc);
const append = (tab, id, text) => {
  let end;
  tab.view.state.doc.forEach((node, offset) => { if (node.attrs.id === id) end = offset + node.nodeSize - 1; });
  if (end === undefined) throw new Error(`Missing block ${id}`);
  tab.view.dispatch(tab.view.state.tr.insertText(text, end));
};
const relay = (from, to) => to.store.rebase(clone(from.store.value), { source: "remote" });
function install(tab, source, options = {}) {
  const events = { holds: 0, releases: 0, checkpoints: 0, notices: [] };
  const controller = installAdoption({ view: tab.view, source,
    hold: () => events.holds++, release: () => events.releases++,
    requestCheckpoint: () => events.checkpoints++, notice: (notice) => events.notices.push(notice), ...options });
  controllers.push(controller);
  return { controller, events };
}

test("Yjs source classification retains the revision triangle and decoded base", () => {
  expect(classify(file()).kind).toBe("untouched");
  const found = classify(file(handEdit));
  expect(found.kind).toBe("adopt");
  expect(found.base).toEqual(blocksFromYValue(value));
  expect([...planAdoption(found.base, found.parsed, found.baseItems).edited.keys()]).toEqual(["p1"]);
  const peer = open();
  append(peer, "p2", " peer");
  const snapshot = file();
  snapshot.tags = [peer.store.value];
  expect(classify(snapshot).kind).toBe("untouched");
  const both = file(handEdit);
  both.tags = [peer.store.value];
  expect(classify(both).kind).toBe("unbased");
  expect(classify(file(() => {}, peer.store.value)).kind).toBe("untouched");
});

test.each([
  ["malformed JSON", () => [null]],
  ["unknown version", () => [{ v: 2, y: {} }]],
  ["invalid update", () => [{ v: 1, y: { seed: "not base64!" } }]],
  ["missing part", () => [{ v: 1, y: { "seed.0.2": value.y[Object.keys(value.y)[0]] } }]],
  ["mixed formats", () => [value, record]],
])("%s refuses classification instead of adopting against an empty base", (_name, values) => {
  expect(() => classifyFile(file(handEdit).article, values())).toThrow(YDecodeError);
});

test("the article wins changed blocks and records edited and deleted peer versions", async () => {
  const source = file((article) => {
    handEdit(article);
    article.querySelector('[data-id="p3"]').remove();
    article.insertAdjacentHTML("beforeend", "<p>Agent paragraph.</p>");
  });
  const tab = open(), peer = open();
  append(peer, "p1", " (peer note)");
  append(peer, "p2", " Kept peer edit.");
  append(peer, "p3", " PEER-TYPED");
  peer.view.dispatch(peer.view.state.tr.insert(peer.view.state.doc.content.size,
    schema.nodes.paragraph.create({ id: "peer", pos: null }, schema.text("Peer-created block"))));
  relay(peer, tab);
  const before = shapeOf(tab.view.state.doc);
  const found = classify(source);
  const transaction = adoptionTransaction(tab.view.state, planAdoption(found.base, found.parsed, found.baseItems));
  expect(transaction.getMeta(ADOPT).displaced.p3.c).toBe("Delete me from the article. PEER-TYPED");
  const { controller, events } = install(tab, source);
  await controller.idle();
  const after = blocks(tab);
  expect(after.p1.c).toBe("Revenue fell and costs stayed flat.");
  expect(after.p2.c).toBe("Keep me exactly as I am. Kept peer edit.");
  expect(after.p3).toBeUndefined();
  expect(after.peer.c).toBe("Peer-created block");
  expect(Object.values(after).find((block) => block.c?.startsWith("Agent paragraph.")).c).toBe("Agent paragraph.");
  expect(events.notices).toHaveLength(1);
  expect(events.notices[0].displaced.p1.c).toBe("Revenue grew and costs stayed flat. (peer note)");
  expect(events.notices[0].displaced.p3.c).toBe("Delete me from the article. PEER-TYPED");
  expect([events.holds, events.releases, events.checkpoints]).toEqual([1, 1, 1]);
  expect(tab.binding.stats.mismatch).toBe(0);
  expect(project(blocksFromYValue(tab.store.value))).toEqual(project(after));
  const afterShape = shapeOf(tab.view.state.doc);
  relay(tab, peer);
  expect(shapeOf(peer.view.state.doc)).toBe(afterShape);
  expect(tab.binding.undo()).toBe(true);
  expect(shapeOf(tab.view.state.doc)).toBe(before);
  expect(tab.binding.redo()).toBe(true);
  expect(shapeOf(tab.view.state.doc)).toBe(afterShape);
});

test("typing before and after adoption stays in separate Yjs undo groups", async () => {
  const tab = open();
  append(tab, "p2", " before");
  const { controller } = install(tab, file(handEdit));
  await controller.idle();
  append(tab, "p2", " after");
  expect(tab.binding.undo()).toBe(true);
  expect(blocks(tab).p2.c).toBe(record.blocks.p2.c + " before");
  expect(blocks(tab).p1.c).toBe("Revenue fell and costs stayed flat.");
  expect(tab.binding.undo()).toBe(true);
  expect(blocks(tab).p1.c).toBe(record.blocks.p1.c);
  expect(blocks(tab).p2.c).toBe(record.blocks.p2.c + " before");
  expect(tab.binding.undo()).toBe(true);
  expect(blocks(tab).p2.c).toBe(record.blocks.p2.c);
});

test("a non-writer never holds or adopts the Yjs source", async () => {
  const tab = open();
  const { controller, events } = install(tab, file(handEdit), { isAdopter: () => false });
  await controller.idle();
  expect(events).toEqual({ holds: 0, releases: 0, checkpoints: 0, notices: [] });
  expect(tab.store.pending).toEqual([]);
});

test("composition waiting rechecks the elected writer before dispatch", async () => {
  const tab = open();
  let done, writer = true;
  const idle = new Promise((resolve) => { done = resolve; });
  const { controller, events } = install(tab, file(handEdit), { idle: () => idle, isAdopter: () => writer });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect([events.holds, events.releases]).toEqual([1, 0]);
  expect(tab.store.pending).toEqual([]);
  writer = false;
  done();
  await controller.idle();
  expect([events.holds, events.releases, events.checkpoints]).toEqual([1, 1, 0]);
  expect(tab.store.pending).toEqual([]);
});

test.each(["timeout", "dispose"])("%s releases the adoption hold without writing", async (mode) => {
  const tab = open();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const { controller, events } = install(tab, file(handEdit), { ready: new Promise(() => {}), holdMs: 20 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(events.holds).toBe(1);
  if (mode === "dispose") controller.dispose();
  await controller.idle();
  expect([events.releases, events.checkpoints]).toEqual([1, 0]);
  expect(tab.store.pending).toEqual([]);
});

test("invalid source data leaves the document intact and reports the decode failure", async () => {
  const tab = open();
  const source = file(handEdit);
  source.tags = [null];
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  const { controller, events } = install(tab, source);
  await controller.idle();
  expect(error).toHaveBeenCalledWith("page: adoption failed", expect.any(YDecodeError));
  expect(events.holds).toBe(0);
  expect(tab.store.pending).toEqual([]);
  expect(blocks(tab).p1.c).toBe(record.blocks.p1.c);
});

test("repeated source frames are adopted only once", async () => {
  const tab = open();
  const source = file(handEdit);
  const { controller, events } = install(tab, null);
  for (let i = 0; i < 2; i++) {
    document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: source.html } }));
    await controller.idle();
  }
  expect([events.holds, events.releases, events.checkpoints]).toEqual([1, 1, 1]);
  expect(events.notices).toHaveLength(1);
  expect(blocks(tab).p1.c).toBe("Revenue fell and costs stayed flat.");
});
