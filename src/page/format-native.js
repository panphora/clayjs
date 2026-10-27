// The four formats this release adds: underline, text color, highlight and the
// quote block.
//
// Each is written as the named descriptor an older runtime already keeps as an
// opaque mark, `x["text_color",{"color":"red"}]`, so R reads back exactly what F
// wrote. The palette is fixed and its keys are the only colors a descriptor may
// name: one naming any other color stays opaque rather than being read as a
// style, and no command accepts arbitrary CSS.
//
// Every command that writes one of them goes through runFormat, which is the
// editor's own format gate: nothing is applied and no descriptor is written
// unless the gate answered "applied".
import { history } from "../vendor/prosemirror.vendor.js";
import { schema } from "./schema.js";

// blocks.js's STEP, read here rather than imported from it: this module is part
// of the projection's graph, and blocks.js reads the projection's constants as it
// loads. A command of ours is one undo item by itself, like every other command.
const STEP = "page-step";
const asStep = (tr) => history.closeHistory(tr).setMeta(STEP, true);

export const NATIVE_NAMES = new Set(["underline", "text_color", "highlight"]);

export const PALETTE = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
const COLORS = new Set(PALETTE);

// The descriptor attrs of a native mark, or null when this name and these attrs
// are not one of the formats this runtime writes.
export function nativeAttrs(name, attrs) {
  const plain = attrs !== null && typeof attrs === "object" && !Array.isArray(attrs);
  if (name === "underline") return plain && Object.keys(attrs).length === 0 ? {} : null;
  if (name === "text_color" || name === "highlight") {
    const keys = plain ? Object.keys(attrs) : [];
    return keys.length === 1 && keys[0] === "color" && COLORS.has(attrs.color) ? { color: attrs.color } : null;
  }
  return null;
}

// Whether this selection holds text the mark may be added to: a code block takes
// no marks, and a block selection is not text at all.
export function markable(st, type) {
  const { $from, $to, empty } = st.selection;
  if (empty) return $from.parent.type.allowsMarkType(type);
  let ok = false;
  st.doc.nodesBetween($from.pos, $to.pos, (node, _at, parent) => {
    if (!ok && node.isText && parent?.type.allowsMarkType(type)) ok = true;
  });
  return ok;
}

const holds = (mark, attrs) => !!mark && Object.keys(mark.type.attrs).every((name) => mark.attrs[name] === attrs[name]);

function toggle(view, type, attrs) {
  const st = view.state;
  const { from, to, empty, $from } = st.selection;
  const tr = st.tr;
  if (empty) {
    if (holds(type.isInSet(st.storedMarks || $from.marks()), attrs)) tr.removeStoredMark(type);
    else tr.addStoredMark(type.create(attrs));
  } else {
    let all = true;
    st.doc.nodesBetween(from, to, (node) => {
      if (all && node.isText && !holds(type.isInSet(node.marks), attrs)) all = false;
    });
    if (all) tr.removeMark(from, to, type);
    else tr.addMark(from, to, type.create(attrs));
  }
  view.dispatch(asStep(tr));
  return true;
}

function remove(view, type) {
  const st = view.state;
  const tr = st.tr;
  if (st.selection.empty) tr.removeStoredMark(type);
  else tr.removeMark(st.selection.from, st.selection.to, type);
  view.dispatch(asStep(tr));
  return true;
}

// The gate, in one place: an editor mounted without one cannot write a floor-1
// format, and a refusal leaves the content exactly as it was.
export function runFormat(view, apply) {
  const run = view.runFormatCommand;
  if (typeof run !== "function") return Promise.resolve({ status: "unsupported-host", code: "page-format-unsupported", retry: false });
  return run(apply);
}

// A mark command: toggle it on the selection, or with reset take it off. A
// selection the mark cannot reach is refused before the gate is asked, so a code
// block never raises the document's floor.
export function formatMark(view, name, attrs = {}, { reset = false } = {}) {
  const type = schema.marks[name];
  if (!type) return Promise.resolve({ status: "refused", code: "unsupported-format" });
  if (!view.editable) return Promise.resolve({ status: "refused", code: "not-editable" });
  if (!markable(view.state, type)) return Promise.resolve({ status: "refused", code: "mark-not-allowed" });
  return runFormat(view, () => (reset ? remove(view, type) : toggle(view, type, attrs)));
}
