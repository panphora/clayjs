// Tab-local state on saved elements. The ephemeral attribute holds words a
// script sets for this tab (selected, dragging), and an ephemeral:NAME marker
// makes the element's own NAME attribute tab-local too. A dialog's open is
// tab-local with no marker: showModal() sets it, and a dialog saved open is
// always a bug. Like route-active, none of it is saved, synced, undone or
// counted as a change. The marker itself is ordinary saved content.

export const EPHEMERAL_ATTR = "ephemeral";
const MARKER = "ephemeral:";
const NEVER = new Set(["class", "id", "data-id", "clay"]);

export function isEphemeralAttr(name, el) {
  if (name === EPHEMERAL_ATTR) return true;
  if (!name || !el || el.nodeType !== 1 || NEVER.has(name) || name.startsWith(MARKER)) return false;
  if (name === "open" && el.localName === "dialog") return true;
  return el.hasAttribute(MARKER + name);
}

function stripElement(el) {
  if (el.localName === "dialog" && el.hasAttribute("open")) el.removeAttribute("open");
  if (el.hasAttribute(EPHEMERAL_ATTR)) el.removeAttribute(EPHEMERAL_ATTR);
  const attrs = el.attributes;
  let names = null;
  for (let i = 0; i < attrs.length; i++) {
    const name = attrs[i].name;
    if (!name.startsWith(MARKER)) continue;
    const target = name.slice(MARKER.length);
    if (target && !NEVER.has(target)) (names || (names = [])).push(target);
  }
  if (names) for (const name of names) el.removeAttribute(name);
}

/** Remove ephemeral state from a snapshot clone, in place: the root and every descendant. */
export function stripEphemeral(root) {
  if (!root || root.nodeType !== 1) return;
  stripElement(root);
  for (const el of root.querySelectorAll("*")) stripElement(el);
}

function words(el) {
  return (el.getAttribute(EPHEMERAL_ATTR) || "").split(/\s+/).filter(Boolean);
}

function write(el, list) {
  if (list.length) el.setAttribute(EPHEMERAL_ATTR, list.join(" "));
  else el.removeAttribute(EPHEMERAL_ATTR);
}

export const ephemeral = {
  has(el, word) {
    return words(el).includes(word);
  },
  add(el, word) {
    const list = words(el);
    if (!list.includes(word)) write(el, [...list, word]);
  },
  remove(el, word) {
    const list = words(el);
    if (list.includes(word)) write(el, list.filter((w) => w !== word));
  },
  toggle(el, word, force) {
    const on = force === undefined ? !ephemeral.has(el, word) : !!force;
    if (on) ephemeral.add(el, word);
    else ephemeral.remove(el, word);
    return on;
  },
};
