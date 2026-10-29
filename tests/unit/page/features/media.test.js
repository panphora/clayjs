import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { state as pmState, history } from "../../../../src/vendor/prosemirror.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { blockMap } from "../../../../src/page/model.js";
import { schema } from "../../../../src/page/schema.js";
import { project, renderModel, fragmentCleaner } from "../../../../src/page/projection.js";
import { createPageEditor, installPageFeature } from "../../../../src/page/editor.js";
import { createFeatureLoader } from "../../../../src/page/feature-loader.js";
import { FEATURES } from "../../../../src/page/features/registry.js";
import { pickFiles, hostPlace } from "../../../../src/page/media.js";
import { mediaViews } from "../../../../src/page/media-views.js";
import { createYPageBinding, seedValue, blocksFromYValue, enc } from "../../../../src/page/ybind/index.js";

const { TextSelection } = pmState;

const PARAGRAPH = { pos: "V", t: "paragraph", c: "Hi " };
const IMAGE = { pos: "W", t: "image", c: "", src: "/a.png", alt: "A door", caption: "Front door" };
const FILE = { pos: "W", t: "file", c: "", src: "/a.pdf", name: "a.pdf", size: 2048, mime: "application/pdf" };

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
const track = (view, mount, binding = null) => {
  cleanups.push(() => {
    if (!view.isDestroyed) view.destroy();
    mount.remove();
    binding?.binding?.dispose();
    binding?.binding?.ydoc?.destroy();
  });
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};
// Every upload is recorded, so a test can read back the bytes of the file that arrived.
const recordingUpload = () => {
  const calls = [];
  const upload = (file) => {
    calls.push(file);
    return Promise.resolve({ ok: true, uploads: [{ url: `/uploads/${calls.length}-${file.name}` }] });
  };
  return { upload, calls };
};
const bytesOf = (file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.readAsText(file);
});
const realLoad = (id) => FEATURES[id].load();
const file = (name = "a.png", type = "image/png", body = "hello") => new File([body], name, { type });

const open = (blocks, { load = realLoad, upload = recordingUpload().upload } = {}) => {
  const calls = [];
  const reports = [];
  const holder = { view: null };
  const features = createFeatureLoader({
    load: (id) => { calls.push(id); return load(id); },
    install: (id, mod) => installPageFeature({ view: holder.view, upload }, id, mod),
    reportError: (error) => { reports.push(error); },
  });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks, features, upload });
  holder.view = view;
  track(view, mount);
  return { view, calls, reports, features };
};

const openTab = (initial, { load = realLoad, upload = recordingUpload().upload } = {}) => {
  const store = createStore({ name: "page", value: initial });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const calls = [];
  const reports = [];
  const holder = { view: null };
  const features = createFeatureLoader({
    load: (id) => { calls.push(id); return load(id); },
    install: (id, mod) => installPageFeature({ view: holder.view, upload }, id, mod),
    reportError: (error) => { reports.push(error); },
  });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { doc: binding.doc(), dispatch: binding.dispatch, history: false, undo: binding.undo, redo: binding.redo, features, upload });
  holder.view = view;
  binding.attach(view);
  track(view, mount, { binding });
  return { store, binding, view, calls, reports };
};

const media = (view) => {
  const found = [];
  view.state.doc.forEach((node) => { if (node.type.name === "image" || node.type.name === "file") found.push(node); });
  return found;
};
const images = (view) => media(view).filter((node) => node.type.name === "image");
const savedHtml = (view) => renderModel(project(blockMap(view.state.doc)), { fallbackOf: () => "", clean: fragmentCleaner(document) });
const typeIn = (view, pos, text) => view.dispatch(view.state.tr.insertText(text, pos));
const coords = { left: 40, right: 48, top: 100, bottom: 120 };
const slash = (view) => {
  view.coordsAtPos = () => coords;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size - 1)));
  const { from, to } = view.state.selection;
  view.someProp("handleTextInput", (handler) => handler(view, from, to, "/", () => view.state.tr.insertText("/", from, to)));
  return view.dom.parentElement.querySelector(".page-menu");
};
const pick = (menu, label) => [...menu.querySelectorAll(".page-menu-item")].find((row) => row.querySelector(".page-menu-label")?.textContent === label);
const clip = (files, html = "") => ({ files, getData: (type) => (type === "text/html" ? html : "") });
const paste = (view, data) => {
  const event = { clipboardData: data, preventDefault() { event.defaultPrevented = true; } };
  const taken = view.someProp("handlePaste", (fn) => fn(view, event, null));
  return { taken: !!taken, prevented: !!event.defaultPrevented };
};
const drop = (view, files) => {
  const restore = { posAtCoords: view.posAtCoords };
  view.posAtCoords = () => ({ pos: 1, inside: -1 });
  const event = { dataTransfer: { files }, clientX: 5, clientY: 2, preventDefault() { event.defaultPrevented = true; } };
  try {
    const taken = view.someProp("handleDrop", (fn) => fn(view, event, null, false));
    return { taken: !!taken, prevented: !!event.defaultPrevented };
  } finally {
    view.posAtCoords = restore.posAtCoords;
  }
};

test("a text-only document's editor boots without loading the media view part", async () => {
  const { view, calls } = open({ p: PARAGRAPH });
  expect(calls).toEqual([]);
  await flush();
  expect(calls).toEqual([]);
  expect(view.dom.querySelector("figure.page-image")).toBe(null);
});

test("opening the slash menu loads nothing", async () => {
  const { view, calls } = open({ p: PARAGRAPH });
  const menu = slash(view);
  expect(menu.hidden).toBe(false);
  pick(menu, "Image");
  await flush();
  expect(calls).toEqual([]);
});

test("a document with an image boots with the media view part loaded", async () => {
  const { view, calls } = open({ p: PARAGRAPH, img: IMAGE });
  expect(calls).toEqual(["media"]);
  expect(view.dom.querySelector("figure.page-image")).toBe(null);
  expect(await waitFor(() => view.dom.querySelector("figure.page-image"))).toBe(true);
  const img = view.dom.querySelector("figure.page-image img");
  expect([img.getAttribute("src"), img.alt]).toEqual(["/a.png", "A door"]);
  expect(view.dom.querySelector("figure.page-image .page-image-caption").textContent).toBe("Front door");
});

test("a document with a file boots with the media view part loaded", async () => {
  const { view, calls } = open({ p: PARAGRAPH, doc: FILE });
  expect(calls).toEqual(["media"]);
  expect(view.dom.querySelector(".page-file .page-file-icon")).toBe(null);
  expect(await waitFor(() => view.dom.querySelector(".page-file .page-file-icon"))).toBe(true);
  const link = view.dom.querySelector(".page-file a.page-file-link");
  expect(link.getAttribute("href")).toBe("/a.pdf");
  expect(view.dom.querySelector(".page-file-name").textContent).toBe("a.pdf");
});

test("a pasted image file inserts exactly one image once media loads, with the file's bytes", async () => {
  const up = recordingUpload();
  const { view, calls } = open({ p: PARAGRAPH }, { upload: up.upload });
  expect(calls).toEqual([]);
  const { taken, prevented } = paste(view, clip([file("paste.png", "image/png", "pasted bytes")]));
  expect([taken, prevented]).toEqual([true, true]);
  expect(images(view)).toHaveLength(0);
  expect(calls).toEqual(["media"]);
  expect(await waitFor(() => images(view).length === 1)).toBe(true);
  expect(calls).toEqual(["media"]);
  expect(images(view)).toHaveLength(1);
  expect(images(view)[0].attrs.src).toBe("/uploads/1-paste.png");
  expect(up.calls.map((f) => f.name)).toEqual(["paste.png"]);
  expect(await bytesOf(up.calls[0])).toBe("pasted bytes");
  expect(await waitFor(() => view.dom.querySelector("figure.page-image img")?.getAttribute("src") === "/uploads/1-paste.png")).toBe(true);
});

test("a dropped file inserts exactly one file block once media loads, with the file's bytes", async () => {
  const up = recordingUpload();
  const { view, calls } = open({ p: PARAGRAPH }, { upload: up.upload });
  expect(calls).toEqual([]);
  const { taken, prevented } = drop(view, [file("drop.pdf", "application/pdf", "dropped bytes")]);
  expect([taken, prevented]).toEqual([true, true]);
  expect(media(view)).toHaveLength(0);
  expect(calls).toEqual(["media"]);
  expect(await waitFor(() => media(view).length === 1)).toBe(true);
  expect(media(view)).toHaveLength(1);
  const [block] = media(view);
  expect(block.type.name).toBe("file");
  expect([block.attrs.name, block.attrs.src]).toEqual(["drop.pdf", "/uploads/1-drop.pdf"]);
  expect(await bytesOf(up.calls[0])).toBe("dropped bytes");
});

test("the picker copies the chosen files before the view part loads", async () => {
  const up = recordingUpload();
  const { view, calls } = open({ p: PARAGRAPH }, { upload: up.upload });
  const input = view.dom.parentElement.querySelector(".page-file-input");
  input.click = () => {};
  expect(pickFiles(view, "image/*", hostPlace(view.state, 0))).toBe(true);
  let reads = 0;
  Object.defineProperty(input, "files", { configurable: true, get: () => (reads++ ? [] : [file("pick.png")]) });
  input.dispatchEvent(new Event("change"));
  expect(reads).toBe(1);
  expect(calls).toEqual(["media"]);
  expect(await waitFor(() => images(view).length === 1)).toBe(true);
  expect(images(view)[0].attrs.src).toBe("/uploads/1-pick.png");
  expect(await bytesOf(up.calls[0])).toBe("hello");
});

test("a pick made before the view part loads keeps text typed during the load and inserts one image", async () => {
  let releaseLoad, releaseUpload;
  const loadGate = new Promise((resolve) => { releaseLoad = resolve; });
  const uploadGate = new Promise((resolve) => { releaseUpload = resolve; });
  const up = recordingUpload();
  const { view } = open(
    { a: { pos: "V", t: "paragraph", c: "Hello world" }, b: { pos: "W", t: "paragraph", c: "" } },
    { load: () => loadGate.then(() => realLoad("media")), upload: (f) => uploadGate.then(() => up.upload(f)) },
  );
  const input = view.dom.parentElement.querySelector(".page-file-input");
  input.click = () => {};
  const menu = slash(view);
  pick(menu, "Image").click();
  let reads = 0;
  Object.defineProperty(input, "files", { configurable: true, get: () => (reads++ ? [] : [file("pick.png", "image/png", "picked bytes")]) });
  input.dispatchEvent(new Event("change"));
  expect(reads).toBe(1);
  typeIn(view, 1, "ABC");
  expect(view.state.doc.child(0).textContent).toBe("ABCHello world");
  releaseLoad();
  expect(await waitFor(() => view.dom.querySelector(".page-upload"))).toBe(true);
  releaseUpload();
  expect(await waitFor(() => images(view).length === 1)).toBe(true);
  const texts = [];
  view.state.doc.forEach((node) => { if (node.type.name === "paragraph") texts.push(node.textContent); });
  expect(texts[0]).toBe("ABCHello world");
  expect(texts.filter((text) => text !== "ABCHello world")).toEqual([]);
  expect(images(view)).toHaveLength(1);
  expect(images(view)[0].attrs.src).toBe("/uploads/1-pick.png");
  expect(await bytesOf(up.calls[0])).toBe("picked bytes");
});

test("a paste made before the view part loads lands after the block it was pasted into", async () => {
  let releaseLoad, releaseUpload;
  const loadGate = new Promise((resolve) => { releaseLoad = resolve; });
  const uploadGate = new Promise((resolve) => { releaseUpload = resolve; });
  const up = recordingUpload();
  const { view } = open(
    { one: { pos: "V", t: "paragraph", c: "One" }, two: { pos: "W", t: "paragraph", c: "Two" } },
    { load: () => loadGate.then(() => realLoad("media")), upload: (f) => uploadGate.then(() => up.upload(f)) },
  );
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size - 3)));
  const { taken } = paste(view, clip([file("later.png")]));
  expect(taken).toBe(true);
  view.dispatch(view.state.tr.insert(0, schema.nodes.paragraph.create({ id: "zero", pos: "9" }, schema.text("Zero"))));
  releaseLoad();
  releaseUpload();
  expect(await waitFor(() => images(view).length === 1)).toBe(true);
  const blocks = [];
  view.state.doc.forEach((node) => blocks.push(node.type.name === "paragraph" ? node.textContent : node.type.name));
  expect(blocks).toEqual(["Zero", "One", "Two", "image"]);
});

test("destroying one editor keeps another editor\u2019s bookmark drawing", async () => {
  const never = () => new Promise(() => {});
  const first = open({ p: PARAGRAPH }, { upload: never });
  const second = open({ p: PARAGRAPH }, { upload: never });
  paste(first.view, clip([file("first.png")]));
  paste(second.view, clip([file("second.png")]));
  expect(await waitFor(() => first.view.dom.querySelector(".page-upload"))).toBe(true);
  expect(await waitFor(() => second.view.dom.querySelector(".page-upload"))).toBe(true);
  second.view.destroy();
  typeIn(first.view, 1, "x");
  await flush();
  expect(first.view.dom.querySelector(".page-upload")).not.toBe(null);
});

// The registry is keyed per editor by a weak reference: a dropped editor's views are
// collectable, so a long-lived page does not keep every editor it ever opened alive.
test("the bookmark renderer registry holds each editor weakly and forgets one on dispose", async () => {
  const never = () => new Promise(() => {});
  const first = open({ p: PARAGRAPH }, { upload: never });
  const second = open({ p: PARAGRAPH }, { upload: never });
  paste(first.view, clip([file("first.png")]));
  paste(second.view, clip([file("second.png")]));

  expect(await waitFor(() => mediaViews.get(first.view) && mediaViews.get(second.view))).toBe(true);
  expect(mediaViews).toBeInstanceOf(WeakMap);

  second.view.destroy();
  second.features.dispose("media");
  expect(mediaViews.get(second.view)).toBeUndefined();
  expect(mediaViews.get(first.view)).toBeTruthy();
});

test("an image that arrives from a peer loads the view part", async () => {
  const initial = seedValue([{ id: "p", text: "Hi " }]);
  const a = openTab(JSON.parse(JSON.stringify(initial)));
  const b = openTab(JSON.parse(JSON.stringify(initial)));
  expect(b.calls).toEqual([]);
  a.view.dispatch(a.view.state.tr.insert(1, schema.nodes.image.create({ id: "img", pos: "A", src: "/peer.png" })));
  const value = enc(Y.encodeStateAsUpdateV2(a.binding.ydoc, Y.encodeStateVector(b.binding.ydoc)));
  const base = b.store.authoritative;
  b.store.rebase({ ...base, y: { ...base.y, "peer-1": value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", "peer-1"], value }] } });
  expect(b.calls).toEqual(["media"]);
  expect(await waitFor(() => b.view.dom.querySelector("figure.page-image img")?.getAttribute("src") === "/peer.png")).toBe(true);
  expect(images(b.view)).toHaveLength(1);
});

test("a failed load leaves the text editable and the image's src intact", async () => {
  const { view, reports } = open({ p: PARAGRAPH, img: IMAGE }, { load: () => Promise.reject(new Error("no network")) });
  await flush();
  await flush();
  expect(reports).toHaveLength(1);
  expect(view.dom.querySelector("figure.page-image")).toBe(null);
  expect(view.dom.querySelector('figure[data-type="image"]')).not.toBe(null);
  expect(view.editable).toBe(true);
  expect(images(view)).toHaveLength(1);
  expect(images(view)[0].attrs.src).toBe("/a.png");
  typeIn(view, 1, "Hello ");
  expect(view.state.doc.child(0).textContent).toBe("Hello Hi ");
});

test("a rejected load still uploads the pasted file once and inserts the image, reported once", async () => {
  const up = recordingUpload();
  const { view, reports, calls } = open({ p: PARAGRAPH }, { load: () => Promise.reject(new Error("no network")), upload: up.upload });
  const { taken, prevented } = paste(view, clip([file("kept.png", "image/png", "kept bytes")]));
  expect([taken, prevented]).toEqual([true, true]);
  expect(await waitFor(() => images(view).length === 1)).toBe(true);
  expect(calls).toEqual(["media"]);
  expect(reports).toHaveLength(1);
  expect(up.calls.map((f) => f.name)).toEqual(["kept.png"]);
  expect(await bytesOf(up.calls[0])).toBe("kept bytes");
  expect(images(view)[0].attrs.src).toBe("/uploads/1-kept.png");
  expect(view.dom.querySelector("figure.page-image")).toBe(null);
  expect(view.dom.querySelector('figure[data-type="image"] img')?.getAttribute("src")).toBe("/uploads/1-kept.png");
  expect(view.editable).toBe(true);
  expect(view.state.doc.child(0).textContent).toBe("Hi ");
  typeIn(view, 1, "Hello ");
  expect(view.state.doc.child(0).textContent).toBe("Hello Hi ");
});

test("an install while composing waits for compositionend", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { view } = open({ p: PARAGRAPH, img: IMAGE }, { load: () => gate.then(() => realLoad("media")) });
  view.input.composing = true;
  expect(view.composing).toBe(true);
  release();
  await flush();
  await flush();
  expect(view.dom.querySelector("figure.page-image")).toBe(null);
  view.dom.dispatchEvent(new CompositionEvent("compositionend"));
  expect(await waitFor(() => view.dom.querySelector("figure.page-image"))).toBe(true);
});

test("selection, the undo stack and the save output are the same before and after the view part installs", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { view } = open({ p: PARAGRAPH, img: IMAGE }, { load: () => gate.then(() => realLoad("media")) });
  typeIn(view, 4, "!");
  const snap = () => ({
    selection: { from: view.state.selection.from, to: view.state.selection.to },
    saved: savedHtml(view),
  });
  const before = snap();
  release();
  expect(await waitFor(() => view.dom.querySelector("figure.page-image"))).toBe(true);
  expect(snap()).toEqual(before);
  expect(history.undo(view.state)).toBe(true);
});

test("after relaying both ways, two peers have the same projection", async () => {
  const initial = seedValue([{ id: "p", text: "Hi " }]);
  const a = openTab(JSON.parse(JSON.stringify(initial)));
  const b = openTab(JSON.parse(JSON.stringify(initial)));
  const send = (from, to, key) => {
    const value = enc(Y.encodeStateAsUpdateV2(from.binding.ydoc, Y.encodeStateVector(to.binding.ydoc)));
    const base = to.store.authoritative;
    to.store.rebase({ ...base, y: { ...base.y, [key]: value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", key], value }] } });
  };
  paste(a.view, clip([file("peer.png")]));
  expect(await waitFor(() => images(a.view).length === 1)).toBe(true);
  send(a, b, "peer-1");
  await waitFor(() => b.view.dom.querySelector("figure.page-image"));
  b.view.dispatch(b.view.state.tr.insertText("!", 2));
  send(b, a, "peer-2");
  await flush();
  expect(blocksFromYValue(a.store.value)).toEqual(blocksFromYValue(b.store.value));
  expect(renderModel(project(blocksFromYValue(a.store.value)))).toBe(renderModel(project(blocksFromYValue(b.store.value))));
  expect(schema.nodes.image).toBeTruthy();
});
