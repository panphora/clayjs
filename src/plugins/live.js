// clay.live(name): this page's <script type="application/json" merge="name"
// clay="live"> tag as a live object. The store (src/live/store.js) holds the
// value in memory and never writes the tag. This module carries the value in and
// out at file speed: it writes the value into every capture, confirms this tab's
// ops when the save that carried them is accepted (never from an incoming frame),
// and takes the values other tabs saved or relayed from each live-sync frame.

import { createStore } from "../live/store.js";
import { serializeLive, stampOf, parseStamp } from "../live/ops.js";
import { onSnapshot } from "../core/snapshot.js";
import { onSaveAccepted } from "../core/save-core.js";
import { savePageForce, baselineSettled, isSaveConflicted, autosaveIsSuspended } from "../core/save.js";
import { withKeepalive } from "../core/save-core.js";
import { isEditMode } from "../core/is-edit-mode.js";
import { createCheckpoints } from "../live/checkpoint.js";
import { HyperMorph } from "../vendor/hyper-morph.vendor.js";
import { hostSupports } from "../core/host-meta.js";
import { createFastLane } from "../live/fast-lane.js";
import { serverTransport } from "../live/server-lane.js";
import { localTransport, localLaneSupported } from "../live/local-lane.js";

const NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const entries = new Map();

// What the save on the wire captured, per saved store: { text, mark, lastSeq }.
// Set by the save's own capture, taken by its acceptance. Only one save is on the
// wire at a time.
let pinned = null;

// Saved stores with changes no accepted save holds yet. Only an edit-mode tab
// saves. In file mode that is this tab's unconfirmed ops; in fast mode it is a
// room seq past the one the last accepted save held, and only the writer saves it.
function unsavedLiveChanges() {
  if (!isEditMode) return false;
  for (const entry of entries.values()) {
    if (entry.store.ephemeral) continue;
    if (entry.store.handle.status.mode === "fast") {
      if (fast?.isWriter() && entry.lastSeq > entry.savedSeq) return true;
    } else if (entry.store.pending.length > 0) {
      return true;
    }
  }
  return false;
}

const checkpoints = createCheckpoints({
  needsSave: unsavedLiveChanges,
  blocked: () => !baselineSettled() || isSaveConflicted() || autosaveIsSuspended(),
  save: () => savePageForce(),
  saveNow: () => withKeepalive(true, () => savePageForce()),
});

// The fast lane, on a host that advertises live-data. Started by the first
// clay.live() call in an edit-mode tab.
let fast = null;
let laneRequested = false;
let local = null;

// What this tab holds for every live tag, for the room it starts when it becomes
// the local sequencer: an open store's authoritative value (never its own
// unconfirmed ops, which its lane resends), or the tag's value; with the tag's
// text, the file's last text for that store.
function seedLocalRoom() {
  const values = new Map();
  for (const [name, tag] of liveTags(document, { warn: false })) {
    const text = tag.element.textContent;
    const entry = entries.get(name);
    if (entry) {
      values.set(name, { value: entry.store.authoritative, ephemeral: entry.store.ephemeral, text });
      continue;
    }
    try {
      const value = HyperMorph.parseJsonRelaxed(text);
      if (value !== null && typeof value === "object") values.set(name, { value, ephemeral: tag.ephemeral, text });
    } catch {}
  }
  return values;
}

function ensureLane() {
  if (laneRequested || !isEditMode) return;
  laneRequested = true;
  hostSupports("live-data").then(
    (supported) => {
      if (supported) {
        fast = createFastLane({
          transport: serverTransport(),
          entries,
          onWriter: () => checkpoints.changed(),
          onApplied: () => checkpoints.changed(),
        });
      } else if (localLaneSupported()) {
        local = localTransport({ seed: seedLocalRoom });
        fast = createFastLane({ transport: local, entries, onWriter: () => checkpoints.changed(), onApplied: () => checkpoints.changed() });
      } else {
        return;
      }
      // The writer saves every store in the room, so every live tag is opened,
      // not only the ones this page's code asked for.
      for (const name of liveTags(document, { warn: false }).keys()) {
        if (entries.has(name)) continue;
        try {
          live(name);
        } catch {}
      }
      fast.start();
    },
    () => {},
  );
}

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

// In fast mode a capture writes the room's value, never this tab's unconfirmed
// ops (the room may still refuse them).
function textOf(entry) {
  const value = entry.store.handle.status.mode === "fast" ? entry.store.authoritative : entry.store.value;
  return entry.pretty ? JSON.stringify(value, null, 2).replace(/</g, "\\u003c") : serializeLive(value);
}

// A value another tab saved or relayed. It never confirms this tab's ops: equal
// text from a peer is not this tab's save.
function receive(entry, text, source) {
  let value;
  try {
    value = HyperMorph.parseJsonRelaxed(text);
  } catch {
    return;
  }
  if (entry.store.rebase(value, { source })) entry.framesSince = true;
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
  const entry = { store, pretty: text.includes("\n"), framesSince: false, lastSeq: 0, savedSeq: 0 };
  entries.set(name, entry);
  if (!tag.ephemeral) store.onLocal(() => checkpoints.changed());
  store.onLocal((ops) => fast?.local(name, ops, store.mark));
  store.handle.on("change", () => {
    if (!store.ephemeral && store.handle.status.mode === "fast") checkpoints.changed();
  });
  fast?.storeOpened(name);
  ensureLane();
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
    // The room position this value was written at, and its hash: how the host
    // tells the room's own checkpoint from an outside edit, and merges the edit.
    if (entry.store.handle.status.mode === "fast" && fast) tag.element.setAttribute("live-at", stampOf(fast.status.epoch, fast.status.seq, text));
  }
});

// The save's own capture (the one that is sent): pin what each saved store wrote
// and the newest op it held. onSnapshot has already written the clone.
document.addEventListener("clay:snapshot-ready", (event) => {
  if (event.detail?.forSave !== true || !entries.size) return;
  const tags = liveTags(event.detail.documentElement, { warn: false });
  const stores = new Map();
  for (const entry of entries.values()) {
    if (entry.store.ephemeral) continue;
    const tag = tags.get(entry.store.name);
    if (!tag) continue;
    stores.set(entry.store.name, { text: tag.element.textContent, mark: entry.store.mark, lastSeq: entry.lastSeq });
    entry.framesSince = false;
  }
  pinned = stores;
});

// The bytes a host just accepted. When a store's tag in them is the text the
// save's own capture wrote, the ops that capture held are in the file: folded
// into the store's base when nothing arrived since the capture, only dropped
// when a frame did (that frame descends from this save and holds them already).
export function confirmSaved(html) {
  const pin = pinned;
  pinned = null;
  if (!pin || typeof html !== "string") return;
  const tags = liveTags(parseHtml(html), { warn: false });
  for (const [name, saved] of pin) {
    const entry = entries.get(name);
    const tag = tags.get(name);
    if (!entry || !tag || tag.element.textContent !== saved.text) continue;
    if (entry.store.handle.status.mode === "file") {
      if (entry.framesSince) entry.store.rebase(entry.store.authoritative, { source: "state", through: saved.mark });
      else entry.store.confirm(saved.mark);
    } else {
      entry.savedSeq = Math.max(entry.savedSeq, saved.lastSeq);
      // The sequencer's own save never comes back as a frame: tell every tab
      // how far the file now reaches.
      local?.landed(name, parseStamp(tag.element.getAttribute("live-at")));
    }
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
  if (local) {
    const frames = new Map();
    for (const [name, tag] of incoming) {
      if (tag.ephemeral) continue;
      frames.set(name, { text: tag.element.textContent, at: parseStamp(tag.element.getAttribute("live-at")) });
    }
    local.fileFrame(frames);
  }
  const page = liveTags(document, { warn: false });
  for (const [name, tag] of incoming) {
    const text = tag.element.textContent;
    const entry = entries.get(name);
    const at = tag.element.getAttribute("live-at");
    const pageTag = page.get(name)?.element;
    // The page's tag keeps the lineage of the version this tab last took, so a
    // file-mode save claims what it descends from.
    if (pageTag && (!entry || entry.store.handle.status.mode === "file")) {
      if (at === null) pageTag.removeAttribute("live-at");
      else if (pageTag.getAttribute("live-at") !== at) pageTag.setAttribute("live-at", at);
    }
    if (entry && !entry.store.ephemeral) {
      if (entry.store.handle.status.mode === "file") receive(entry, text, "remote");
      continue;
    }
    if (pageTag && pageTag.textContent !== text) pageTag.textContent = text;
  }
}

document.addEventListener("clay:sync-applied", (event) => receiveFrame(event.detail?.html));

// The last chance to save live changes made since the previous checkpoint. A
// keepalive body is capped near 60 KB; a larger page's save may not finish.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") checkpoints.flush();
});
window.addEventListener("pagehide", () => checkpoints.flush());

// For the other live modules: the store behind a name, or every open store.
export function storeOf(name) {
  return entries.get(name)?.store || null;
}

export function openStores() {
  return [...entries.values()].map((entry) => entry.store);
}

// The fast lane, for tests and the local tab lane.
export function fastLane() {
  return fast;
}

export default live;
