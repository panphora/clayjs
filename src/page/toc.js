// The table of contents: the headings a document has and the anchors that link to them.
// No DOM here, so the saved renderer, the editor's node view and the reader's revealer
// ask one helper. An anchor is `page-block-` plus the base64url of the heading's block
// id in UTF-8, never its text: a renamed or moved heading keeps every link to it.

export const TOC_LABEL = "Table of contents";
export const TOC_ANCHOR = "page-block-";
export const TOC_MAX_LEVEL = 3;
// What an entry with no words reads, as the document title does.
const UNTITLED = "Untitled";

const b64url = (text) => {
  let bin = "";
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (text) => {
  const bin = atob(String(text).replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
};

export const blockAnchor = (id) => `${TOC_ANCHOR}${b64url(String(id ?? ""))}`;

// The block id a link names: this runtime's anchor, or the `#<encoded data-id>` link an
// older page copied.
export function idFromHref(href) {
  const hash = String(href ?? "").replace(/^#/, "");
  if (!hash) return null;
  try {
    return hash.startsWith(TOC_ANCHOR) ? fromB64url(hash.slice(TOC_ANCHOR.length)) : decodeURIComponent(hash);
  } catch {
    return null;
  }
}

const levelOf = (item) => (item.t === "heading"
  ? Math.min(6, Math.max(1, Number.isInteger(item.level) ? item.level : 2))
  : item.t === "toggle" && (item.level === 1 || item.level === 2 || item.level === 3) ? item.level : 0);
// The title is the first root H1, as document-title.js reads it.
const isTitle = (item) => item.t === "heading" && (item.level ?? 2) === 1 && (item.parent ?? null) === null;
const maxOf = (value) => (Number.isInteger(value) && value >= 1 && value <= 6 ? value : TOC_MAX_LEVEL);
const label = (item) => String(item.c ?? "").replace(/[\s\uFFFC]+/gu, " ").trim() || UNTITLED;

// The entries the model's headings make, in document order: every heading and toggle
// heading down to `maxLevel`, the ones inside closed toggles included and the title's own
// H1 never. An empty heading still has an entry, reading Untitled.
export function tocEntries(model, maxLevel = TOC_MAX_LEVEL) {
  const max = maxOf(maxLevel);
  const title = model.find(isTitle) ?? null;
  const out = [];
  for (const item of model) {
    const level = levelOf(item);
    if (!item.id || !level || level > max || item === title) continue;
    out.push({ id: item.id, level, text: label(item) });
  }
  return out;
}

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#13;");
const escAttr = (text) => esc(text).replace(/"/g, "&quot;");

// The saved form: nested lists of links in a `nav`, which a page read without the editor
// still follows. Depth is the headings' own.
export function tocHtml(item, model) {
  const entries = tocEntries(model, item.maxLevel);
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const entry of entries) {
    while (stack.length > 1 && stack[stack.length - 1].level >= entry.level) stack.pop();
    const node = { ...entry, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  const list = (nodes) => `<ul>${nodes.map((node) => `<li><a href="#${blockAnchor(node.id)}">${esc(node.text)}</a>${node.children.length ? list(node.children) : ""}</li>`).join("")}</ul>`;
  const level = item.maxLevel == null ? "" : ` data-max-level="${escAttr(item.maxLevel)}"`;
  return `<nav aria-label="${TOC_LABEL}" data-type="toc" data-id="${escAttr(item.id ?? "")}"${level}>${entries.length ? list(root.children) : ""}</nav>`;
}
