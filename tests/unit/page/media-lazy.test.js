import { createPageEditor, installPageFeature } from "../../../src/page/editor.js";
import { createFeatureLoader } from "../../../src/page/feature-loader.js";
import { FEATURES } from "../../../src/page/features/registry.js";

/**
 * The media upload part and the checklist decoration load when a document has or
 * takes one, never before: a plain document asks for neither, a first image paste
 * asks for media, and a checklist draws and toggles once its part has arrived.
 */

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};

const file = (name = "a.png") => new File(["hello"], name, { type: "image/png" });
const upload = () => Promise.resolve({ ok: true, uploads: [{ url: "/uploads/a.png" }] });

const open = (blocks) => {
  const calls = [];
  const holder = { view: null };
  const features = createFeatureLoader({
    load: (id) => { calls.push(id); return FEATURES[id].load(); },
    install: (id, mod) => installPageFeature({ view: holder.view, upload }, id, mod),
    reportError: () => {},
  });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks, features, upload });
  holder.view = view;
  cleanups.push(() => {
    if (!view.isDestroyed) view.destroy();
    mount.remove();
  });
  return { view, calls };
};

const paste = (view, files) => {
  const event = { clipboardData: { files, getData: () => "" }, preventDefault() { event.defaultPrevented = true; } };
  const taken = view.someProp("handlePaste", (fn) => fn(view, event, null));
  return { taken: !!taken, prevented: !!event.defaultPrevented };
};
const images = (view) => {
  const found = [];
  view.state.doc.forEach((node) => { if (node.type.name === "image") found.push(node); });
  return found;
};

const PARAGRAPH = { t: "paragraph", pos: "B", c: "Hi" };

test("a document with no media and no checklist asks for neither part", async () => {
  const { view, calls } = open({ p: PARAGRAPH, li: { t: "list_item", pos: "C", c: "Ordinary", kind: "bullet" } });
  await flush();
  await flush();
  expect(calls).toEqual([]);
  expect(view.dom.querySelector(".page-check-controls")).toBe(null);
});

test("a first image paste loads the media part and inserts the image", async () => {
  const { view, calls } = open({ p: PARAGRAPH });
  await flush();
  expect(calls).toEqual([]);
  const { taken, prevented } = paste(view, [file()]);
  expect([taken, prevented]).toEqual([true, true]);
  expect(await waitFor(() => images(view).length === 1)).toBe(true);
  expect(calls).toEqual(["media"]);
  expect(images(view)[0].attrs.src).toBe("/uploads/a.png");
});

test("a checklist draws its decorations and toggles its box once the part arrives", async () => {
  const { view, calls } = open({ chk: { t: "list_item", pos: "B", c: "Do it", kind: "check" } });
  expect(await waitFor(() => view.dom.querySelector(".page-check-controls"))).toBe(true);
  expect(calls).toEqual(["checklist"]);
  expect([...view.dom.querySelectorAll(".page-check-chip")].map((button) => button.textContent)).toEqual(["Unassigned", "No date"]);

  const li = view.dom.querySelector('.page-li[data-kind="check"]');
  li.getBoundingClientRect = () => ({ top: 0, bottom: 20, left: 0, right: 100, height: 20, width: 100 });
  li.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 0 }));
  expect(view.state.doc.child(0).attrs.checked).toBe(true);
});
