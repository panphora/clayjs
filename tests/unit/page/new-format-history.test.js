globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import { flatten } from "../../../src/page/inline.js";
import { formatMark } from "../../../src/page/format-native.js";
import { editor, posOf, select, key, typeText } from "./view-helpers.js";

/**
 * History around the four formats this release adds: each command is one undo
 * step of its own, the quote shortcut is grouped the way the other markdown
 * shortcuts are, and a neighbour's block is never part of either.
 */

function gate() {
  const calls = [];
  return { calls, run: async (command) => { calls.push(command); return { status: "applied", floor: 1, result: await command?.apply?.({}) }; } };
}

const opened = (spec) => {
  const view = editor(spec, { formatGate: () => Promise.resolve(gate()) });
  return view;
};

const nodeOf = (view, id) => {
  let found = null;
  view.state.doc.forEach((node) => { if (!found && node.attrs.id === id) found = node; });
  return found;
};
const keyOf = (view, id) => {
  const { c, m } = flatten(nodeOf(view, id).content);
  expect(new Set(m).size).toBeLessThanOrEqual(1);
  return m[0] || "";
};
const typeOf = (view, id) => nodeOf(view, id).type.name;
const wholeLine = (view, id) => select(view, posOf(view, id), posOf(view, id) + nodeOf(view, id).content.size);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const undo = (view) => key(view, "z", { ctrlKey: true });
const redo = (view) => key(view, "z", { ctrlKey: true, shiftKey: true });

test("a format command is one undo step, and redo brings the descriptor back", async () => {
  const view = opened([["a", "paragraph", "under me"]]);
  wholeLine(view, "a");
  await formatMark(view, "underline");
  expect(keyOf(view, "a")).toBe('x["underline",{}]');

  expect(undo(view)).toBe(true);
  expect(keyOf(view, "a")).toBe("");
  expect(redo(view)).toBe(true);
  expect(keyOf(view, "a")).toBe('x["underline",{}]');
});

test("changing a color is its own step, and undo walks back through the colors", async () => {
  const view = opened([["a", "paragraph", "color me"]]);
  wholeLine(view, "a");
  await formatMark(view, "text_color", { color: "red" });
  await formatMark(view, "text_color", { color: "blue" });
  expect(keyOf(view, "a")).toBe('x["text_color",{"color":"blue"}]');

  undo(view);
  expect(keyOf(view, "a")).toBe('x["text_color",{"color":"red"}]');
  undo(view);
  expect(keyOf(view, "a")).toBe("");
  redo(view);
  redo(view);
  expect(keyOf(view, "a")).toBe('x["text_color",{"color":"blue"}]');
});

test("the quote shortcut is one step, and typing after it undoes separately", async () => {
  const view = opened([["a", "paragraph", ""]]);
  select(view, posOf(view, "a"));
  typeText(view, '"');
  expect(typeText(view, " ")).toBe(true);
  await settle();
  expect(typeOf(view, "a")).toBe("quote");

  typeText(view, "hello");
  await settle();
  expect(nodeOf(view, "a").textContent).toBe("hello");

  undo(view);
  expect(nodeOf(view, "a").textContent).toBe("");
  expect(typeOf(view, "a")).toBe("quote");

  // Undo walks back the conversion; Backspace on the fresh quote is what puts the
  // whole literal shortcut back (new-formats.test.js).
  undo(view);
  expect(typeOf(view, "a")).toBe("paragraph");
  expect(nodeOf(view, "a").textContent).toBe('"');
});

test("undoing a neighbour's edit leaves the quote and its text alone", async () => {
  const view = opened([["a", "paragraph", "first"], ["b", "paragraph", ""]]);
  select(view, posOf(view, "b"));
  typeText(view, '"');
  typeText(view, " ");
  await settle();
  typeText(view, "quoted");
  await settle();
  expect(typeOf(view, "b")).toBe("quote");

  select(view, posOf(view, "a") + 5);
  typeText(view, " more");
  await settle();
  expect(nodeOf(view, "a").textContent).toBe("first more");

  undo(view);
  expect(nodeOf(view, "a").textContent).toBe("first");
  expect(typeOf(view, "b")).toBe("quote");
  expect(nodeOf(view, "b").textContent).toBe("quoted");
});
