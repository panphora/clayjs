const S = "../../../src";
globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};
const { createStore } = await import(`${S}/live/store.js`);
const { blockMap, identityPlugin } = await import(`${S}/page/model.js`);
const { structurePlugin } = await import(`${S}/page/blocks.js`);
const { state: pmState, view: pmView } = await import(`${S}/vendor/prosemirror.vendor.js`);
const { project, renderModel, revOf, fragmentCleaner } = await import(`${S}/page/projection.js`);
const { installAdoption } = await import(`${S}/page/adopt-boot.js`);
const { createYPageBinding, migrateHybridValues, blocksFromYValue } = await import(`${S}/page/ybind/index.js`);
const clone = (v) => JSON.parse(JSON.stringify(v));
const record = { blocks: { h1: { t: "heading", pos: "1", level: 1, c: "Quarterly notes" }, p1: { t: "paragraph", pos: "2", c: "Revenue grew and costs stayed flat." } } };
const value = migrateHybridValues([record]);
function open() {
  const store = createStore({ name: "page", value: clone(value) });
  const binding = createYPageBinding({ store });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, { state: pmState.EditorState.create({ doc: binding.doc(), plugins: [structurePlugin(), identityPlugin()] }), dispatchTransaction: (tr) => binding.dispatch(tr) });
  binding.attach(view);
  return { store, binding, view };
}
const relay = (from, to) => to.store.rebase(clone(from.store.value), { source: "remote" });
const taglessFile = (edit) => {
  const model = project(blocksFromYValue(value));
  const doc = document.implementation.createHTMLDocument("");
  const article = doc.createElement("article");
  article.setAttribute("data-page", "1");
  article.setAttribute("data-rev", revOf(model));
  article.innerHTML = renderModel(model, { clean: fragmentCleaner(doc) });
  doc.body.appendChild(article);
  edit?.(article);
  return { html: "<!DOCTYPE html>" + doc.documentElement.outerHTML, article: article.cloneNode(true), tags: [value] };
};
const outsideText = "Revenue fell sharply and costs stayed flat.";
const outsideEdit = (art) => { art.querySelector('[data-id="p1"]').textContent = outsideText; };
const quiet = { mergeTagless: true, hold() {}, release() {}, notice() {} };

test("on a host with no rooms, only the elected writer merges an outside edit, so it lands once", async () => {
  const a = open(), b = open();
  const boot = taglessFile();
  const ca = installAdoption({ ...quiet, view: a.view, source: { article: boot.article, tags: boot.tags }, isAdopter: () => true, writerReady: async () => {} });
  const cb = installAdoption({ ...quiet, view: b.view, source: { article: boot.article.cloneNode(true), tags: boot.tags }, isAdopter: () => false, writerReady: async () => {} });
  await ca.idle(); await cb.idle();
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "disk", html: taglessFile(outsideEdit).html } }));
  await ca.idle(); await cb.idle();
  relay(a, b); relay(b, a);
  expect(blockMap(a.view.state.doc).p1.c).toBe(outsideText);
  expect(blockMap(b.view.state.doc).p1.c).toBe(outsideText);
  ca.dispose(); cb.dispose();
});

test("an outside edit still merges when the editor never settles", async () => {
  const a = open();
  const boot = taglessFile();
  const ca = installAdoption({ ...quiet, view: a.view, source: { article: boot.article, tags: boot.tags }, isAdopter: () => true, ready: new Promise(() => {}), holdMs: 20 });
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "disk", html: taglessFile(outsideEdit).html } }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(blockMap(a.view.state.doc).p1.c).toBe(outsideText);
  ca.dispose();
});
