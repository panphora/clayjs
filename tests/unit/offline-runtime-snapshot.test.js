/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://127.0.0.1:4321/notes/doc.html"}
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRuntimeHTML } from "../../src/server/offline-runtime/index.js";
import { RUNTIME_ALIASES } from "../../src/core/runtime-url.js";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const FIXTURES = path.join(ROOT, "tests/fixtures/offline-runtime");
const { selectedVersion, releases } = JSON.parse(readFileSync(path.join(FIXTURES, "releases.json"), "utf8"));
const documentURL = window.location.href;

const CLAY = "https://clayjs.com/v1/clay.js?plugins=sortable,people,upload,sync,visitor-drafts,unsent,menu&exclude=richclay";
const SAP = "https://clayjs.com/v1/sap.js";
const CSS = "https://clayjs.com/v1/src/page/themes/light-1.css";
const ROUTER = "https://clayjs.com/v1/clay-router.js";

const AUTHORED = "<!doctype html><html><head>" +
  `<script src="${CLAY}"></script>` +
  `<script src="${SAP}"></script>` +
  `<link rel="stylesheet" href="${CSS}">` +
  `<template><script src="${ROUTER}"></script></template>` +
  "</head><body><p id=\"text\">hello</p></body></html>";

const project = (html) => projectRuntimeHTML(html, { releases, selectedVersion, documentURL });
const projection = project(AUTHORED);
const SERVED = projection.html;

function load(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

function runtimeAttributes(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const values = [];
  const walk = (root) => {
    for (const element of root.querySelectorAll("script[src], link[href]")) {
      values.push(element.getAttribute(element.tagName === "SCRIPT" ? "src" : "href"));
    }
    for (const template of root.querySelectorAll("template")) walk(template.content);
  };
  walk(doc);
  return values;
}

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let snapshot;

beforeAll(async () => {
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  snapshot = await import("../../src/core/snapshot.js");
  await import("../../src/core/runtime-url.js");
});

beforeEach(() => {
  load(SERVED);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
  delete window.clayEditMode;
});

test("a save writes the authored URLs and no descriptor, and leaves the live DOM local", () => {
  expect(SERVED).toContain("/_/clayjs/");
  expect(SERVED).toContain("clay-runtime-map");

  const bytes = snapshot.captureForSave({ emitForSync: false });

  expect(bytes).not.toContain("/_/clayjs/");
  expect(bytes).not.toContain("clay-runtime-map");
  expect(bytes).toContain(`src="${CLAY.replace("&", "&amp;")}"`);
  expect(runtimeAttributes(bytes)).toEqual([CLAY, SAP, CSS, ROUTER]);
  expect(projection.mappings.map((mapping) => mapping.original)).toEqual([CLAY, SAP, CSS, ROUTER]);

  expect(document.querySelector('script[src="/_/clayjs/1.15.2/clay.js?plugins=sortable,people,upload,sync,visitor-drafts,unsent,menu&exclude=richclay"]')).not.toBeNull();
  expect(document.querySelector('link[href^="/_/clayjs/"]')).not.toBeNull();
  expect(document.getElementById("clay-runtime-map")).not.toBeNull();
});

test("a no-edit dirty check against the baseline is clean", () => {
  const baseline = snapshot.captureForDirtyCheck();
  const comparison = snapshot.captureForComparison();
  for (const bytes of [baseline, comparison]) {
    expect(bytes).not.toContain("/_/clayjs/");
    expect(bytes).not.toContain("clay-runtime-map");
  }
  expect(snapshot.captureForDirtyCheck()).toBe(baseline);
  expect(snapshot.captureForComparison()).toBe(comparison);
});

test("an edit is dirty, the save is canonical, and the saved file reopens to the same page", () => {
  const baseline = snapshot.captureForDirtyCheck();
  document.getElementById("text").textContent = "edited";
  expect(snapshot.captureForDirtyCheck()).not.toBe(baseline);

  const bytes = snapshot.captureForSave({ emitForSync: false });
  expect(bytes).not.toContain("/_/clayjs/");
  expect(bytes).not.toContain("clay-runtime-map");
  expect(runtimeAttributes(bytes)).toEqual([CLAY, SAP, CSS, ROUTER]);

  // The host projects the saved file again when it serves it, so every runtime URL comes back
  // local, the one whose query holds an `&` included. The tree is the same tree either way.
  const reopened = new DOMParser().parseFromString(project(bytes).html, "text/html");
  const served = new DOMParser().parseFromString(SERVED, "text/html");
  expect(reopened.querySelector('script[src*="/clay.js"]').getAttribute("src"))
    .toMatch(/^\/_\/clayjs\/1\.15\.2\/clay\.js\?/);
  reopened.querySelector("#clay-runtime-map").remove();
  served.querySelector("#clay-runtime-map").remove();
  served.getElementById("text").textContent = "edited";
  expect(reopened.documentElement.outerHTML).toBe(served.documentElement.outerHTML);
});

test("an author change to a local URL's query saves the authored rolling prefix with the new query", () => {
  const live = document.querySelector('script[src*="/clay.js?"]');
  live.setAttribute("src", "/_/clayjs/1.15.2/clay.js?plugins=page");

  const bytes = snapshot.captureForSave({ emitForSync: false });
  expect(bytes).not.toContain("/_/clayjs/");
  expect(runtimeAttributes(bytes)).toContain("https://clayjs.com/v1/clay.js?plugins=page");
});

test("a local runtime URL with no descriptor saves as the exact public URL", () => {
  load("<!doctype html><html><head><script src=\"/_/clayjs/1.15.2/clay.js\"></script></head><body><p>x</p></body></html>");
  expect(document.getElementById("clay-runtime-map")).toBeNull();

  const bytes = snapshot.captureForSave({ emitForSync: false });
  expect(runtimeAttributes(bytes)).toEqual(["https://clayjs.com/1.15.2/clay.js"]);
});

test("a spoofed descriptor entry for a foreign host does not restore it", () => {
  const descriptor = JSON.stringify({
    schema: 1,
    version: "1.15.2",
    entries: [{ original: "https://example.com/1.15.2/clay.js", local: "/_/clayjs/1.15.2/clay.js" }],
  });
  load("<!doctype html><html><head>" +
    `<script type="application/json" id="clay-runtime-map" clay="no-save no-watch no-snapshot">${descriptor}</script>` +
    "<script src=\"/_/clayjs/1.15.2/clay.js\"></script></head><body><p>x</p></body></html>");

  const bytes = snapshot.captureForSave({ emitForSync: false });
  expect(bytes).not.toContain("example.com");
  expect(bytes).not.toContain("clay-runtime-map");
  expect(runtimeAttributes(bytes)).toEqual(["https://clayjs.com/1.15.2/clay.js"]);
});

test("a descriptor that declares a foreign URL as its own alias does not restore it", () => {
  const descriptor = JSON.stringify({
    schema: 1,
    version: "1.15.2",
    entries: [{ original: "https://example.invalid/runtime.js", local: "/_/clayjs/1.15.2/clay.js" }],
    aliases: { "https://example.invalid/runtime.js": "clay.js" },
  });
  load("<!doctype html><html><head>" +
    `<script type="application/json" id="clay-runtime-map" clay="no-save no-watch no-snapshot">${descriptor}</script>` +
    "<script src=\"/_/clayjs/1.15.2/clay.js\"></script></head><body><p>x</p></body></html>");

  const bytes = snapshot.captureForSave({ emitForSync: false });
  expect(bytes).not.toContain("example.invalid");
  expect(runtimeAttributes(bytes)).toEqual(["https://clayjs.com/1.15.2/clay.js"]);
});

test("a descriptor entry naming a release alias saves back to that alias URL", () => {
  const alias = "https://cdn.jsdelivr.net/npm/overtype@2.6.1/dist/overtype.min.js";
  const local = `/_/clayjs/1.15.2/${RUNTIME_ALIASES[alias]}`;
  const descriptor = JSON.stringify({
    schema: 1,
    version: "1.15.2",
    entries: [{ original: alias, local }],
  });
  load("<!doctype html><html><head>" +
    `<script type="application/json" id="clay-runtime-map" clay="no-save no-watch no-snapshot">${descriptor}</script>` +
    `<script src="${local}"></script></head><body><p>x</p></body></html>`);

  const bytes = snapshot.captureForSave({ emitForSync: false });
  expect(bytes).not.toContain("/_/clayjs/");
  expect(runtimeAttributes(bytes)).toEqual([alias]);
});

test("a page with no runtime URL captures byte for byte as it did before", () => {
  load("<!doctype html><html><head><script src=\"https://clayjs.com/v1/clay.js\"></script></head>" +
    "<body><p id=\"text\">plain</p></body></html>");
  const expected = "<!DOCTYPE html>" + document.documentElement.outerHTML;

  expect(snapshot.captureForSave({ emitForSync: false })).toBe(expected);
  expect(snapshot.captureForComparison()).toBe(expected);
  expect(snapshot.captureForDirtyCheck()).toBe(expected);
});

test("the live-sync serialization of a capture is canonical", () => {
  const clone = snapshot.captureSnapshot({ flushUndo: false, authored: false });
  const html = snapshot.serializeForSync(clone);

  expect(html).not.toContain("/_/clayjs/");
  expect(html).not.toContain("clay-runtime-map");
  expect(runtimeAttributes(html)).toEqual([CLAY, SAP, CSS, ROUTER]);
});

test("the source plugin refuses a projected response and asks for the canonical one", async () => {
  // The install at evaluation belongs to an explicit edit boot (V4 step 17b-7c: the
  // module reads the committed mode when it evaluates), so this page is one.
  window.clayEditMode = true;
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    redirected: false,
    type: "basic",
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    text: async () => SERVED,
  }));
  const info = jest.spyOn(console, "info").mockImplementation(() => {});

  const { source, renderSave } = await import("../../src/plugins/source.js");
  await source.ready;

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][1].headers).toEqual({ "Clay-Source": "1" });
  const refusals = info.mock.calls.filter(([line]) => String(line).includes("source fetch: projected response"));
  expect(refusals).toHaveLength(1);

  expect(source.stats().installed).toBe(false);
  expect(source.text()).toBeNull();
  const clone = snapshot.captureSaveClone({ flushUndo: false, authored: false });
  expect(renderSave(clone, "today")).toBe("today");
});

// A file that merely mentions the descriptor's id is still the file. Only a response the
// host projected — the map script itself, or a local mirror URL — is refused, so the
// bytes this page already holds are used instead of asking again.
test("a canonical file that only names the runtime map's id is modelled, not re-fetched", async () => {
  window.clayEditMode = true;
  global.fetch = jest.fn(async () => {
    throw new Error("the source plugin fetched a file it already held");
  });
  const info = jest.spyOn(console, "info").mockImplementation(() => {});
  const canonical = snapshot.captureForSave({ emitForSync: false }).replace("</body>",
    "<p class=\"note\">the clay-runtime-map descriptor is a host's, not this file's</p></body>");
  expect(canonical).not.toContain("/_/clayjs/");
  expect(canonical).not.toContain('<script type="application/json" id="clay-runtime-map"');
  expect(canonical).toContain("clay-runtime-map");

  const { start, stats } = await import("../../src/source/session.js");
  await start({ latest: () => ({ bytes: canonical, etag: null, seq: null }) });

  expect(global.fetch).not.toHaveBeenCalled();
  expect(info.mock.calls.filter(([line]) => String(line).includes("projected response"))).toHaveLength(0);
  expect(stats().installed).toBe(true);
});
