// clay.live(name): this page's <script type="application/json" merge="name"
// clay="live"> tag as a live object. The store (src/live/store.js) holds the
// value in memory and never writes the tag. This module carries the value in and
// out at file speed: it writes the value into every capture, confirms this tab's
// ops when the save that carried them is accepted (never from an incoming frame),
// and takes the values other tabs saved or relayed from each live-sync frame.

import { contains, parseBy, frameSet, descendants, unionRanges, formatBy } from "../live/provenance.js";
import { createStore } from "../live/store.js";
import { serializeLive, stampOf, parseStamp, textHash } from "../live/ops.js";
import { onSnapshot } from "../core/snapshot.js";
import { onSaveAccepted, isSaveInProgress } from "../core/save-core.js";
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

const captureAuthor = 'save_' + [...crypto.getRandomValues(new Uint32Array(4))].map((n) => n.toString(16).padStart(8, '0')).join('');
let captureNumber = 0;

function lineageOf(element) {
  const at = parseStamp(element.getAttribute('live-at'));
  if (!at || at.hash !== hashOfText(element.textContent)) return null;
  const raw = element.getAttribute('live-by');
  const by = raw === null ? null : parseBy(raw);
  if (raw !== null && !by) return null;
  if (by && by.v !== 2) return { disk: true };
  return { epoch: at.epoch, seq: at.seq, frames: frameSet(by), ancestors: descendants(by) };
}

function captureLineage(entry, forSave) {
  const base = entry.leftAt;
  if (!base || base.disk) return null;
  const pending = fast?.pendingFrames(entry.store.name, base, { reserve: forSave }) ?? { frames: [], complete: true };
  if (!pending.complete) return null;
  const frames = unionRanges(base.frames ?? [], pending.frames);
  const ancestors = base.ancestors ?? [];
  const text = serializeLive(entry.store.value);
  const key = JSON.stringify([base.epoch, base.seq, frames, ancestors, entry.store.mark, text]);
  if (entry.capture?.key === key) return entry.capture.value;
  const by = { v: 2, frames, ancestors, capture: [captureAuthor, captureNumber + 1] };
  const encoded = formatBy(by);
  const value = encoded ? { at: stampOf(base.epoch, base.seq, text), by: encoded } : null;
  entry.capture = { key, value };
  return value;
}


// What the save on the wire captured, per saved store: { mode, mark, canonical,
// at }. Set by the save's own capture, taken by its acceptance or its failure.
// Only one save is on the wire at a time.
let pinned = null;

// A JSON text as the value it holds, so formatting (spacing, key order) never
// decides a match.
function sortedKeys(value) {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortedKeys(value[key]);
  return out;
}

function canonical(text) {
  try {
    return JSON.stringify(sortedKeys(HyperMorph.parseJsonRelaxed(text)));
  } catch {
    return null;
  }
}

// Saved stores with changes no accepted save holds yet. Only an edit-mode tab
// saves. In file mode that is this tab's unconfirmed ops; in fast mode the room
// says the file does not reach its latest change, and only the writer saves.
function unsavedLiveChanges() {
  if (!isEditMode) return false;
  for (const entry of entries.values()) {
    if (entry.store.ephemeral) continue;
    if (entry.store.handle.status.mode === "fast") {
      if (fast?.isWriter() && entry.landed < entry.last) return true;
    } else if (entry.store.pending.length > 0) {
      return true;
    }
  }
  return false;
}

// Callbacks waiting for the file to catch up, run after every checkpoint save
// and every time the room reports a landing.
const fileWaiters = new Set();
function fileMoved() {
  for (const fn of [...fileWaiters]) fn();
}

const checkpoints = createCheckpoints({
  needsSave: unsavedLiveChanges,
  blocked: () => !baselineSettled() || isSaveConflicted() || autosaveIsSuspended(),
  save: () => savePageForce().finally(fileMoved),
  saveNow: () => withKeepalive(true, () => savePageForce()),
});

// The fast lane, on a host that advertises live-data. Started by the first
// clay.live() call in an edit-mode tab.
let fast = null;
let laneRequested = false;
let serverLane = null;
// The host merges exact save provenance (live-by v2); without it a save that
// needs provenance is refused rather than risk applying an edit twice.
let provenanceHost = false;
let local = null;
// True from pagehide until the page is shown again (a page kept for back and
// forward): only a closing page's save is reported to the local room at capture.
let closing = false;

// The room's numbers moved: a file the room cannot rebuild from (landed -1) is
// saved over now, anything else on the usual deadline.
function liveMoved() {
  for (const entry of entries.values()) {
    if (!entry.store.ephemeral && entry.store.handle.status.mode === "fast" && entry.landed === -1) {
      checkpoints.soon();
      return;
    }
  }
  checkpoints.changed();
}

// The fast lane frames nothing of a store while some of its pending ops are in
// a file-mode save on the wire: the file may hold them, and the room merges the file.
function heldBySave(name) {
  const entry = entries.get(name);
  if (!entry) return false;
  const saved = pinned?.get(name);
  const through = saved?.mode === "file" && isSaveInProgress() ? saved.mark : 0;
  return through > 0 && entry.store.pendingEntries().some((pending) => pending.id <= through);
}

// Drop a store's ops through mark: a save that may have landed holds them.
function dropThrough(entry, mark) {
  entry.store.rebase(entry.store.authoritative, { source: "state", through: mark });
}

// A save ended without being accepted. maybeLanded: it may have reached the
// file (an error or a lost answer). Ops it carried in file mode go on (to the
// room, or the next save) when it surely did not land. When it may have, they
// are dropped, never sent again: if it landed, the file brings them back.
function endPin(pin, maybeLanded) {
  if (!pin) return;
  for (const [name, saved] of pin) {
    const entry = entries.get(name);
    if (!entry || saved.mode !== "file") continue;
    if (maybeLanded) {
      if (entry.store.handle.status.mode === "file") entry.leftAt = null;
      dropThrough(entry, saved.mark);
    }
    if (entry.store.handle.status.mode === "fast") fast?.release(name);
  }
}

function laneOptions(transport) {
  return {
    transport,
    entries,
    onWriter: () => checkpoints.changed(),
    onApplied: liveMoved,
    onLanded: () => {
      liveMoved();
      fileMoved();
    },
    onCheckpoint: () => checkpoints.soon(),
    onLeave: (name, at) => {
      const entry = entries.get(name);
      if (entry?.store.handle.status.mode === "fast") entry.leftAt = { ...at, frames: [], ancestors: [] };
    },
    held: heldBySave,
  };
}

// What this tab holds for every live tag, for the first room this browser
// starts: an open store's authoritative value (never its own unconfirmed ops,
// which its lane sends), or the tag's value.
function seedLocalRoom() {
  const values = new Map();
  for (const [name, tag] of liveTags(document, { warn: false })) {
    const entry = entries.get(name);
    if (entry) {
      values.set(name, { value: entry.store.authoritative, ephemeral: entry.store.ephemeral });
      continue;
    }
    try {
      const value = HyperMorph.parseJsonRelaxed(tag.element.textContent);
      if (value !== null && typeof value === "object") values.set(name, { value, ephemeral: tag.ephemeral });
    } catch {}
  }
  return values;
}

function ensureLane() {
  if (laneRequested || !isEditMode) return;
  laneRequested = true;
  hostSupports("live-data").then(
    async (supported) => {
      const provenance = supported && (await hostSupports("live-provenance"));
      serverLane = supported;
      provenanceHost = provenance;
      if (supported) {
        fast = createFastLane(laneOptions(serverTransport()));
      } else if (localLaneSupported()) {
        local = localTransport({ seed: seedLocalRoom });
        fast = createFastLane(laneOptions(local));
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
  if (entry.layout === "lines") return serializeLines(value);
  return entry.layout === "pretty" ? JSON.stringify(value, null, 2).replace(/</g, "\\u003c") : serializeLive(value);
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// live-format="lines": each entry of each top-level object on its own line, so
// a version diff of a large store (a page's blocks) shows only the entries
// that changed.
export function serializeLines(value) {
  if (!isObject(value)) return serializeLive(value);
  const parts = Object.entries(value).map(([key, inner]) => {
    if (!isObject(inner) || !Object.keys(inner).length) return `${serializeLive(key)}:${serializeLive(inner)}`;
    return `${serializeLive(key)}:{\n${Object.entries(inner).map(([k, v]) => `${serializeLive(k)}:${serializeLive(v)}`).join(",\n")}\n}`;
  });
  return `{${parts.join(",\n")}}`;
}

// A value another tab saved or relayed. It never confirms this tab's ops: equal
// text from a peer is not this tab's save. through: this tab's ops the value
// already holds (its frames that landed before the value's stamp).
function hashOfText(text) {
  try {
    return textHash(serializeLive(HyperMorph.parseJsonRelaxed(text)));
  } catch {
    return null;
  }
}

function receive(entry, text, source, dropIds) {
  let value;
  try {
    value = HyperMorph.parseJsonRelaxed(text);
  } catch {
    return;
  }
  if (entry.store.rebase(value, { source, ...(dropIds?.length && { dropIds }) })) entry.framesSince = true;
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
  const layout = tag.element.getAttribute("live-format") === "lines" ? "lines" : text.includes("\n") ? "pretty" : "line";
  const entry = { store, layout, framesSince: false, last: 0, landed: 0, leftAt: lineageOf(tag.element), captureOps: new Map() };
  entries.set(name, entry);
  store.onDelivery((event) => {
    if (event.code === "receipt-expired") document.dispatchEvent(new CustomEvent("clay:live-notice", {
      detail: { name, code: event.code, ops: event.ops, message: "The room retired an update receipt. Check the saved value before restoring this update." },
    }));
  });
  store.onRebase((event) => {
    if (store.handle.status.mode === "file" && ["undone", "refused", "decided"].includes(event.cause)) entry.leftAt = null;
  });
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
onSnapshot((clone, { forSave }) => {
  if (!entries.size) return;
  const tags = liveTags(clone, { warn: false });
  for (const entry of entries.values()) {
    if (entry.store.ephemeral) continue;
    const tag = tags.get(entry.store.name);
    if (!tag) continue;
    const text = textOf(entry);
    tag.element.textContent = text;
    // The room position this value was written at, and a hash of the value: the
    // host merges a later write of the file from that position.
    if (entry.store.handle.status.mode === "fast" && fast) {
      tag.element.setAttribute("live-at", stampOf(fast.status.epoch, fast.status.seq, serializeLive(entry.store.authoritative)));
      tag.element.removeAttribute("live-by");
    } else {
      const needsProvenance = entry.store.pending.length > 0 || (entry.leftAt && !entry.leftAt.disk);
      const unknown = serverLane === null && entry.leftAt && !entry.leftAt.disk;
      if (forSave && needsProvenance && (unknown || (serverLane && !provenanceHost))) {
        const message = "This host must update its live data protocol before this save can be sent. Your edits are still in this tab.";
        console.warn(`clay.live("${entry.store.name}"): ${message}`);
        document.dispatchEvent(new CustomEvent("clay:live-notice", { detail: { name: entry.store.name, code: "provenance-unsupported", message } }));
        fast?.refresh();
        throw Object.assign(new Error(message), { code: "provenance-unsupported" });
      }
      const capture = captureLineage(entry, forSave);
      if (capture) {
        tag.element.setAttribute("live-at", capture.at);
        tag.element.setAttribute("live-by", capture.by);
      } else {
        tag.element.removeAttribute("live-at");
        tag.element.removeAttribute("live-by");
      }
    }
  }
});

// The save's own capture (the one that is sent): pin, per saved store, the mode
// it was captured in, the newest op it held, the value it wrote and (fast mode)
// the room position. onSnapshot has already written the clone. A pin still set
// belonged to a save that ended without acceptance.
document.addEventListener("clay:snapshot-ready", (event) => {
  if (event.detail?.forSave !== true || !entries.size) return;
  const tags = liveTags(event.detail.documentElement, { warn: false });
  const stores = new Map();
  for (const entry of entries.values()) {
    if (entry.store.ephemeral) continue;
    const tag = tags.get(entry.store.name);
    if (!tag) continue;
    const mode = entry.store.handle.status.mode === "fast" && fast ? "fast" : "file";
    const at = mode === "fast" ? { epoch: fast.status.epoch, seq: fast.status.seq } : null;
    const lineage = mode === "file" ? lineageOf(tag.element) : null;
    stores.set(entry.store.name, { mode, mark: entry.store.mark, canonical: canonical(tag.element.textContent), at, lineage, by: tag.element.getAttribute("live-by") });
    if (lineage && !lineage.disk && entry.leftAt) entry.leftAt = { ...entry.leftAt, ancestors: lineage.ancestors };
    const proof = parseBy(tag.element.getAttribute("live-by"));
    if (mode === "file" && proof?.v === 2) {
      if (proof.capture[0] === captureAuthor) captureNumber = Math.max(captureNumber, proof.capture[1]);
      entry.captureOps.set(JSON.stringify(proof.capture), { capture: proof.capture, ids: entry.store.pendingEntries().map((e) => e.id) });
    }
    entry.framesSince = false;
    // A close save is answered after the page is gone: the local room learns
    // how far the file reaches now. Should the save fail, a later merge drops
    // those moves, never counts them twice.
    if (mode === "fast" && closing && checkpoints.flushing) local?.landed(entry.store.name, at);
  }
  // A pin still set at the next capture is a save that sent nothing (a clean
  // page's save is skipped without an event): an accepted or failed save
  // clears its pin.
  const previous = pinned;
  pinned = stores;
  endPin(previous, false);
});

// A refusal proves the host wrote nothing, unless an earlier attempt of the
// same save timed out: that one may have landed.
document.addEventListener("clay:save-conflict", (event) => {
  const previous = pinned;
  pinned = null;
  endPin(previous, event.detail?.hadTimeout === true);
});
// Only a 4xx answer proves the host wrote nothing, and only when no attempt of
// the save timed out. A lost connection, a timeout or a 5xx (a proxy's 502 can
// follow a write) may have landed.
for (const type of ["clay:save-error", "clay:save-offline"]) {
  document.addEventListener(type, (event) => {
    const status = event.detail?.status;
    const previous = pinned;
    pinned = null;
    endPin(previous, event.detail?.hadTimeout === true || !(status >= 400 && status < 500));
  });
}

// The bytes a host just accepted. A store whose tag in them holds the value the
// save's own capture wrote (formatting aside):
//   captured in file mode: the ops it held are in the file. Folded into the
//   store's base when nothing arrived since the capture, only dropped when a
//   frame did (that frame descends from this save). A store now in fast mode
//   drops them: the room merges the file, and the lane, which held them,
//   frames what is left.
//   captured in fast mode: the file holds the room's value, none of this tab's
//   own ops. The host room sees the file land; a local room is told.
export function confirmSaved(html) {
  const pin = pinned;
  pinned = null;
  if (!pin || typeof html !== "string") return;
  const tags = liveTags(parseHtml(html), { warn: false });
  for (const [name, saved] of pin) {
    const entry = entries.get(name);
    if (!entry) continue;
    const tag = tags.get(name);
    const mode = entry.store.handle.status.mode;
    if (!tag || canonical(tag.element.textContent) !== saved.canonical) {
      if (saved.mode === "file" && mode === "fast") fast?.release(name);
      continue;
    }
    if (saved.mode === "fast") {
      if (saved.at) local?.landed(name, saved.at);
      continue;
    }
    if (mode === "fast") {
      // The room merges the file, which holds these ops: they leave pending
      // without touching the room's value here. A local room never sees this
      // tab's own save come back, so it is handed the file.
      dropThrough(entry, saved.mark);
      local?.fileFrame(new Map([[name, { text: tag.element.textContent, at: parseStamp(tag.element.getAttribute("live-at")), seq: null }]]));
      fast?.release(name);
      // The room merged the file before answering, but its state may arrive
      // after this answer: read it, so the view holds these ops again.
      fast?.refresh();
    } else if (entry.framesSince) {
      if (!entry.leftAt || entry.leftAt.disk) dropThrough(entry, saved.mark);
    } else {
      entry.store.confirm(saved.mark);
      entry.leftAt = saved.lineage && tag.element.getAttribute("live-by") === saved.by ? saved.lineage : { disk: true };
    }
  }
}

onSaveAccepted(confirmSaved);

// A live-sync frame. A saved store in file mode takes the frame's value and
// replays its own unconfirmed ops over it. Every other live tag (never-saved
// stores, and tags no code has opened) takes the frame's text into the page, so
// the next save keeps what the file now says instead of the text this tab
// loaded with.
export function receiveFrame(html, seq = null) {
  if (typeof html !== "string" || !html) return;
  const incoming = liveTags(parseHtml(html), { warn: false });
  if (!incoming.size) return;
  if (local) {
    const frames = new Map();
    for (const [name, tag] of incoming) {
      if (tag.ephemeral) continue;
      frames.set(name, { text: tag.element.textContent, at: parseStamp(tag.element.getAttribute("live-at")), seq: Number.isInteger(seq) ? seq : null });
    }
    local.fileFrame(frames);
  }
  const page = liveTags(document, { warn: false });
  for (const [name, tag] of incoming) {
    const text = tag.element.textContent;
    const entry = entries.get(name);
    const at = tag.element.getAttribute("live-at");
    const by = tag.element.getAttribute("live-by");
    const pageTag = page.get(name)?.element;
    // The page's tag keeps the lineage of the version this tab last took, so a
    // file-mode save claims what it descends from. A store out of the room
    // descends from the incoming value's room position when it is of this
    // room: its frames that landed at or before it are in that value and leave
    // pending, and its save stamps that position with its own live-by.
    // Only a capture counts (the value is the one its stamp hashes); for
    // anything else the page's tag takes the incoming lineage, as for a store
    // that was never in the room.
    let dropIds = [];
    if (entry && entry.store.handle.status.mode === "file") {
      const lineage = lineageOf(tag.element);
      const sameEpoch = lineage && !lineage.disk && (!fast?.status.epoch || lineage.epoch === fast.status.epoch);
      if (sameEpoch) dropIds = fast?.captured(name, lineage, parseBy(by)) ?? [];
      else if (lineage?.disk) dropIds = fast?.captured(name, parseStamp(at), null) ?? [];
      if (lineage && !lineage.disk) {
        for (const [key, captured] of entry.captureOps) if (contains(lineage.ancestors, ...captured.capture)) {
          dropIds.push(...captured.ids);
          entry.captureOps.delete(key);
        }
      }
      entry.leftAt = sameEpoch ? lineage : lineage?.disk ? lineage : null;
    }
    if (pageTag && (!entry || entry.store.handle.status.mode === "file")) {
      if (at === null) pageTag.removeAttribute("live-at");
      else if (pageTag.getAttribute("live-at") !== at) pageTag.setAttribute("live-at", at);
      if (by === null) pageTag.removeAttribute("live-by");
      else if (pageTag.getAttribute("live-by") !== by) pageTag.setAttribute("live-by", by);
    }
    if (entry && !entry.store.ephemeral) {
      if (entry.store.handle.status.mode === "file") receive(entry, text, "remote", dropIds);
      continue;
    }
    if (pageTag && pageTag.textContent !== text) pageTag.textContent = text;
  }
}

document.addEventListener("clay:sync-applied", (event) => receiveFrame(event.detail?.html, event.detail?.seq));

// The last chance to save live changes made since the previous checkpoint. A
// keepalive body is capped near 60 KB; a larger page's save may not finish.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") checkpoints.flush();
});
window.addEventListener("pagehide", () => {
  closing = true;
  // A hide save still on the wire is answered after the page is gone too.
  if (checkpoints.flushing && pinned) {
    for (const [name, saved] of pinned) if (saved.mode === "fast" && saved.at) local?.landed(name, saved.at);
  }
  checkpoints.flush();
});
window.addEventListener("pageshow", () => {
  closing = false;
});

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

// The page editor's pause save: checkpoint within ms of now. Only the room's
// writer saves, so in other tabs this changes nothing.
export function checkpointWithin(ms) {
  checkpoints.within(ms);
}

// Resolves { ok: true } once the file holds every live change this tab knows
// of now, or { ok: false, code: "timeout" }. The writer saves as soon as it
// can; another tab waits for the writer's save to land.
export function requestCheckpoint({ timeoutMs = 10_000 } = {}) {
  const target = new Map();
  for (const [name, entry] of entries) {
    if (entry.store.ephemeral) continue;
    target.set(name, entry.store.handle.status.mode === "fast" ? entry.last ?? 0 : null);
  }
  const reached = () => [...target].every(([name, last]) => {
    const entry = entries.get(name);
    if (!entry) return true;
    if (last === null || entry.store.handle.status.mode !== "fast") return entry.store.pending.length === 0;
    return (entry.landed ?? 0) >= last;
  });
  if (reached()) return Promise.resolve({ ok: true });
  return new Promise((resolve) => {
    const finish = (result) => {
      clearTimeout(timer);
      fileWaiters.delete(check);
      resolve(result);
    };
    const check = () => {
      if (reached()) finish({ ok: true });
    };
    const timer = setTimeout(() => finish({ ok: false, code: "timeout" }), timeoutMs);
    fileWaiters.add(check);
    if (isEditMode && (!fast || fast.isWriter())) checkpoints.soon();
  });
}

export default live;
