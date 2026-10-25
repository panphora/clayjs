import { jest } from "@jest/globals";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../src/live/store.js";
import { state as pmState, view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import { identityPlugin } from "../../../src/page/model.js";
import { moveBlock } from "../../../src/page/blocks.js";
import { createYPageBinding, seedValue } from "../../../src/page/ybind/index.js";
import { NET } from "../../../src/page/ybind/layout.js";
import { observeDocumentTitle, refreshDocumentTitle, titleItemsOfDoc, titlePlugin } from "../../../src/page/document-title-runtime.js";
import { writeTitle } from "../../../src/page/document-title-dom.js";
import Mutation from "../../../src/lib/mutation.js";
import { undo } from "../../../src/plugins/undo.js";

const value = seedValue([
  { id: "h", t: "heading", text: "First title", attrs: { level: 1 } },
  { id: "p", t: "paragraph", text: "Body text" },
  { id: "b", t: "heading", text: "Second title", attrs: { level: 1 } },
]);

const opened = [];
const dirty = () => document.head.innerHTML = "";
const setCustom = (content = "custom") => {
  const meta = document.createElement("meta");
  meta.setAttribute("name", "clay-seo-title-mode");
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
};

beforeAll(() => { window.clayEditMode = true; });

afterEach(() => {
  for (const tab of opened.splice(0)) {
    tab.view.destroy();
    tab.binding.dispose();
    tab.binding.ydoc.destroy();
    tab.mount.remove();
  }
  jest.restoreAllMocks();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

function open(seed = value) {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(seed)) });
  const binding = createYPageBinding({ store });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin(), titlePlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  opened.push({ store, binding, view, mount });
  return opened[opened.length - 1];
}

const posOf = (tab, id) => {
  let pos = null;
  tab.view.state.doc.forEach((node, offset) => { if (node.attrs.id === id) pos = offset + 1; });
  return pos;
};
const retitle = (tab, text) => {
  const pos = posOf(tab, "h");
  tab.view.dispatch(tab.view.state.tr.insertText(text, pos, pos + tab.view.state.doc.child(0).content.size));
};
const relay = (from, to) => Y.applyUpdateV2(to.binding.ydoc, Y.encodeStateAsUpdateV2(from.binding.ydoc), NET);

describe("the runtime title", () => {
  test("a mounted page titles itself from its first root H1", () => {
    open();
    expect(document.title).toBe("First title");
  });

  test("local typing in the title moves document.title", () => {
    const tab = open();
    retitle(tab, "Typed title");
    expect(document.title).toBe("Typed title");
  });

  test("a remote transaction moves document.title too", () => {
    const a = open();
    const b = open();
    retitle(a, "From the other tab");
    relay(a, b);
    expect(b.view.state.doc.child(0).textContent).toBe("From the other tab");
    expect(document.title).toBe("From the other tab");
  });

  test("deleting the title H1 makes the page Untitled", () => {
    const tab = open(seedValue([
      { id: "h", t: "heading", text: "Only title", attrs: { level: 1 } },
      { id: "p", t: "paragraph", text: "Body text" },
    ]));
    expect(document.title).toBe("Only title");
    const node = tab.view.state.doc.child(0);
    tab.view.dispatch(tab.view.state.tr.delete(0, node.nodeSize));
    expect(document.title).toBe("Untitled");
  });

  test("moving the second root H1 first changes the title", () => {
    const tab = open(seedValue([
      { id: "a", t: "heading", text: "First title", attrs: { level: 1 } },
      { id: "b", t: "heading", text: "Second title", attrs: { level: 1 } },
    ]));
    expect(document.title).toBe("First title");
    const pos = posOf(tab, "a");
    tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, pos)));
    moveBlock(1)(tab.view.state, tab.view.dispatch);
    expect(tab.view.state.doc.child(0).attrs.id).toBe("b");
    expect(document.title).toBe("Second title");
  });

  test("a custom marker keeps the exact title, even an empty one", () => {
    document.title = "Hand written";
    setCustom();
    const tab = open();
    retitle(tab, "Typed title");
    expect(document.title).toBe("Hand written");

    document.title = "";
    refreshDocumentTitle(tab.view);
    expect(document.title).toBe("");
  });

  test("a duplicate earlier non-custom marker does not cancel a later custom one", () => {
    setCustom("derived");
    setCustom("custom");
    document.title = "Kept";
    open();
    expect(document.title).toBe("Kept");
  });

  test("titleItemsOfDoc stops at the first root H1 and reads hard breaks as text", () => {
    const tab = open(seedValue([
      { id: "p", t: "paragraph", text: "Body" },
      { id: "t", t: "toggle", text: "Toggle", attrs: { open: true } },
      { id: "n", t: "heading", text: "Nested", attrs: { level: 1, parent: "t" } },
      { id: "h", t: "heading", text: "Root", attrs: { level: 1 } },
      { id: "l", t: "heading", text: "Later", attrs: { level: 1 } },
    ]));
    expect(titleItemsOfDoc(tab.view.state.doc)).toEqual([{ t: "heading", level: 1, parent: null, c: "Root" }]);
    expect(document.title).toBe("Root");
  });
});

describe("mirroring the title is not an edit", () => {
  test("it writes no Yjs update, records no undo item and schedules no save", async () => {
    const tab = open();
    undo.start({ scope: document.body, bindKeys: false });
    document.title = "Stale title";
    await new Promise((resolve) => setTimeout(resolve, 20));

    const updates = jest.fn();
    tab.binding.ydoc.on("update", updates);
    const saved = jest.fn();
    const stop = Mutation.onAnyChange({ debounce: 0, require: "autosave" }, saved);

    try {
      undo.clear();
      refreshDocumentTitle(tab.view);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(document.title).toBe("First title");
      expect(updates).not.toHaveBeenCalled();
      expect(undo.canUndo).toBe(false);
      expect(undo.history).toEqual([]);
      expect(saved).not.toHaveBeenCalled();

      writeTitle(document, "Written without a pause");
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(saved).toHaveBeenCalled();
    } finally {
      stop();
      undo.clear();
      undo.stop();
    }
  });

  test("the title write creates no transaction, so no undo entry and no checkpoint", () => {
    const tab = open();
    const dispatch = jest.spyOn(tab.binding, "dispatch");
    document.title = "Stale title";
    refreshDocumentTitle(tab.view);
    expect(dispatch).not.toHaveBeenCalled();
    expect(document.title).toBe("First title");
  });
});

describe("the head observer", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

  test("an authored head title edit is put back to the derived title", async () => {
    const tab = open();
    const observer = observeDocumentTitle(tab.view);
    try {
      document.title = "Something else";
      await settle();
      expect(document.title).toBe("First title");
    } finally {
      observer.dispose();
    }
  });

  test("turning custom on stops the derivation and keeps what is there", async () => {
    const tab = open();
    const observer = observeDocumentTitle(tab.view);
    try {
      document.title = "Mine";
      setCustom();
      await settle();
      expect(document.title).toBe("Mine");

      retitle(tab, "Typing on");
      await settle();
      expect(document.title).toBe("Mine");
    } finally {
      observer.dispose();
    }
  });

  test("a disposed observer stops refreshing", async () => {
    const tab = open();
    const observer = observeDocumentTitle(tab.view);
    observer.dispose();
    document.title = "Left alone";
    await settle();
    expect(document.title).toBe("Left alone");
  });
});
