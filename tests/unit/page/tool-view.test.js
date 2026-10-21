import { createStore } from "../../../src/live/store.js";
import { createPageEditor } from "../../../src/page/editor.js";
import { createToolHost } from "../../../src/page/tools.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";

const artifact = (text) => ({ title: text, html: `<output>${text}</output>`, css: "", javascript: "function mount() { globalThis.__mounts++; return () => globalThis.__cleanups++; }", fallbackHtml: `<p>${text} fallback</p>`, summary: text });
const blocks = { t: { t: "tool", pos: "V", artifact: artifact("One"), rev: "r1", state: {} } };
let view, host, live;

beforeEach(() => {
  globalThis.__mounts = 0;
  globalThis.__cleanups = 0;
  document.body.innerHTML = '<article data-page="1"></article>';
  live = createStore({ name: "page.tools", value: { t: { r1: {}, r2: {} } } }).handle;
  host = createToolHost({ store: live, mode: "edit" });
  view = createPageEditor(document.querySelector("article"), { blocks, toolHost: host });
  expect(view.dom.querySelector('section[data-type="tool"] output').textContent).toBe("One");
});
afterEach(() => { view.destroy(); host.dispose(); });

test("the tool node view mounts, remounts on attributes, and disposes on removal", () => {
  expect(globalThis.__mounts).toBe(1);
  view.dispatch(view.state.tr.setNodeMarkup(0, null, { ...view.state.doc.child(0).attrs, artifact: artifact("Same revision") }));
  expect(view.dom.querySelector("output").textContent).toBe("Same revision");
  expect(globalThis.__cleanups).toBe(1);
  view.dispatch(view.state.tr.setNodeMarkup(0, null, { ...view.state.doc.child(0).attrs, artifact: artifact("Two"), rev: "r2" }));
  expect(view.dom.querySelector("output").textContent).toBe("Two");
  expect(globalThis.__cleanups).toBe(2);
  view.dispatch(view.state.tr.delete(0, view.state.doc.child(0).nodeSize));
  expect(view.dom.querySelector('section[data-type="tool"]')).toBeNull();
  expect(globalThis.__cleanups).toBe(3);
});

test("deleting keeps state, and undo restores the previous revision", () => {
  view.dispatch(view.state.tr.setNodeMarkup(0, null, { ...view.state.doc.child(0).attrs, artifact: artifact("Two"), rev: "r2" }));
  expect(view.dom.querySelector("output").textContent).toBe("Two");
  history.undo(view.state, view.dispatch);
  expect(view.state.doc.child(0).attrs.rev).toBe("r1");
  expect(view.dom.querySelector("output").textContent).toBe("One");
  view.dispatch(view.state.tr.delete(0, view.state.doc.child(0).nodeSize));
  expect(live.data.t).toEqual({ r1: {}, r2: {} });
});
