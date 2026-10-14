// clay.live(name): this page's <script type="application/json" merge="name"
// clay="live"> tag as a live object. The store (src/live/store.js) holds the
// value in memory and never writes the tag. This module carries the value in and
// out at file speed: it writes the value into every capture, confirms this tab's
// ops when a save carrying them is accepted, and takes the values other tabs
// saved or relayed from each live-sync frame.

import { createStore } from "../live/store.js";
import { serializeLive } from "../live/ops.js";
import { onSnapshot } from "../core/snapshot.js";
import { onSaveAccepted } from "../core/save-core.js";
import { HyperMorph } from "../vendor/hyper-morph.vendor.js";

const NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const CAPTURES_KEPT = 16;
const entries = new Map();

function isJsonType(type) {
  const t = (type || "").split(";")[0].trim().toLowerCase();
  return t === "application/json" || t.endsWith("+json");
}

// The live tags under root, by name. A name used twice is left out: neither tag
// can be the store.
export function liveTags(root = document, { warn = true } = {}) {
  const found = new Map();
  const duplicated = new Set();
  for (const el of root.querySelectorAll('script[merge][clay~="live"]')) {
    if (el.hasAttribute("src") || !isJsonType(el.getAttribute("type"))) continue;
    const name = el.getAttribute("merge");
    if (!NAME.test(name)) continue;
    if (found.has(name)) {
      duplicated.add(name);
      continue;
    }
    found.set(name, { name, ephemeral: el.getAttribute("clay").split(/\s+/).includes("ephemeral"), element: el });
  }
  for (const name of duplicated) {
    if (warn) console.warn(`clay.live: more than one live tag is named "${name}", so none of them is live`);
    found.delete(name);
  }
  return found;
}

function parseHtml(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

function textOf(entry) {
  const value = entry.store.value;
  return entry.pretty ? JSON.stringify(value, null, 2).replace(/</g, "\\u003c") : serializeLive(value);
}

// The text a capture wrote, with the newest op it held. When that text comes
// back (an accepted save, or a frame carrying this tab's own save), every op up
// to that mark is in it.
function remember(entry, text) {
  entry.captures.delete(text);
  entry.captures.set(text, entry.store.mark);
  if (entry.captures.size > CAPTURES_KEPT) entry.captures.delete(entry.captures.keys().next().value);
}

function receive(entry, text, source) {
  let value;
  try {
    value = HyperMorph.parseJsonRelaxed(text);
  } catch {
    return;
  }
  const through = entry.captures.get(text);
  if (through === undefined) {
    entry.store.rebase(value, { source });
    return;
  }
  // An older save of this tab's, arriving after a newer one was confirmed.
  if (through < entry.confirmed) return;
  entry.confirmed = through;
  entry.store.rebase(value, { source, through });
}

export function live(name) {
  const existing = entries.get(name);
  if (existing) return existing.store.handle;
  const tag = liveTags().get(name);
  if (!tag) throw new Error(`clay.live: this page has no <script type="application/json" merge="${name}" clay="live"> tag`);
  const text = tag.element.textContent;
  let value;
  try {
    value = HyperMorph.parseJsonRelaxed(text);
  } catch (err) {
    throw new SyntaxError(`clay.live("${name}"): the tag's JSON does not parse: ${err.message}`);
  }
  const store = createStore({ name, value, ephemeral: tag.ephemeral });
  entries.set(name, { store, pretty: text.includes("\n"), captures: new Map(), confirmed: 0 });
  return store.handle;
}

// Every capture carries each saved store's current value. A never-saved store
// writes nothing: its tag keeps the text the file has.
onSnapshot((clone) => {
  if (!entries.size) return;
  const tags = liveTags(clone, { warn: false });
  for (const entry of entries.values()) {
    if (entry.store.ephemeral) continue;
    const tag = tags.get(entry.store.name);
    if (!tag) continue;
    const text = textOf(entry);
    tag.element.textContent = text;
    remember(entry, text);
  }
});

// The bytes a host just accepted: each saved store whose text in them is one of
// its own captures confirms the ops that capture held.
export function confirmSaved(html) {
  if (!entries.size || typeof html !== "string") return;
  const tags = liveTags(parseHtml(html), { warn: false });
  for (const entry of entries.values()) {
    if (entry.store.ephemeral) continue;
    const tag = tags.get(entry.store.name);
    if (!tag) continue;
    const text = tag.element.textContent;
    if (entry.captures.has(text)) receive(entry, text, "state");
  }
}

onSaveAccepted(confirmSaved);

// A live-sync frame. A saved store in file mode takes the frame's value and
// replays its own unconfirmed ops over it. Every other live tag (never-saved
// stores, and tags no code has opened) takes the frame's text into the page, so
// the next save keeps what the file now says instead of the text this tab
// loaded with.
export function receiveFrame(html) {
  if (typeof html !== "string" || !html) return;
  const incoming = liveTags(parseHtml(html), { warn: false });
  if (!incoming.size) return;
  const local = liveTags(document, { warn: false });
  for (const [name, tag] of incoming) {
    const text = tag.element.textContent;
    const entry = entries.get(name);
    if (entry && !entry.store.ephemeral) {
      if (entry.store.handle.status.mode === "file") receive(entry, text, "remote");
      continue;
    }
    const element = local.get(name)?.element;
    if (element && element.textContent !== text) element.textContent = text;
  }
}

document.addEventListener("clay:sync-applied", (event) => receiveFrame(event.detail?.html));

// For the other live modules: the store behind a name, or every open store.
export function storeOf(name) {
  return entries.get(name)?.store || null;
}

export function openStores() {
  return [...entries.values()].map((entry) => entry.store);
}

export default live;
