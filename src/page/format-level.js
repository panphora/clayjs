// The document format floor: how much of the page format a runtime must know
// before it may write.
//
// The canonical marker is document metadata, outside the unchanged `{v,g,y}`
// page value:
//   <meta name="clay-page-format" content="1">
// Absence means floor 0. A document's floor only ever rises, and every path that
// writes a page declares the capability it writes with in
// `X-Clay-Page-Format`. The value is protocol capability, not authorization: the
// host still applies every permission check.
//
// `requiredPageFormat` answers the other direction: what floor does THIS content
// need? Its registry is frozen at R (floor 1), so it does not shrink back as a
// later release adds native schema support.

export const PAGE_FORMAT = 1;
export const PAGE_FORMAT_HEADER = "X-Clay-Page-Format";
export const PAGE_FORMAT_META = "clay-page-format";
export const PAGE_FORMAT_EXTENSION = "page-format-v1";
export const PAGE_FORMAT_UPGRADE = "page-format-upgrade-required";

// Every helper here is a plain function with no top-level work, so a client that
// imports one of them carries only that one.
const level = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);

const metaTag = (html) => /<meta\b[^>]*\bname\s*=\s*["']?clay-page-format["']?[^>]*>/i.exec(html);

// A capability as a request declares it: a missing or unreadable header is no
// capability at all, so it can never authorize a write.
export function formatCapability(value) {
  if (typeof value === "number") return level(value);
  if (typeof value !== "string" || !/^\s*\d+\s*$/.test(value)) return 0;
  return level(Number(value));
}

// The floor a document carries. Absent or unreadable metadata is floor 0.
export function pageFormatFloor(html) {
  if (typeof html !== "string") return 0;
  const tag = metaTag(html);
  if (!tag) return 0;
  const content = /\bcontent\s*=\s*["']?(\d+)/i.exec(tag[0]);
  return content ? level(Number(content[1])) : 0;
}

// The same document with its floor marker set to `floor`, or with every marker
// gone at 0. Canonical by construction, so it is idempotent: a document already
// at that floor comes back unchanged.
export function withPageFormatFloor(html, floor) {
  const want = level(floor);
  if (typeof html !== "string" || !want) return html;
  const tag = metaTag(html);
  if (tag && pageFormatFloor(tag[0]) === want) return html;
  const marker = `<meta name="${PAGE_FORMAT_META}" content="${want}">`;
  if (tag) return html.slice(0, tag.index) + marker + html.slice(tag.index + tag[0].length);
  const at = /<\/head\s*>/i.exec(html) || /<body\b/i.exec(html);
  return at ? html.slice(0, at.index) + marker + html.slice(at.index) : marker + html;
}

// The floor this tab last saw the document at. A save goes out with its capture
// repaired to this floor, so a capture taken before activation cannot drop the
// marker by omitting it.
let known = 0;
export const knownPageFormatFloor = () => known;
export function notePageFormatFloor(value) {
  known = Math.max(known, level(value));
  return known;
}

// The floor-0 registry, frozen: every block type, mark code and block field R
// understood when the floor was introduced. Built on first ask, so a client that
// never checks content for its floor never carries the list.
const REGISTRY = {
  types: [
    "paragraph", "heading", "list_item", "callout", "code_block", "toggle",
    "divider", "image", "file", "table", "chart", "board", "tool", "preserved",
  ],
  marks: ["a", "b", "c", "i", "s"],
  fields: [
    "id", "t", "parent", "c", "m", "level", "kind", "indent", "checked", "owner",
    "due", "lang", "open", "src", "alt", "caption", "width", "align", "name",
    "size", "mime", "cols", "rows", "sort", "source", "series", "title",
    "highlight", "columns", "cards", "artifact", "rev", "state", "html", "pos",
  ],
};
let frozen = null;

export function floorZero() {
  if (!frozen) {
    frozen = Object.freeze({
      types: Object.freeze([...REGISTRY.types]),
      marks: Object.freeze([...REGISTRY.marks]),
      fields: Object.freeze([...REGISTRY.fields]),
    });
  }
  return frozen;
}

const CODE = /^[A-Za-z]$/;

// A mark key holds one code per mark, each followed by its attrs as a JSON array
// when it carries them. Anything this registry has no code for is a newer
// runtime's: an unfamiliar compact token, or `x` with a named extension.
function newerMark(key) {
  if (typeof key !== "string") throw new TypeError("page: a mark key is not a string");
  if (!key || key[0] === "@") return false;
  for (let i = 0; i < key.length;) {
    const code = key[i];
    if (!CODE.test(code)) throw new SyntaxError(`page: malformed mark key ${key}`);
    if (!floorZero().marks.includes(code)) return true;
    i += 1;
    if (key[i] !== "[") continue;
    let depth = 0, quoted = false;
    const start = i;
    for (; i < key.length; i++) {
      const ch = key[i];
      if (quoted) {
        if (ch === "\\") i++;
        else if (ch === '"') quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === "[") depth++;
      else if (ch === "]" && --depth === 0) { i++; break; }
    }
    if (i >= key.length && key[key.length - 1] !== "]") throw new SyntaxError(`page: unterminated attrs in mark key ${key.slice(start)}`);
  }
  return false;
}

const newerRuns = (m) => {
  if (!Array.isArray(m)) return false;
  for (const run of m) {
    if (Array.isArray(run)) {
      if (run.length === 2 && Number.isInteger(run[0]) && newerMark(run[1])) return true;
    } else if (newerMark(run)) return true;
  }
  return false;
};

/**
 * The floor a prospective semantic model needs: 1 when it holds a named
 * extension mark, an unfamiliar compact token, an unfamiliar block or a block
 * field the floor-0 registry does not know, 0 otherwise.
 *
 * @param {Array<Object>} model - items as projection.js projects them
 * @returns {number}
 */
export function requiredPageFormat(model) {
  if (!Array.isArray(model)) throw new TypeError("page: requiredPageFormat expects a model");
  for (const item of model) {
    if (!item || typeof item !== "object") continue;
    if (!floorZero().types.includes(item.t)) return PAGE_FORMAT;
    for (const key of Object.keys(item)) {
      if (!floorZero().fields.includes(key)) return PAGE_FORMAT;
    }
    if (newerRuns(item.m)) return PAGE_FORMAT;
    if (!Array.isArray(item.rows)) continue;
    for (const row of item.rows) {
      for (const cell of Object.values(row?.cells ?? {})) {
        if (cell && typeof cell === "object" && newerRuns(cell.m)) return PAGE_FORMAT;
      }
    }
  }
  return 0;
}

/**
 * One floor decision for every writer: the client's activation gate and the
 * room's admission helper ask the same question and get the same answer.
 *
 * `floor` is the document's active floor, `required` what the prospective model
 * needs, `capability` what this writer declares, and `admitted` the capabilities
 * of the page editors already in the room. A write is refused before any
 * mutation when this writer is below what the content needs, and a floor rise is
 * refused while an admitted editor could not read the result.
 *
 * @param {Object} input
 * @param {number} [input.floor]
 * @param {number} [input.required]
 * @param {number} [input.capability]
 * @param {number[]} [input.admitted]
 * @returns {{ok: boolean, activate: boolean, floor: number, required: number}}
 */
export function pageFormatDecision({ floor = 0, required = 0, capability = 0, admitted = [] } = {}) {
  const active = level(floor);
  const needs = Math.max(level(required), active);
  const refuse = (minimum) => ({ ok: false, activate: false, floor: active, required: needs, minimum });
  if (formatCapability(capability) < needs) return refuse(needs);
  const activate = needs > active;
  if (activate && admitted.some((value) => formatCapability(value) < needs)) return refuse(needs);
  return { ok: true, activate, floor: needs, required: needs };
}

// What a refused writer is told: which floor the document needs and that its own
// unsaved work is still its own. Nothing here is a reload.
export function pageFormatRefusal(required, message = null) {
  const minimum = level(required) || PAGE_FORMAT;
  const error = new Error(message ?? `This document uses a newer page format (floor ${minimum}); update the editor to keep writing`);
  error.name = "PageFormatUpgradeRequired";
  error.code = PAGE_FORMAT_UPGRADE;
  error.statusCode = 409;
  error.minimum = minimum;
  return error;
}
