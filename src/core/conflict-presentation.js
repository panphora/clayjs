// What a replaced edit is called in the notice, and what it said. Pure: reads the
// page, never writes it. Names come from what the person can see (the element's
// kind and the nearest heading above it), never from authored ids.

const KIND = {
  p: "Paragraph", a: "Link", li: "List item", ul: "List", ol: "List", img: "Image",
  section: "Section", article: "Article", div: "Block", span: "Text", td: "Table cell",
  th: "Table cell", tr: "Table row", table: "Table", button: "Button", blockquote: "Quote",
  pre: "Code block", code: "Code", script: "Data block", style: "Style", figure: "Figure",
  video: "Video", input: "Field", textarea: "Field", select: "Field", label: "Label",
  template: "Template",
};

const ATTR = {
  href: "Link address", alt: "Image description", title: "Tooltip", class: "Style",
  style: "Style", value: "Field value", placeholder: "Placeholder",
};

const CONTAINERS = new Set(["section", "article", "div", "li", "aside", "main", "header", "footer", "nav"]);
const HIDDEN = new Set(["script", "style", "template", "noscript"]);
const HEADINGS = "h1,h2,h3,h4,h5,h6";
const CONTEXT = 40;

export function cut(text, max = CONTEXT) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

// The engine's slices can carry inline markup. Parsed inert, text only: nothing
// from another tab's edit is ever put into the notice as HTML.
export function plain(html) {
  if (html == null) return "";
  const t = document.createElement("template");
  t.innerHTML = String(html);
  return t.content.textContent;
}

function elementOf(node) {
  if (!node) return null;
  return node.nodeType === 1 ? node : node.parentElement;
}

// A node inside a live <template>'s content is not on the page; its host is.
function hostOf(node) {
  let n = node;
  while (n) {
    if (n.isConnected) return elementOf(n);
    const root = n.getRootNode?.();
    if (root && root.nodeType === 11 && root.host) { n = root.host; continue; }
    const tpl = root && root.nodeType === 11 ? findTemplateOwning(root) : null;
    if (tpl) { n = tpl; continue; }
    return null;
  }
  return null;
}

function findTemplateOwning(fragment) {
  for (const t of document.querySelectorAll("template")) if (t.content === fragment) return t;
  return null;
}

function kindName(el) {
  if (!el) return "Edit";
  const tag = el.localName;
  if (/^h[1-6]$/.test(tag)) return "Heading";
  return KIND[tag] || tag.charAt(0).toUpperCase() + tag.slice(1);
}

export function headingAbove(node) {
  let found = null;
  for (const h of document.body.querySelectorAll(HEADINGS)) {
    if (h === node || h.contains(node)) continue;
    if (h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) found = h;
  }
  return found ? cut(found.textContent) : null;
}

function nameOfElement(el, attrName) {
  if (!el) return attrName ? `"${attrName}" attribute` : "Edit";
  if (attrName) {
    const label = attrName === "src"
      ? (el.localName === "img" || el.localName === "video" ? "Image address" : "Address")
      : ATTR[attrName] || `"${attrName}" attribute`;
    const under = el.isConnected ? headingAbove(el) : null;
    return under ? `${label} under ${under}` : label;
  }
  if (HIDDEN.has(el.localName)) return kindName(el);
  if (/^h[1-6]$/.test(el.localName)) {
    const under = headingAbove(el);
    return under ? `Heading under ${under}` : "Page heading";
  }
  if (CONTAINERS.has(el.localName)) {
    const own = el.querySelector(HEADINGS);
    if (own && own.textContent.trim()) return `${cut(own.textContent)} section`;
  }
  const kind = kindName(el);
  const under = el.isConnected ? headingAbove(el) : null;
  return under ? `${kind} under ${under}` : kind;
}

// Up to 40 characters either side of the clash, cut back to a word boundary, with
// the ellipsis only where something was left out.
export function textContext(full, start, end) {
  let before = full.slice(Math.max(0, start - CONTEXT), start);
  let after = full.slice(end, end + CONTEXT);
  let cutBefore = start - CONTEXT > 0;
  let cutAfter = end + CONTEXT < full.length;
  if (cutBefore) {
    const i = before.indexOf(" ");
    before = i >= 0 ? before.slice(i + 1) : before;
  }
  if (cutAfter) {
    const i = after.lastIndexOf(" ");
    after = i >= 0 ? after.slice(0, i) : after;
  }
  return { before, after, cutBefore, cutAfter };
}

function side(hit, ctx) {
  return { before: ctx?.before || "", hit, after: ctx?.after || "", cutBefore: !!ctx?.cutBefore, cutAfter: !!ctx?.cutAfter };
}

const SENTENCE = {
  "edit-beats-delete": (k) => `You deleted this ${k}. The other edit changed it at the same time, so it is still here.`,
  "move-beats-delete": (k) => `You deleted this ${k}. The other edit moved it at the same time, so it is still here.`,
  "both-moved": (k) => `You moved this ${k}. The other edit moved it somewhere else. Their place is showing.`,
  "both-reordered": (k) => `You reordered the items in this ${k}. The other edit reordered them too. Their order is showing.`,
  "insert-collision": () => "You added something here. The other edit added something else in the same place. Theirs is showing.",
};

export function structuralSentence(record, kind) {
  const reason = record.detail || record.reason;
  const make = SENTENCE[reason];
  return make ? make(kind.toLowerCase()) : "Your change here was replaced by the other edit.";
}

export function rowOf(record) {
  const id = record.id;
  if (record.kind === "attr") {
    const el = record.el || null;
    return {
      id, kind: "attr", name: nameOfElement(el, record.name), target: hostOf(el),
      yours: side(String(record.local ?? "")), now: side(String(record.remote ?? "")), sentence: null,
    };
  }
  if (record.kind === "structure") {
    const live = record.el && record.el.isConnected ? record.el : null;
    const shape = live || record.base || record.el || null;
    const kind = kindName(elementOf(shape));
    const sentence = structuralSentence(record, kind);
    const both = typeof record.local === "string" && typeof record.remote === "string";
    return {
      id, kind: "struct", name: live ? nameOfElement(live) : kind, target: live ? hostOf(live) : null,
      yours: both ? side(plain(record.local)) : null, now: both ? side(plain(record.remote)) : null, sentence,
    };
  }
  const host = hostOf(record.node);
  const el = elementOf(record.node);
  const name = el && HIDDEN.has(el.localName) ? kindName(el)
    : record.node?.nodeType === 8 ? "Comment"
    : nameOfElement(el);
  // Inline-merge slices (they carry lss) are HTML; whole-text and word-level
  // conflicts are the raw text itself, and parsing that as HTML would eat a literal <.
  const html = typeof record.lss === "number";
  const text = (v) => (v == null ? "" : Array.isArray(v) ? v.join("") : String(v));
  const yours = html ? plain(record.local) : text(record.local);
  const now = html ? plain(record.remote) : text(record.remote);
  let ctx = null;
  if (Array.isArray(record.range) && record.node) {
    const full = record.node.textContent;
    const [start, end] = record.range;
    if (full.slice(start, end) === now) ctx = textContext(full, start, end);
  }
  return {
    id, kind: "text", name, target: host && !HIDDEN.has(host.localName) ? host : (host ? visibleContainer(host) : null),
    yours: side(yours, ctx), now: side(now, ctx), sentence: null,
  };
}

function visibleContainer(el) {
  let n = el.parentElement;
  while (n && HIDDEN.has(n.localName)) n = n.parentElement;
  return n && n !== document.documentElement ? n : null;
}
