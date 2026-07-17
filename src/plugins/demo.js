// Browser-backed demo mode: the page saves into the visitor's localStorage
// instead of a server, and restores itself on the next load. Setup:
//
//   <html autosave demo-key="my-page-v1">          <!-- both attributes optional -->
//   <script>window.clayEditMode = true;</script>   <!-- before the clay.js tag -->
//   <script src="https://clayjs.com/clay.js?plugins=demo"></script>
//
// The fetch shim answers POST /_/save the way a clayjs server would, so the
// whole real pipeline (savestatus, events, autosave, ⌘S) runs unchanged. The
// stored body comes from the clay:snapshot-ready clone (pre-strip, the same
// source live-sync morphs from), not the POSTed payload: the payload has
// richclay's runtime state stripped, and morphing toward it would disable the
// live editors. richclay chrome and squire artifacts are dropped from storage
// because richclay recreates them. The shim answers after a short delay:
// localStorage is instant, and the saving state only shows past save.js's
// 500ms debounce, so an instant answer would keep it invisible.
//
// The storage key includes <html demo-key> (fallback: the page's pathname).
// Bump the attribute whenever the page's authored content changes, or
// returning visitors' old saved bodies morph over the new page.

import { morph } from "../vendor/hyper-morph.vendor.js";

const KEY = "clay:demo:" +
  (document.documentElement.getAttribute("demo-key") || window.location.pathname);
const LATENCY_MS = 800;
const CHROME_SELECTOR = [
  "[save-remove]",
  "[data-richclay-toolbar]",
  "[data-richclay-menu]",
  "[data-richclay-dialog]",
  "[data-richclay-live]",
  "[data-richclay-float]",
  "#squire-selection-start",
  "#squire-selection-end",
  ".squire-image-resize-container",
].join(",");

let failNextSave = false;
let snapshotBody = null;

document.addEventListener("clay:snapshot-ready", (event) => {
  snapshotBody = event.detail.documentElement.querySelector("body")?.outerHTML || null;
});

function postedHtml(raw) {
  const text = typeof raw === "string" ? raw : "";
  try {
    const envelope = JSON.parse(text);
    if (envelope && typeof envelope === "object") {
      return envelope.snapshotHtml || envelope.content || text;
    }
  } catch {}
  return text;
}

const realFetch = window.fetch.bind(window);

function isSaveUrl(input) {
  const target = typeof input === "string" ? input : (input && input.url) || "";
  try {
    const path = new URL(target, window.location.href).pathname;
    return path === "/_/save" || path.startsWith("/_/save/");
  } catch {
    return false;
  }
}

window.fetch = (url, options = {}) => {
  const method = (options.method || (url && url.method) || "GET").toUpperCase();
  if (method !== "POST" || !isSaveUrl(url)) {
    return realFetch(url, options);
  }
  return new Promise((resolve) => {
    setTimeout(() => {
      if (failNextSave) {
        failNextSave = false;
        resolve(new Response(JSON.stringify({ msg: "Server not responding", msgType: "error" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }));
        return;
      }
      const html = snapshotBody || postedHtml(options.body);
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll(CHROME_SELECTOR).forEach((node) => node.remove());
      try {
        localStorage.setItem(KEY, doc.body.outerHTML);
      } catch {
        resolve(new Response(JSON.stringify({ msg: "Couldn't save in this browser (storage is full or blocked)", msgType: "error" }), {
          status: 507,
          headers: { "Content-Type": "application/json" },
        }));
        return;
      }
      resolve(new Response(JSON.stringify({ msg: "Saved in your browser", msgType: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }, LATENCY_MS);
  });
};

async function restore() {
  const saved = localStorage.getItem(KEY);
  if (!saved) return;
  const doc = new DOMParser().parseFromString(saved, "text/html");
  await morph(document.body, doc.body, {
    morphStyle: "outerHTML",
    ignoreActiveValue: true,
    scripts: { handle: true, matchMode: "smart" },
  });
}

export const ready = restore();

export const demo = {
  key: KEY,
  failNext() { failNextSave = true; },
  reset() {
    localStorage.removeItem(KEY);
    window.location.reload();
  },
};
