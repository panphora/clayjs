import { createPageEditor } from "../../../src/page/editor.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";

const { TextSelection } = pmState;

// spec: [id, type, text, attrs]; positions are "B", "C", ... so order is spec order.
export const blocksOf = (spec) => {
  const out = {};
  spec.forEach(([id, t, c, attrs = {}], i) => { out[id] = { t, pos: String.fromCharCode(66 + i), c, ...attrs }; });
  return out;
};
export const editor = (spec, options = {}) => createPageEditor(document.body.appendChild(document.createElement("div")), { blocks: blocksOf(spec), ...options });
export const posOf = (view, id, end = false) => {
  let p = null;
  view.state.doc.forEach((n, o) => { if (n.attrs.id === id) p = end ? o + n.nodeSize - 1 : o + 1; });
  return p;
};
export const select = (view, from, to = from) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
export const keyOn = (el, k, opts = {}) => {
  const event = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts });
  el.dispatchEvent(event);
  return event.defaultPrevented;
};
export const key = (view, k, opts = {}) => keyOn(view.dom, k, opts);
export const shape = (view) => { const r = []; view.state.doc.forEach((n) => r.push(`${n.textContent || n.type.name}${n.attrs.parent ? "<" + n.attrs.parent : ""}`)); return r.join(" | "); };
export const ids = (view) => { const r = []; view.state.doc.forEach((n) => r.push(n.attrs.id)); return r; };
// Types text the way ProseMirror's input handler does: plugins first, then a plain insert.
export const typeText = (view, text) => {
  const { from, to } = view.state.selection;
  const handled = view.someProp("handleTextInput", (f) => f(view, from, to, text, () => view.state.tr.insertText(text, from, to)));
  if (!handled) view.dispatch(view.state.tr.insertText(text, from, to));
  return !!handled;
};
