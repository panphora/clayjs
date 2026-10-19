import { model } from "../../../../../src/vendor/prosemirror.vendor.js";

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
