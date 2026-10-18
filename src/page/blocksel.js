// Block selection: Esc, the grip and Shift+click select whole blocks, and every
// block command (delete, duplicate, move, indent, copy) acts on "the current
// span", the block selection or the blocks a text selection touches, lifted to
// whole sibling subtrees. BlockSelection itself lives in blocks.js because
// moveSpanTr needs it.
import { state, history } from "../vendor/prosemirror.vendor.js";
import { schema } from "./schema.js";
import { outline, siblingSpan, touchedBlocks, BlockSelection, STEP } from "./blocks.js";
import { newId } from "./model.js";

const { Selection, TextSelection, NodeSelection } = state;
const N = schema.nodes;

export const asStep = (tr) => history.closeHistory(tr).setMeta(STEP, true);

export function selectBlocks(doc, a, b = a, ents = outline(doc)) {
  const { lo, hi } = siblingSpan(ents, Math.min(a, b), Math.max(a, b));
  const from = ents[lo].at, to = ents[hi].end;
  return a <= b ? new BlockSelection(doc.resolve(from), doc.resolve(to)) : new BlockSelection(doc.resolve(to), doc.resolve(from));
}

export function currentSpan(st, ents = outline(st.doc)) {
  const [a, b] = touchedBlocks(st.doc, st.selection, ents);
  return siblingSpan(ents, a, b);
}

const visibleIdx = (ents, i, dir) => {
  for (let j = i; j >= 0 && j < ents.length; j += dir) if (!ents[j].hidden) return j;
  return -1;
};

export function selectCurrentBlock(st, dispatch) {
  if (st.selection instanceof BlockSelection) return false;
  const i = Math.min(st.selection.$head.index(0), st.doc.childCount - 1);
  if (dispatch) dispatch(st.tr.setSelection(selectBlocks(st.doc, i)));
  return true;
}

export const stepBlock = (dir) => (st, dispatch) => {
  const sel = st.selection;
  if (!(sel instanceof BlockSelection)) return false;
  const ents = outline(st.doc);
  const { lo, hi } = sel.span(st.doc);
  const i = dir < 0 ? visibleIdx(ents, lo - 1, -1) : visibleIdx(ents, hi + 1, 1);
  if (i < 0) return true;
  if (dispatch) dispatch(st.tr.setSelection(selectBlocks(st.doc, i)).scrollIntoView());
  return true;
};

function rootAt(ents, lo, hi, side) {
  if (side < 0) return lo;
  let r = lo;
  while (ents[r].subEnd < hi) r = ents[r].subEnd + 1;
  return r;
}

function prevRoot(ents, i) {
  for (let j = i - 1; j >= 0; j--) if (ents[j].up === ents[i].up) return j;
  return i;
}

export const extendBlock = (dir) => (st, dispatch) => {
  const sel = st.selection;
  if (!(sel instanceof BlockSelection)) return false;
  const ents = outline(st.doc);
  const { lo, hi } = sel.span(st.doc);
  const fwd = sel.anchor <= sel.head;
  const anchorIdx = fwd ? lo : rootAt(ents, lo, hi, 1);
  let headIdx = fwd ? rootAt(ents, lo, hi, 1) : lo;
  if (dir > 0) {
    if (fwd || lo === hi || headIdx === anchorIdx) headIdx = visibleIdx(ents, (fwd ? hi : headIdx) + 1, 1);
    else headIdx = visibleIdx(ents, ents[headIdx].subEnd + 1, 1);
  } else {
    if (!fwd || headIdx === anchorIdx) headIdx = visibleIdx(ents, (fwd ? headIdx : lo) - 1, -1);
    else headIdx = prevRoot(ents, headIdx);
  }
  if (headIdx < 0) return true;
  if (dispatch) dispatch(st.tr.setSelection(selectBlocks(st.doc, anchorIdx, headIdx, ents)).scrollIntoView());
  return true;
};

export function deleteBlocks(st, dispatch) {
  const sel = st.selection;
  if (!(sel instanceof BlockSelection)) return false;
  if (dispatch) {
    const tr = st.tr.delete(sel.from, sel.to);
    if (tr.doc.content.size === 0) tr.insert(0, N.paragraph.create());
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(sel.from, tr.doc.content.size)), -1));
    dispatch(asStep(tr).scrollIntoView());
  }
  return true;
}

export function duplicateBlocks(st, dispatch) {
  const ents = outline(st.doc);
  if (!ents.length) return false;
  const { lo, hi } = currentSpan(st, ents);
  if (dispatch) {
    const ids = new Map();
    for (let k = lo; k <= hi; k++) if (ents[k].node.type === N.toggle && ents[k].node.attrs.id) ids.set(ents[k].node.attrs.id, newId());
    const nodes = [];
    for (let k = lo; k <= hi; k++) {
      const n = ents[k].node, p = n.attrs.parent ?? null;
      nodes.push(n.type.create({ ...n.attrs, id: ids.get(n.attrs.id) ?? null, pos: null, parent: ids.get(p) ?? p }, n.content, n.marks));
    }
    const at = ents[hi].end, size = at - ents[lo].at;
    const tr = st.tr.insert(at, nodes);
    const s = st.selection;
    tr.setSelection(s instanceof BlockSelection
      ? new BlockSelection(tr.doc.resolve(at), tr.doc.resolve(at + size))
      : TextSelection.create(tr.doc, s.anchor + size, s.head + size));
    dispatch(asStep(tr).scrollIntoView());
  }
  return true;
}

const endOfFirstText = (doc, ents, lo, hi) => {
  for (let k = lo; k <= hi; k++) if (ents[k].node.isTextblock) return ents[k].end - 1;
  return -1;
};

export function exitToText(st, dispatch) {
  const sel = st.selection;
  if (!(sel instanceof BlockSelection)) return false;
  const ents = outline(st.doc);
  const { lo, hi } = sel.span(st.doc);
  if (dispatch) {
    const at = endOfFirstText(st.doc, ents, lo, hi);
    dispatch(st.tr.setSelection(at >= 0 ? TextSelection.create(st.doc, at) : NodeSelection.create(st.doc, ents[lo].at)));
  }
  return true;
}

export function selectAllBlocks(st, dispatch) {
  if (st.selection instanceof BlockSelection) return false;
  const { $from, $to } = st.selection;
  const one = $from.depth === 1 && $from.sameParent($to);
  const whole = one && $from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size;
  if (one && !whole && $from.parent.content.size) {
    if (dispatch) dispatch(st.tr.setSelection(TextSelection.create(st.doc, $from.start(), $from.end())));
    return true;
  }
  if (dispatch) dispatch(st.tr.setSelection(new BlockSelection(st.doc.resolve(0), st.doc.resolve(st.doc.content.size))));
  return true;
}
