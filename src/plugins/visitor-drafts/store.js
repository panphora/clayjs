import { extractData, applyData, engine } from "../../vendor/hyper-html-api-data.vendor.js";
import { draftSlot, setDraftStoreFailed } from "../../core/draft-mode.js";

export const KEY_PREFIX = "clay:visitor-drafts:";
export const RECORD_VERSION = 1;

export function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

const isPlain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function pathParts(label) {
  const parts = [];
  for (const match of label.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    parts.push(match[2] !== undefined ? Number(match[2]) : match[1]);
  }
  return parts;
}

function dropPath(data, label) {
  const parts = pathParts(label);
  let node = data;
  for (let i = 0; i < parts.length - 1; i++) {
    node = node?.[parts[i]];
    if (node == null || typeof node !== "object") return;
  }
  if (node && typeof node === "object") delete node[parts[parts.length - 1]];
}

function fits(data, extracted) {
  for (const name of Object.keys(data)) {
    if (JSON.stringify(data[name]) !== JSON.stringify(extracted[name])) return false;
  }
  return true;
}

function storageFailure(doc, error) {
  setDraftStoreFailed(true);
  doc.dispatchEvent(new CustomEvent("clay:drafts-store-failed", { detail: { error } }));
  const failure = new Error("Couldn't save in this browser. Storage is full or turned off.");
  failure.code = "draft-storage";
  return failure;
}

export function createStore({ doc = document, storage = safeStorage(), now = () => new Date() } = {}) {
  const slot = draftSlot(doc);
  const key = KEY_PREFIX + slot;
  const rules = engine.findRulesIn(doc, "api").rules;

  let lastRaw = null;
  let lastData = null;
  let blocked = false;
  let stopped = false;

  function getRaw() {
    try { return storage ? storage.getItem(key) : null; } catch { return null; }
  }

  function parse(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isPlain(parsed) && parsed.v === RECORD_VERSION && isPlain(parsed.data)) return parsed;
    } catch {}
    return null;
  }

  function read() {
    const raw = getRaw();
    if (raw == null) return null;
    return { raw, record: parse(raw) };
  }

  function park(raw) {
    const parkedKey = key + ":unreadable:" + now().toISOString();
    try {
      storage.setItem(parkedKey, raw);
    } catch {
      blocked = true;
      console.warn("visitor-drafts: this browser's saved copy no longer fits the page, and there is no room to keep it aside; nothing will be saved over it");
      return null;
    }
    try { storage.removeItem(key); } catch {}
    console.warn("visitor-drafts: this browser's saved copy no longer fits the page; it was kept under", parkedKey);
    return parkedKey;
  }

  function parked(raw) {
    const parkedKey = park(raw);
    return blocked ? { restored: false, hadDraft: true, parked: false, blocked: true } : { restored: false, hadDraft: true, parked: true };
  }

  function apply(data) {
    try {
      applyData(doc, data, rules);
    } catch (error) {
      const unknown = error?.details?.unknownKeys ?? error?.unknownKeys;
      if (error?.code !== "WriteRejected" && error?.name !== "WriteRejected") throw error;
      if (!Array.isArray(unknown) || !unknown.length) throw error;
      data = JSON.parse(JSON.stringify(data));
      for (const label of unknown) dropPath(data, label);
      applyData(doc, data, rules);
    }
    if (!fits(data, extractData(doc, rules))) throw new Error("draft did not fit the page");
    return data;
  }

  function restore() {
    const found = read();
    if (!found) return { restored: false, hadDraft: false };
    if (!found.record) return parked(found.raw);
    let data;
    try { data = apply(found.record.data); } catch { return parked(found.raw); }
    lastRaw = found.raw;
    return { restored: true, hadDraft: true, data };
  }

  function dataOf(html) {
    return extractData(new DOMParser().parseFromString(html, "text/html"), rules);
  }

  function write(html) {
    const data = dataOf(html);
    const json = JSON.stringify(data);
    if (stopped) return data;
    if (json === lastData && getRaw() === lastRaw) {
      setDraftStoreFailed(false);
      doc.dispatchEvent(new CustomEvent("clay:drafts-saved", { detail: { data, unchanged: true } }));
      return data;
    }
    if (blocked) throw storageFailure(doc, new Error("an unreadable saved copy could not be kept aside"));
    const raw = JSON.stringify({ v: RECORD_VERSION, savedAt: now().toISOString(), data });
    try {
      if (!storage) throw new Error("no storage");
      storage.setItem(key, raw);
    } catch (error) {
      throw storageFailure(doc, error);
    }
    lastRaw = raw;
    lastData = json;
    setDraftStoreFailed(false);
    doc.dispatchEvent(new CustomEvent("clay:drafts-saved", { detail: { data } }));
    return data;
  }

  function liveJson() {
    return JSON.stringify(dataOf(window.clay.getHTML()));
  }

  function settleBaseline() {
    if (lastData !== null) return;
    try { lastData = liveJson(); } catch {}
  }

  function changed() {
    if (stopped) return false;
    try { return liveJson() !== lastData; } catch { return true; }
  }

  function writeLive() {
    try { write(window.clay.getHTML()); return true; } catch { return false; }
  }

  function flush() {
    if (!changed()) return true;
    return writeLive();
  }

  function adoptExternal(raw) {
    if (stopped || raw == null || raw === lastRaw) return false;
    const record = parse(raw);
    if (!record || changed()) return false;
    try { apply(record.data); } catch { return false; }
    lastRaw = raw;
    try { lastData = liveJson(); } catch { lastData = null; }
    doc.dispatchEvent(new CustomEvent("clay:drafts-restored", { detail: { restored: true, hadDraft: true, parked: false, external: true } }));
    return true;
  }

  function clear() {
    stopped = true;
    try { storage.removeItem(key); } catch {}
  }

  function snapshot() {
    try { return JSON.stringify(extractData(doc, rules)); } catch { return null; }
  }

  return { slot, key, rules, read, restore, write, writeLive, flush, changed, settleBaseline, adoptExternal, park, clear, snapshot };
}
