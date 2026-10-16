import { extractData, applyData, engine } from "../../vendor/hyper-html-api-data.vendor.js";
import { draftSlot, setDraftTransport, setDraftStoreFailed } from "../../core/draft-mode.js";

export const KEY_PREFIX = "clay:visitor-drafts:";

export function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

const isPlain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function createStore({ doc = document, storage = safeStorage(), now = () => new Date() } = {}) {
  const slot = draftSlot(doc);
  const key = KEY_PREFIX + slot;
  const rules = engine.findRulesIn(doc, "api").rules;

  function read() {
    let raw;
    try { raw = storage ? storage.getItem(key) : null; } catch { raw = null; }
    if (raw == null) return null;
    let record = null;
    try {
      const parsed = JSON.parse(raw);
      if (isPlain(parsed) && isPlain(parsed.data)) record = parsed;
    } catch {}
    return { raw, record };
  }

  function park(raw) {
    const parkedKey = key + ":unreadable:" + now().toISOString();
    try { storage.setItem(parkedKey, raw); storage.removeItem(key); } catch {}
    return parkedKey;
  }

  function parkWithWarning(raw) {
    const parkedKey = park(raw);
    console.warn("visitor-drafts: this browser's saved copy no longer fits the page; it was kept under", parkedKey);
    return { restored: false, hadDraft: true, parked: true };
  }

  function restore() {
    const found = read();
    if (!found) return { restored: false, hadDraft: false };
    if (!found.record) { park(found.raw); return { restored: false, hadDraft: true, parked: true }; }
    let data = found.record.data;
    try {
      applyData(doc, data, rules);
    } catch (error) {
      const unknown = error?.details?.unknownKeys;
      if (error?.code !== "WriteRejected" || !Array.isArray(unknown) || !unknown.length) return parkWithWarning(found.raw);
      data = { ...data };
      for (const name of unknown) delete data[name];
      try { applyData(doc, data, rules); } catch { return parkWithWarning(found.raw); }
    }
    return { restored: true, hadDraft: true, data };
  }

  function write(html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const data = extractData(parsed, rules);
    try {
      if (!storage) throw new Error("no storage");
      storage.setItem(key, JSON.stringify({ v: 1, savedAt: now().toISOString(), data }));
    } catch (error) {
      setDraftStoreFailed(true);
      doc.dispatchEvent(new CustomEvent("clay:drafts-store-failed", { detail: { error } }));
      const failure = new Error("Couldn't save in this browser. Storage is full or turned off.");
      failure.code = "draft-storage";
      throw failure;
    }
    setDraftStoreFailed(false);
    doc.dispatchEvent(new CustomEvent("clay:drafts-saved", { detail: { data } }));
    return data;
  }

  function writeLive() {
    try { write(window.clay.getHTML()); return true; } catch { return false; }
  }

  function clear() {
    try { storage.removeItem(key); } catch {}
  }

  function snapshot() {
    try { return JSON.stringify(extractData(doc, rules)); } catch { return null; }
  }

  return { slot, key, rules, read, restore, write, writeLive, park, clear, snapshot };
}
