import { attrKeys, sameJson } from "./layout.js";
import { blockJson } from "../model.js";
import { marksKey, marksAttrs } from "./marks.js";

const implicitFlags = (doc) => {
  const seen = new Set(), out = [];
  doc.forEach((block) => { const id = block.attrs.id; const imp = typeof id === "string" && id.startsWith("~") && !seen.has(id); if (imp) seen.add(id); out.push(imp); });
  return out;
};
const pickAttrs = (node) => { const o = {}; for (const k of attrKeys(node.type)) o[k] = node.attrs[k]; if (node.type.name === "table") o.rows = blockJson(node).rows; return o; };

export function tokensOf(doc, alias = new Map(), visible = null) {
  const toks = [];
  const flags = implicitFlags(doc);
  doc.forEach((block, _o, index) => {
    const implicit = flags[index] && !alias.has(block.attrs.id);
    const brk = visible ? visible[index]?.brk ?? null : null;
    if (!implicit) toks.push({ k: "b", id: flags[index] && alias.has(block.attrs.id) ? alias.get(block.attrs.id) : block.attrs.id, t: block.type.name, attrs: pickAttrs(block), brk });
    if (block.isTextblock) block.content.forEach((n) => {
      if (n.isText) { const ms = block.type.name === "code_block" ? [] : n.marks; const mk = marksKey(ms), ma = marksAttrs(ms); for (let i = 0; i < n.text.length; i++) toks.push({ k: "c", ch: n.text[i], mk, ma }); }
      else if (n.type.name === "hard_break") toks.push({ k: "h" });
    });
  });
  return toks;
}

export function tokenIndex(doc, alias = new Map()) {
  const out = new Int32Array(doc.content.size + 1);
  let t = 0;
  const flags = implicitFlags(doc);
  doc.forEach((block, o, index) => {
    const implicit = flags[index] && !alias.has(block.attrs.id);
    const open = implicit ? 0 : 1;
    if (block.isTextblock) {
      const n = block.content.size;
      out[o] = t;
      for (let j = 0; j <= n; j++) out[o + 1 + j] = t + open + j;
      out[o + 2 + n] = t + open + n;
      t += open + n;
    } else {
      out[o] = t;
      out[o + block.nodeSize] = t + open;
      t += open;
    }
  });
  return out;
}

export const sameTok = (a, b) => a.k === b.k && (a.k === "b" ? a.id === b.id && a.t === b.t && sameJson(a.attrs, b.attrs) : a.k === "h" || (a.ch === b.ch && a.mk === b.mk));


export const yAfter = (holes, k) => { let n = k; for (const h of holes) if (h.at <= k) n += h.len; return n; };
export const yBefore = (holes, k) => { let n = k; for (const h of holes) if (h.at < k) n += h.len; return n; };
