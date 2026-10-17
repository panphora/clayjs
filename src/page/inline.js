// A text block's inline content as the live record keeps it: c, its flat text,
// and m, one mark key per UTF-16 unit of c. The replay (replay.js) merges in
// this form; the editor gets ProseMirror nodes back from it.
//
// A mark key lists a unit's marks in schema order, one code each, a mark with
// attrs followed by their values as a JSON array:
//   ""                        no marks
//   "b"  "bi"  "c"            strong; strong and em; code
//   'a["https://x.test"]'     a link
//   'ba["https://x.test"]'    strong and a link
// An inline node that is not text (a hard break) is one U+FFFC whose key is
// "@" and the node's JSON. No mark key starts with "@", so a U+FFFC typed as
// text stays text. Private-use characters typed as text need nothing here:
// encodeForMerge (replay.js) gives each one a code of its own.
import { model } from "../vendor/prosemirror.vendor.js";

export const ATOM = "￼";
export const CODES = { strong: "b", em: "i", strike: "s", code: "c", link: "a" };
const NAMES = Object.fromEntries(Object.entries(CODES).map(([name, code]) => [code, name]));

export function markKey(marks) {
  let key = "";
  for (const mark of marks) {
    const code = CODES[mark.type.name];
    if (!code) throw new TypeError(`page: the mark ${mark.type.name} has no key code`);
    key += code;
    const names = Object.keys(mark.type.attrs);
    if (names.length) key += JSON.stringify(names.map((name) => mark.attrs[name]));
  }
  return key;
}

// The end of the JSON array that starts at s[i].
function arrayEnd(s, i) {
  let depth = 0, str = false;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (str) {
      if (ch === "\\") i++;
      else if (ch === '"') str = false;
    } else if (ch === '"') str = true;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) return i + 1;
  }
  throw new SyntaxError(`page: unterminated attrs in mark key ${s}`);
}

const parsed = new WeakMap();

export function marksOf(schema, key) {
  if (!key) return model.Mark.none;
  let cache = parsed.get(schema);
  if (!cache) parsed.set(schema, (cache = new Map()));
  let marks = cache.get(key);
  if (marks) return marks;
  marks = [];
  for (let i = 0; i < key.length;) {
    const type = schema.marks[NAMES[key[i]]];
    if (!type) throw new TypeError(`page: unknown mark code ${key[i]} in ${key}`);
    i++;
    let attrs = null;
    if (key[i] === "[") {
      const end = arrayEnd(key, i);
      const values = JSON.parse(key.slice(i, end));
      attrs = Object.fromEntries(Object.keys(type.attrs).map((name, j) => [name, values[j]]));
      i = end;
    }
    marks = type.create(attrs).addToSet(marks);
  }
  cache.set(key, marks);
  return marks;
}

export function flatten(content) {
  let c = "";
  const m = [];
  content.forEach((node) => {
    if (node.isText) {
      const key = markKey(node.marks);
      c += node.text;
      for (let i = 0; i < node.text.length; i++) m.push(key);
    } else {
      c += ATOM;
      m.push("@" + JSON.stringify(node.toJSON()));
    }
  });
  return { c, m };
}

const isHigh = (u) => u >= 0xd800 && u <= 0xdbff;
const textKey = (key) => (key && key[0] !== "@" ? key : "");

// The inline nodes for c and m. Marks the parent node type does not allow are
// dropped; the two halves of a surrogate pair always share one text node.
export function unflatten(schema, c, m, parent = null) {
  const nodes = [];
  const allowed = (marks) => (parent ? marks.filter((mark) => parent.allowsMarkType(mark.type)) : marks);
  for (let i = 0; i < c.length;) {
    const key = (m && m[i]) || "";
    if (c[i] === ATOM && key[0] === "@") {
      nodes.push(model.Node.fromJSON(schema, JSON.parse(key.slice(1))));
      i++;
      continue;
    }
    const run = textKey(key);
    let j = i + 1;
    while (j < c.length && !(c[j] === ATOM && ((m && m[j]) || "")[0] === "@") && textKey((m && m[j]) || "") === run) j++;
    if (j < c.length && isHigh(c.charCodeAt(j - 1))) j++;
    nodes.push(schema.text(c.slice(i, j), allowed(marksOf(schema, run))));
    i = j;
  }
  return nodes;
}
