import { schema } from "../../../src/page/schema.js";
import { docFromBlocks, identityPlugin, keysBetween } from "../../../src/page/model.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";
import { structurePlugin } from "../../../src/page/blocks.js";

const { EditorState, TextSelection } = pmState;

// spec: [id, type, text, attrs]
export function make(spec, extraPlugins = []) {
  const keys = keysBetween(null, null, spec.length);
  const blocks = {};
  spec.forEach(([id, t, c, attrs = {}], i) => { blocks[id] = { t, pos: keys[i], c, ...attrs }; });
  return EditorState.create({ doc: docFromBlocks(schema, blocks), plugins: [structurePlugin(), identityPlugin(), ...extraPlugins] });
}
export const at = (s, id, off = 0) => { let p = null; s.doc.forEach((n, o) => { if (n.attrs.id === id) p = o + 1 + off; }); return p; };
export const endOf = (s, id) => { let p = null; s.doc.forEach((n, o) => { if (n.attrs.id === id) p = o + n.nodeSize - 1; }); return p; };
export const caret = (s, id, off = 0) => s.apply(s.tr.setSelection(TextSelection.create(s.doc, at(s, id, off))));
export const run = (s, cmd) => { let out = s; cmd(s, (tr) => { out = s.apply(tr); }); return out; };
export const rows = (s) => { const r = []; s.doc.forEach((n) => r.push([n.attrs.id?.startsWith("b-") && n.attrs.id.length > 6 ? "NEW" : n.attrs.id, n.type.name, n.textContent, n.attrs.indent ?? null, n.attrs.parent])); return r; };
export const short = (s) => { const r = []; s.doc.forEach((n) => r.push(`${n.textContent}${n.type.name === "list_item" ? "@" + n.attrs.indent : ""}${n.attrs.parent ? "<" + n.attrs.parent : ""}`)); return r.join(" | "); };
