// clay.live(name): this page's <script type="application/json" merge="name"
// clay="live"> tag as a live object. The store (src/live/store.js) holds the
// value in memory and never writes the tag.

import { createStore } from "../live/store.js";
import { HyperMorph } from "../vendor/hyper-morph.vendor.js";

const NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const stores = new Map();

function isJsonType(type) {
  const t = (type || "").split(";")[0].trim().toLowerCase();
  return t === "application/json" || t.endsWith("+json");
}

// The live tags on the page, by name. A name used twice is left out: neither
// tag can be the store.
export function liveTags(root = document) {
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
    console.warn(`clay.live: more than one live tag is named "${name}", so none of them is live`);
    found.delete(name);
  }
  return found;
}

export function live(name) {
  const existing = stores.get(name);
  if (existing) return existing.handle;
  const tag = liveTags().get(name);
  if (!tag) throw new Error(`clay.live: this page has no <script type="application/json" merge="${name}" clay="live"> tag`);
  let value;
  try {
    value = HyperMorph.parseJsonRelaxed(tag.element.textContent);
  } catch (err) {
    throw new SyntaxError(`clay.live("${name}"): the tag's JSON does not parse: ${err.message}`);
  }
  const store = createStore({ name, value, ephemeral: tag.ephemeral });
  stores.set(name, store);
  return store.handle;
}

// For the other live modules: the store behind a name, or every open store.
export function storeOf(name) {
  return stores.get(name) || null;
}

export function openStores() {
  return [...stores.values()];
}

export default live;
