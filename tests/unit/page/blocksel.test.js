import { state as pmState, history } from "../../../src/vendor/prosemirror.vendor.js";
import * as B from "../../../src/page/blocks.js";
import * as S from "../../../src/page/blocksel.js";
import { REMOTE, blockMap } from "../../../src/page/model.js";
import { schema } from "../../../src/page/schema.js";
import { make, caret, run, short } from "./blocks-helpers.js";
import { editor, key, posOf, select, typeText } from "./view-helpers.js";

const { TextSelection, NodeSelection } = pmState;
const { BlockSelection } = B;

/**
 * The block selection commands and plugin: what Esc, the arrows, Delete, Mod+D,
 * typing and Mod+A do with whole blocks selected.
 */

afterEach(() => { document.body.innerHTML = ""; });

const FLAT = [["a", "paragraph", "A"], ["b", "paragraph", "B"], ["c", "paragraph", "C"], ["d", "paragraph", "D"]];
const TOGGLE = [["p", "paragraph", "P"], ["t", "toggle", "T", { open: false }], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }], ["z", "paragraph", "Z"]];
const LIST = [["l1", "list_item", "one"], ["l2", "list_item", "two", { indent: 1 }], ["l3", "list_item", "three", { indent: 1 }], ["l4", "list_item", "four"]];

const withSel = (s, a, b = a) => s.apply(s.tr.setSelection(S.selectBlocks(s.doc, a, b)));
const spanIds = (s) => { const ents = B.outline(s.doc); const { lo, hi } = s.selection.span(s.doc); return ents.slice(lo, hi + 1).map((e) => e.node.attrs.id); };
const stepKeys = (s, ...cmds) => cmds.reduce((st, c) => run(st, c), s);

describe("selecting", () => {
  test("Esc on a closed toggle selects it with its hidden body", () => {
    const s = run(caret(make(TOGGLE), "t"), S.selectCurrentBlock);
    expect(s.selection instanceof BlockSelection).toBe(true);
    expect(spanIds(s)).toEqual(["t", "b1", "b2"]);
  });

  test("selecting a parent item takes its children", () => {
    const s = withSel(make(LIST), 0 + 0);
    const parent = run(caret(make(LIST), "l1"), S.selectCurrentBlock);
    expect(spanIds(parent)).toEqual(["l1", "l2", "l3"]);
    expect(spanIds(s)).toEqual(["l1", "l2", "l3"]);
  });

  test("a range from a child to a root block lifts to whole sibling subtrees", () => {
    const s = withSel(make(LIST), 2, 3);
    expect(spanIds(s)).toEqual(["l1", "l2", "l3", "l4"]);
  });

  test("Esc again leaves block mode with the caret at the end of the first selected text block", () => {
    const s = withSel(make(FLAT), 1, 2);
    const out = run(s, S.exitToText);
    expect(out.selection instanceof TextSelection).toBe(true);
    expect(out.selection.head).toBe(out.doc.resolve(out.selection.head).end());
    expect(out.selection.$head.parent.attrs.id).toBe("b");
  });

  test("Esc on a first selected block that is not text selects it as a node", () => {
    const s = withSel(make([["a", "paragraph", "A"], ["d", "divider", ""]]), 1);
    const out = run(s, S.exitToText);
    expect(out.selection instanceof NodeSelection).toBe(true);
  });

  test("Mod+A selects the block's text first, then every block", () => {
    const s = caret(make(FLAT), "b", 1);
    const one = run(s, S.selectAllBlocks);
    expect(one.selection instanceof TextSelection).toBe(true);
    expect([one.selection.from, one.selection.to]).toEqual([one.selection.$from.start(), one.selection.$from.end()]);
    const all = run(one, S.selectAllBlocks);
    expect(all.selection instanceof BlockSelection).toBe(true);
    expect(spanIds(all)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("moving the selection", () => {
  test("Down selects the next visible block and skips a closed body", () => {
    const s = withSel(make(TOGGLE), 0);
    const down = run(s, S.stepBlock(1));
    expect(spanIds(down)).toEqual(["t", "b1", "b2"]);
    const next = run(down, S.stepBlock(1));
    expect(spanIds(next)).toEqual(["z"]);
  });

  test("Up from the first block stays where it is", () => {
    const s = withSel(make(FLAT), 0);
    expect(spanIds(run(s, S.stepBlock(-1)))).toEqual(["a"]);
  });

  test("Shift+Down twice, then Shift+Up, shrinks by one root", () => {
    const s0 = withSel(make(FLAT), 0);
    const s2 = stepKeys(s0, S.extendBlock(1), S.extendBlock(1));
    expect(spanIds(s2)).toEqual(["a", "b", "c"]);
    expect(spanIds(run(s2, S.extendBlock(-1)))).toEqual(["a", "b"]);
  });

  test("Shift+Up past the anchor extends upward and Shift+Down shrinks from the top", () => {
    const s0 = withSel(make(FLAT), 2);
    const up = run(s0, S.extendBlock(-1));
    expect(spanIds(up)).toEqual(["b", "c"]);
    expect(up.selection.anchor > up.selection.head).toBe(true);
    const up2 = run(up, S.extendBlock(-1));
    expect(spanIds(up2)).toEqual(["a", "b", "c"]);
    expect(spanIds(run(up2, S.extendBlock(1)))).toEqual(["b", "c"]);
    expect(spanIds(stepKeys(up2, S.extendBlock(1), S.extendBlock(1)))).toEqual(["c"]);
  });

  test("Shift+Up on the first block stays on the first block", () => {
    const s = withSel(make(FLAT), 0);
    expect(spanIds(run(s, S.extendBlock(-1)))).toEqual(["a"]);
  });

  test("extending over a closed toggle takes its body", () => {
    const s = withSel(make(TOGGLE), 0);
    expect(spanIds(run(s, S.extendBlock(1)))).toEqual(["p", "t", "b1", "b2"]);
  });
});

describe("deleting and duplicating", () => {
  test("Delete removes a closed toggle and its body, caret at the end of the block before", () => {
    const s = withSel(make(TOGGLE), 1);
    const out = run(s, S.deleteBlocks);
    expect(short(out)).toBe("P | Z");
    expect(out.selection.$head.parent.attrs.id).toBe("p");
    expect(out.selection.head).toBe(out.doc.resolve(out.selection.head).end());
  });

  test("deleting every block leaves one empty paragraph", () => {
    const s = withSel(make(FLAT), 0, 3);
    const out = run(s, S.deleteBlocks);
    expect(out.doc.childCount).toBe(1);
    expect(out.doc.child(0).type.name).toBe("paragraph");
    expect(out.doc.textContent).toBe("");
  });

  test("one undo restores the blocks, their ids and keys, and the block selection", () => {
    const s0 = make(TOGGLE, [history.history()]);
    const s = withSel(s0, 1);
    const before = JSON.stringify(blockMap(s.doc));
    const deleted = run(s, S.deleteBlocks);
    let undone = deleted;
    history.undo(deleted, (tr) => { undone = deleted.apply(tr); });
    expect(JSON.stringify(blockMap(undone.doc))).toBe(before);
    expect(undone.selection instanceof BlockSelection).toBe(true);
  });

  test("copy takes whole blocks: openStart 0 and the hidden body included", () => {
    const s = withSel(make(TOGGLE), 1);
    const slice = s.selection.content();
    expect([slice.openStart, slice.openEnd, slice.content.childCount]).toEqual([0, 0, 3]);
  });

  test("Mod+D duplicates the span: fresh ids, the copied body names the copied toggle, no existing key changes, the copy is selected", () => {
    const s = withSel(make(TOGGLE), 1);
    const before = blockMap(s.doc);
    const out = run(s, S.duplicateBlocks);
    expect(short(out)).toBe("P | T | b1<t | b2<t | T | b1<" + out.doc.child(4).attrs.id + " | b2<" + out.doc.child(4).attrs.id + " | Z");
    const after = blockMap(out.doc);
    for (const id of Object.keys(before)) expect(after[id].pos).toBe(before[id].pos);
    const copy = out.doc.child(4);
    expect(copy.attrs.id).not.toBe("t");
    expect(new Set([out.doc.child(5).attrs.parent, out.doc.child(6).attrs.parent])).toEqual(new Set([copy.attrs.id]));
    expect(out.selection instanceof BlockSelection).toBe(true);
    expect(spanIds(out)).toEqual([copy.attrs.id, out.doc.child(5).attrs.id, out.doc.child(6).attrs.id]);
  });

  test("Mod+D in text duplicates the caret block with its children", () => {
    const s = caret(make(LIST), "l1", 1);
    const out = run(s, S.duplicateBlocks);
    expect(short(out)).toBe("one@0 | two@1 | three@1 | one@0 | two@1 | three@1 | four@0");
    expect(out.selection instanceof TextSelection).toBe(true);
  });
});

describe("the plugin in a real view", () => {
  const view = (spec = FLAT) => editor(spec);

  test("Esc selects the caret's block and draws .page-block-selected", () => {
    const v = view();
    select(v, posOf(v, "b"));
    expect(key(v, "Escape")).toBe(true);
    expect(v.state.selection instanceof BlockSelection).toBe(true);
    expect(v.dom.querySelectorAll(".page-block-selected").length).toBe(1);
    expect(v.dom.querySelector(".page-block-selected").textContent).toBe("B");
  });

  test("a focused editor hides the browser's own selection while blocks are selected and shows it again after", () => {
    const v = view();
    v.focus();
    select(v, posOf(v, "b"));
    key(v, "Escape");
    expect(v.dom.classList.contains("ProseMirror-hideselection")).toBe(true);
    key(v, "Escape");
    expect(v.dom.classList.contains("ProseMirror-hideselection")).toBe(false);
  });

  test("the live region announces the selection and its clearing", () => {
    const v = view();
    select(v, posOf(v, "b"));
    key(v, "Escape");
    const live = v.dom.parentElement.querySelector(".page-live");
    expect(live.textContent).toBe("1 block selected");
    key(v, "ArrowDown", { shiftKey: true });
    expect(live.textContent).toBe("2 blocks selected");
    key(v, "Escape");
    expect(live.textContent).toBe("Selection cleared");
  });

  test("typing leaves block mode, puts the caret at the end of the first selected text block and inserts the character", () => {
    const v = view();
    select(v, posOf(v, "b"));
    key(v, "Escape");
    key(v, "ArrowDown", { shiftKey: true });
    expect(typeText(v, "x")).toBe(true);
    expect(v.state.selection instanceof TextSelection).toBe(true);
    expect(v.state.doc.child(1).textContent).toBe("Bx");
    expect(v.state.doc.child(2).textContent).toBe("C");
    expect(v.state.selection.$head.parent.attrs.id).toBe("b");
  });

  test("F12 typing over atom blocks inserts a paragraph after the span", () => {
    const v = editor([["a", "paragraph", "A"], ["d", "divider", ""]]);
    v.dispatch(v.state.tr.setSelection(S.selectBlocks(v.state.doc, 1)));
    expect(typeText(v, "x")).toBe(true);
    expect(v.state.doc.textContent).toBe("Ax");
    expect(v.state.doc.child(1).type.name).toBe("divider");
    expect(v.state.doc.child(2).type.name).toBe("paragraph");
    expect(v.state.selection.$head.index(0)).toBe(2);
  });

  test("Backspace deletes the blocks and Mod+Z restores them with the block selection", () => {
    const v = view();
    select(v, posOf(v, "b"));
    key(v, "Escape");
    key(v, "Backspace");
    expect(v.state.doc.childCount).toBe(3);
    key(v, "z", { ctrlKey: true });
    expect(v.state.doc.childCount).toBe(4);
    expect(v.state.selection instanceof BlockSelection).toBe(true);
  });

  test("Enter returns to text at the end of the first selected block", () => {
    const v = view();
    select(v, posOf(v, "c"));
    key(v, "Escape");
    key(v, "Enter");
    expect(v.state.selection instanceof TextSelection).toBe(true);
    expect(v.state.selection.$head.parent.attrs.id).toBe("c");
  });

  test("Mod+A twice selects every block", () => {
    const v = view();
    select(v, posOf(v, "b", false) + 1);
    key(v, "a", { ctrlKey: true });
    key(v, "a", { ctrlKey: true });
    expect(v.state.selection instanceof BlockSelection).toBe(true);
    expect(v.dom.querySelectorAll(".page-block-selected").length).toBe(4);
  });

  test("the chrome survives a block selection of the last block", () => {
    const v = view();
    select(v, posOf(v, "d"));
    expect(() => key(v, "Escape")).not.toThrow();
    expect(v.state.selection instanceof BlockSelection).toBe(true);
  });

  test("a remote block landing inside the selection clears it and says so; one at the edge does not", () => {
    const v = view();
    select(v, posOf(v, "a"));
    key(v, "Escape");
    key(v, "ArrowDown", { shiftKey: true });
    const live = v.dom.parentElement.querySelector(".page-live");
    const para = schema.nodes.paragraph.create({ id: "r1", pos: "Zz" }, schema.text("R"));
    const edge = v.state.selection.to;
    v.dispatch(v.state.tr.insert(edge, para).setMeta(REMOTE, true).setMeta("addToHistory", false));
    expect(v.state.selection instanceof BlockSelection).toBe(true);
    expect(live.textContent).not.toMatch(/document changed/);
    const middle = v.state.doc.child(0).nodeSize;
    v.dispatch(v.state.tr.insert(middle, schema.nodes.paragraph.create({ id: "r2", pos: "Zy" }, schema.text("R2"))).setMeta(REMOTE, true).setMeta("addToHistory", false));
    expect(v.state.selection instanceof TextSelection).toBe(true);
    expect(v.state.selection.$head.parent.attrs.id).toBe("a");
    expect(live.textContent).toBe("Block selection cleared because the document changed");
  });
});

describe("Shift+Down from a closed toggle's summary", () => {
  const view = { endOfTextblock: () => true };
  const inSummary = (id = "t") => caret(make(TOGGLE), id, 1);

  test("switches to a block selection of the toggle, its body and the next block", () => {
    let out = null;
    const handled = S.blockSelKeys["Shift-ArrowDown"](inSummary(), (tr) => { out = inSummary().apply(tr); }, view);
    expect(handled).toBe(true);
    expect(out.selection instanceof BlockSelection).toBe(true);
    expect(spanIds(out)).toEqual(["t", "b1", "b2", "z"]);
  });

  test("Backspace then deletes the toggle, its body and the next block, and one undo brings them back", () => {
    const s0 = caret(make(TOGGLE, [history.history()]), "t", 1);
    let sel = s0;
    S.blockSelKeys["Shift-ArrowDown"](s0, (tr) => { sel = s0.apply(tr); }, view);
    const gone = run(sel, S.deleteBlocks);
    expect(short(gone)).toBe("P");
    let back = gone;
    history.undo(gone, (tr) => { back = gone.apply(tr); });
    expect(Object.keys(blockMap(back.doc)).sort()).toEqual(["b1", "b2", "p", "t", "z"]);
    expect(back.doc.childCount).toBe(5);
  });

  test("does nothing when the caret is not at the last line, the toggle is open, or is the last block", () => {
    const cmd = S.blockSelKeys["Shift-ArrowDown"];
    expect(cmd(inSummary(), null, { endOfTextblock: () => false })).toBe(false);
    const open = caret(make([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["z", "paragraph", "Z"]]), "t", 1);
    expect(cmd(open, null, view)).toBe(false);
    const empty = caret(make([["t", "toggle", "T", { open: false }], ["z", "paragraph", "Z"]]), "t", 1);
    let out = empty;
    expect(cmd(empty, (tr) => { out = empty.apply(tr); }, view)).toBe(true);
    expect(spanIds(out)).toEqual(["t", "z"]);
    const last = caret(make([["p", "paragraph", "P"], ["t", "toggle", "T", { open: false }], ["b1", "paragraph", "b1", { parent: "t" }]]), "t", 1);
    expect(cmd(last, null, view)).toBe(false);
  });

  test("is reached through the editor's key handling when the caret is on the last line", () => {
    const v = editor(TOGGLE);
    v.endOfTextblock = () => true;
    select(v, posOf(v, "t", true));
    expect(key(v, "ArrowDown", { shiftKey: true })).toBe(true);
    expect(v.state.selection instanceof BlockSelection).toBe(true);
    expect(spanIds(v.state)).toEqual(["t", "b1", "b2", "z"]);
  });

  test("a text selection that started above the toggle is left to the collapse plugin", () => {
    const s = make(TOGGLE);
    const across = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 2, B.outline(s.doc)[1].at + 2)));
    expect(S.blockSelKeys["Shift-ArrowDown"](across, null, view)).toBe(false);
  });
});

describe("review regressions", () => {
  test("F1 appended remote children clear whole-subtree selection and its bookmark", () => {
    const v = editor([["t", "toggle", "T", { open: true }], ["b", "paragraph", "B", { parent: "t" }], ["z", "paragraph", "Z"]]);
    try {
      v.dispatch(v.state.tr.setSelection(S.selectBlocks(v.state.doc, 0)));
      const bookmark = v.state.selection.getBookmark();
      const at = B.outline(v.state.doc)[1].end;
      const tr = v.state.tr.insert(at, schema.nodes.paragraph.create({ id: "new", pos: "CZ", parent: "t" }, schema.text("New"))).setMeta(REMOTE, true);
      v.dispatch(tr);
      expect(v.state.selection).toBeInstanceOf(TextSelection);
      expect(bookmark.map(tr.mapping).resolve(tr.doc)).toBeInstanceOf(TextSelection);
      expect(v.dom.parentElement.querySelector(".page-live").textContent).toBe("Block selection cleared because the document changed");
      expect(S.deleteBlocks(v.state, v.dispatch)).toBe(false);
      expect(v.state.doc.child(2).attrs.parent).toBe("t");
    } finally { v.destroy(); }
  });

  test("F1 a remote move cannot silently drop a selected root", () => {
    const v = editor(FLAT);
    try {
      v.dispatch(v.state.tr.setSelection(S.selectBlocks(v.state.doc, 0, 1)));
      const a = v.state.doc.child(0);
      const tr = v.state.tr.delete(0, a.nodeSize);
      tr.insert(tr.doc.content.size, a).setMeta(REMOTE, true);
      v.dispatch(tr);
      expect(v.state.selection).toBeInstanceOf(TextSelection);
      expect(v.state.selection.$head.parent.attrs.id).toBe("a");
      expect(v.dom.parentElement.querySelector(".page-live").textContent).toMatch(/document changed/);
    } finally { v.destroy(); }
  });

  test("F1 remote collapse announces the reason for clearing a hidden root", () => {
    const v = editor([["t", "toggle", "T", { open: true }], ["b", "paragraph", "B", { parent: "t" }], ["z", "paragraph", "Z"]]);
    try {
      v.dispatch(v.state.tr.setSelection(S.selectBlocks(v.state.doc, 1)));
      v.dispatch(v.state.tr.setNodeMarkup(0, null, { ...v.state.doc.child(0).attrs, open: false }).setMeta(REMOTE, true));
      expect(v.state.selection).toBeInstanceOf(TextSelection);
      expect(v.dom.parentElement.querySelector(".page-live").textContent).toBe("Block selection cleared because the document changed");
    } finally { v.destroy(); }
  });

  test("F4 Mod+A stays in block mode and typing preserves the document", () => {
    const v = editor(FLAT);
    try {
      select(v, posOf(v, "b"));
      key(v, "Escape");
      expect(key(v, "a", { ctrlKey: true })).toBe(true);
      expect(v.state.selection).toBeInstanceOf(BlockSelection);
      expect(spanIds(v.state)).toEqual(["a", "b", "c", "d"]);
      typeText(v, "x");
      expect(v.state.doc.textContent).toBe("AxBCD");
    } finally { v.destroy(); }
  });

  test.each([["Backspace", { altKey: true }], ["h", { ctrlKey: true }]])("F4 delete shortcut %s consumes and deletes selected blocks", (k, options) => {
    const v = editor(FLAT);
    try {
      v.dispatch(v.state.tr.setSelection(S.selectBlocks(v.state.doc, 1)));
      expect(key(v, k, options)).toBe(true);
      expect(v.state.doc.textContent).toBe("ACD");
    } finally { v.destroy(); }
  });

  test("F12 a closed summary with no body selects through the next block", () => {
    const v = editor([["t", "toggle", "T", { open: false }], ["z", "paragraph", "Z"]]);
    try {
      v.endOfTextblock = () => true;
      select(v, posOf(v, "t", true));
      expect(key(v, "ArrowDown", { shiftKey: true })).toBe(true);
      expect(spanIds(v.state)).toEqual(["t", "z"]);
    } finally { v.destroy(); }
  });

  test("F13 reverse Shift+click anchors on the selected root", () => {
    const v = editor([["a", "paragraph", "A"], ["t", "toggle", "T", { open: true }], ["b1", "paragraph", "B1", { parent: "t" }], ["b2", "paragraph", "B2", { parent: "t" }]]);
    try {
      v.dispatch(v.state.tr.setSelection(S.selectBlocks(v.state.doc, 1, 0)));
      const at = B.outline(v.state.doc)[2].at;
      v.posAtCoords = () => ({ pos: at + 1, inside: at });
      const event = new MouseEvent("mousedown", { button: 0, shiftKey: true, cancelable: true });
      expect(S.blockSelKey.get(v.state).props.handleDOMEvents.mousedown(v, event)).toBe(true);
      expect(spanIds(v.state)).toEqual(["t", "b1", "b2"]);
    } finally { v.destroy(); }
  });
});
