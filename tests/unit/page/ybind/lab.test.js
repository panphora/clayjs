import { createStore } from "../../../../src/live/store.js";
import { seedValue } from "../../../../src/page/ybind/seed.js";
import { startLab } from "../../../fixtures/ypage-lab/lab.js";

globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };

const open = () => {
  const store = createStore({ name: "page", value: seedValue([{ id: "lab1", text: "hello" }, { id: "lab2", text: "world" }]) });
  const root = document.body.appendChild(document.createElement("div"));
  const lab = startLab({ root, store, interval: 1000000 });
  return { store, root, lab };
};
const stat = (root, name) => root.querySelector(`[data-stat="${name}"]`).textContent;
const click = (root, act) => root.querySelector(`[data-act="${act}"]`).click();

test("the lab starts on the seed with nothing pending", () => {
  const { root, lab } = open();
  lab.refresh();
  expect(root.querySelector('[data-lab="editor"] .ProseMirror').textContent).toBe("helloworld");
  expect(stat(root, "keys")).toBe("1");
  expect(stat(root, "pending")).toBe("0");
  expect(stat(root, "mismatch")).toBe("0");
  expect(stat(root, "mode")).toBe("file");
  expect(stat(root, "check")).toBe("");
  lab.destroy();
});

test("typing shows up in the panel, and a 6,000 character insert is chunked", () => {
  const { root, lab } = open();
  lab.view.dispatch(lab.view.state.tr.insertText("X", 6));
  lab.refresh();
  expect(lab.view.state.doc.textContent).toBe("helloXworld");
  expect(stat(root, "keys")).toBe("2");
  expect(stat(root, "groups")).toBe("1");
  expect(stat(root, "mismatch")).toBe("0");

  click(root, "insert-big");
  expect(lab.view.state.doc.textContent.length).toBe(6011);
  expect(stat(root, "keys")).toBe("5");
  expect(stat(root, "last")).toContain('"chunked":true');
  expect(stat(root, "mismatch")).toBe("0");
  lab.destroy();
});

test("30 paragraphs land as one group, one undo removes them, and a check matches a reload", () => {
  const { root, lab } = open();
  click(root, "insert-blocks");
  expect(lab.view.state.doc.childCount).toBe(32);
  expect(lab.view.state.doc.child(0).textContent).toBe("paragraph 0");
  expect(stat(root, "last")).toContain('"structural":true');
  expect(stat(root, "mismatch")).toBe("0");

  click(root, "undo");
  expect(lab.view.state.doc.childCount).toBe(2);
  expect(lab.view.state.doc.textContent).toBe("helloworld");

  click(root, "check");
  expect(stat(root, "check")).toBe("same as a reload");
  lab.destroy();
});

test("destroy leaves no editor behind", () => {
  const { root, lab } = open();
  lab.destroy();
  expect(root.querySelector(".ProseMirror")).toBe(null);
});
