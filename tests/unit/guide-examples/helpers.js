import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXAMPLES = process.env.GUIDE_EXAMPLES || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../website/examples");

const SATELLITES = {
  "clay-options.js": () => import("../../../src/options/options.js"),
  "clay-ui.js": () => import("../../../src/ui/index.js"),
  "clay-events.js": () => import("../../../src/events/index.js"),
  "clay-dom.js": () => import("../../../src/dom/dom-helpers.js"),
};
const BUNDLES = { "sap.js": "entries/sap.js", "clay-data.js": "entries/clay-data.js" };
const SATELLITE_KEYS = { "clay-options.js": "options", "clay-ui.js": "ui", "clay-events.js": "events", "clay-dom.js": "dom" };

class FakeEventSource extends EventTarget {
  constructor(url) { super(); this.url = url; this.readyState = 0; }
  close() {}
}

export const saves = [];

function installFetch() {
  let n = 0;
  window.fetch = global.fetch = jest.fn(async (url, init = {}) => {
    const href = String(url);
    if (/\/_\/save/.test(href)) {
      saves.push(init.body);
      n += 1;
      return { ok: true, status: 200, statusText: "", headers: new Headers(), text: async () => JSON.stringify({ msg: "Saved", etag: "E" + n }) };
    }
    if (/\/_\/live-sync\/save/.test(href)) {
      return { ok: true, status: 200, statusText: "", headers: new Headers(), text: async () => "{}", json: async () => ({}) };
    }
    return { ok: false, status: 404, statusText: "", headers: new Headers({ "content-type": "text/plain" }), text: async () => "", json: async () => ({}) };
  });
}

export async function loadExample(file, { editMode = true } = {}) {
  const html = readFileSync(path.join(EXAMPLES, file), "utf8");
  const doc = new DOMParser().parseFromString(html, "text/html");

  window.clayEditMode = editMode;
  global.EventSource = window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  if (!window.CSS) window.CSS = {};
  if (!window.CSS.escape) window.CSS.escape = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
  installFetch();
  if (!File.prototype.text) {
    File.prototype.text = function () {
      return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsText(this); });
    };
  }
  window.__guideErrors = [];
  window.addEventListener("error", (e) => window.__guideErrors.push(String(e.error?.message || e.message)));

  const scripts = [...doc.querySelectorAll("script")];
  const loader = scripts.find((s) => /\/clay\.js(\?|$)/.test(s.getAttribute("src") || ""));
  const params = new URLSearchParams(new URL(loader.getAttribute("src")).search);
  const exclude = (params.get("exclude") || "").split(",").filter(Boolean);
  params.set("exclude", [...exclude, "source"].join(","));
  const satellites = scripts.filter((s) => s.src && s !== loader).map((s) => s.getAttribute("src").split("/").pop());
  const inline = scripts.filter((s) => !s.src && !s.type).map((s) => s.textContent);
  scripts.forEach((s) => s.remove());

  for (const a of [...document.documentElement.attributes]) document.documentElement.removeAttribute(a.name);
  for (const a of doc.documentElement.attributes) document.documentElement.setAttribute(a.name, a.value);
  document.head.innerHTML = doc.head.innerHTML;
  document.body.innerHTML = doc.body.innerHTML;

  let resolveReady;
  window.clay = { loaded: {} };
  window.clay.ready = new Promise((r) => { resolveReady = r; });
  const settled = new Promise((r) => document.addEventListener("clay:baseline-settled", r, { once: true }));

  for (const name of satellites) {
    if (SATELLITES[name]) window.clay.loaded[SATELLITE_KEYS[name]] = SATELLITES[name]();
    else if (BUNDLES[name]) new Function(readFileSync(path.join(process.cwd(), BUNDLES[name]), "utf8"))();
    else throw new Error("harness: unknown satellite " + name);
  }
  await Promise.all(Object.values(window.clay.loaded));

  for (const code of inline) new Function(code)();

  const { boot } = await import("../../../src/loader.js");
  await new Promise((r) => boot(null, params, (clay) => { resolveReady(clay); r(); }));
  await tick(20);
  if (editMode) await Promise.race([settled, tick(4000)]);
  return window.clay;
}

export function tick(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

export async function peer() {
  const snapshot = await import("../../../src/core/snapshot.js");
  const { LiveSync } = await import("../../../src/sync/live-sync.js");
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  sync.lastHtml = snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
  let seq = 100;
  return {
    base: sync.lastHtml,
    async apply(frame) {
      seq += 1;
      await sync._doApplyUpdate(frame, seq, null);
      await flushMicrotasks();
    },
    stop() { sync.stop(); },
  };
}

export function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}
