/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * The accepted capture adopts the model the save already verified.
 *
 * A verified save had already parsed its own bytes, and the plugin threw that tree
 * away: an accepted save then parsed the accepted bytes again and paired the whole
 * document against the page. Both of those are the price of asking "where is this page
 * in these bytes" from scratch, and the save does not have to ask it: the capture that
 * produced the bytes knows the tree they came from.
 *
 * The claims here are the ones that make that safe, because a fast path that adopts the
 * wrong model writes the wrong bytes into somebody's file:
 *
 *   the candidate travels with ITS capture and is adopted only for that capture's
 *   acceptance, with the bytes and the pairing generation still matching;
 *   anything else \u2014 a raw save, a refusal, an unknown outcome, a page with its own save
 *   handlers, a morph or disk frame since the capture \u2014 takes the inspection path;
 *   adoption is assignments only: no snapshot, no authored hook, no undo flush, no
 *   parsed accepted bytes, no pairing, and the next save still renders from them.
 */

let snapshot, sourceMap, saveCore, saveMod, etagMod, plugin;

const SRC = [
  "<!DOCTYPE html>",
  "<html>",
  "  <head><title>Notes</title></head>",
  "  <body class='page'>",
  "    <ul id=list>",
  "      <li data-id='a'>alpha</li>",
  "      <li data-id='b'>beta</li>",
  "    </ul>",
  "    <template id=tpl><li data-id='x'>from a template</li></template>",
  "  </body>",
  "</html>",
].join("\n");

// The doctype matters: checkSource compares the source's prologue against the live
// document's, and jsdom's document carries one. Seeded ONCE, because the map is keyed by
// live node identity.
function seedDocument() {
  const parsed = new DOMParser().parseFromString(SRC, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let router;

function answerFor(answer) {
  // A function answers late, and may throw: that is how a request that never got an
  // answer is spelled here.
  if (typeof answer === "function") return answerFor(answer());
  if (!answer) {
    return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
  }
  const status = answer.status ?? 200;
  return {
    ok: status < 400,
    status,
    statusText: answer.statusText ?? "",
    redirected: false,
    type: "basic",
    headers: {
      get: (name) => {
        const table = answer.headers || {};
        const key = Object.keys(table).find((k) => k.toLowerCase() === String(name).toLowerCase());
        return key === undefined ? null : table[key];
      }
    },
    text: async () => (answer.text !== undefined ? answer.text : JSON.stringify(answer.body ?? {})),
  };
}

function installRouter() {
  router = { responses: {}, save: [], meta: [], source: [] };
  global.fetch = jest.fn(async (url, options) => {
    const target = String(url ?? "");
    if (target.includes("/_/save")) {
      router.save.push({ url: target, headers: options?.headers || {}, body: options?.body });
      return answerFor(await router.responses.save);
    }
    if (target.includes("/_/meta")) {
      router.meta.push(target);
      return answerFor(await router.responses.meta);
    }
    router.source.push(target);
    return {
      ok: true,
      status: 200,
      redirected: false,
      type: "basic",
      headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
      text: async () => SRC,
    };
  });
}

/** Hold every save response until the returned function answers it. */
function holdResponse() {
  let answer;
  router.responses.save = new Promise((resolve) => { answer = resolve; });
  return (value = { body: { msg: "Saved" } }) => answer(value);
}

let hookRuns = 0;
let frames = 0;
let undoFlush;

beforeAll(async () => {
  window.clayEditMode = true;
  seedDocument();
  snapshot = await import("../../src/core/snapshot.js");
  sourceMap = await import("../../src/core/source-map.js");
  saveCore = await import("../../src/core/save-core.js");
  saveMod = await import("../../src/core/save.js");
  etagMod = await import("../../src/core/etag.js");
  // A snapshot hook and an undo flush are the two things an inspection capture does on
  // its way past, and the acceptance path must take neither.
  snapshot.onSnapshot(() => { hookRuns++; });
  document.addEventListener("clay:snapshot-ready", () => { frames++; });
  installRouter();
  plugin = await import("../../src/plugins/source.js");
  await plugin.source.ready;
});

beforeEach(() => {
  jest.restoreAllMocks();
  undoFlush = jest.fn();
  window.clay = { ...(window.clay || {}), undo: { flush: undoFlush } };
  router.save = [];
  router.meta = [];
  delete router.responses.meta;
  router.responses.save = { body: { msg: "Saved" } };
  document.querySelector("#list").removeAttribute("onbeforesave");
  document.querySelector("#list").removeAttribute("class");
  // Whatever a test broke on the renderer, the next one starts from the installed one.
  snapshot.setSaveRenderer(plugin.renderSave);
});

afterAll(() => {
  snapshot.setSaveRenderer(null);
});

const textNode = (id) => document.querySelector(`[data-id='${id}']`).firstChild;

function snapshotOf() {
  return {
    stats: plugin.source.stats(),
    align: sourceMap.pairingCounts.align,
    hashKey: sourceMap.pairingCounts.hashKey,
    hooks: hookRuns,
    frames,
    flushes: undoFlush.mock.calls.length,
  };
}

/**
 * Drive one save through the real lane and answer it.
 *
 * Returns what the request carried and the state either side of acceptance, so a test
 * can say what acceptance cost rather than what the whole save cost.
 */
async function saveAndAnswer(answer, { drive = () => saveMod.savePage() } = {}) {
  const release = holdResponse();
  const before = snapshotOf();
  const saving = drive();
  await tick();
  const sent = router.save.length ? router.save[router.save.length - 1] : null;
  const midflight = snapshotOf();
  sourceMap.resetPairingCounts();
  release(answer);
  const result = await saving;
  await tick();
  return { sent, before, midflight, after: snapshotOf(), result };
}

test("the plugin installed on this document", () => {
  const stats = plugin.source.stats();
  expect(stats.installed).toBe(true);
  expect(stats.refused).toBeNull();
  expect(plugin.source.text()).toBe(SRC);
});

test("an eligible capture carries its candidate, and the accepted save adopts it", async () => {
  textNode("b").data = "BETA";

  const { sent, before, midflight, after, result } = await saveAndAnswer({ body: { msg: "Saved" } });

  expect(result.ok).toBe(true);
  expect(sent.headers["If-Match"]).toBeUndefined();          // a null-ETag local save
  expect(sent.body).toContain("<li data-id='b'>BETA</li>");

  // Acceptance cost: no capture, no pairing, and nothing announced.
  expect(after.align).toBe(0);
  expect(after.hashKey).toBe(0);
  expect(after.stats.refreshes).toBe(before.stats.refreshes);
  expect(after.frames).toBe(midflight.frames);
  expect(after.hooks).toBe(midflight.hooks);
  expect(after.flushes).toBe(midflight.flushes);
  expect(after.stats.saves).toBe(before.stats.saves + 1);

  // Nothing became public before the host answered.
  expect(midflight.stats.saves).toBe(before.stats.saves);

  // And it is the file now: the text is those bytes and a live node indexes them.
  expect(plugin.source.text()).toBe(sent.body);
  const loc = plugin.source.locate(document.querySelector("[data-id='b']"));
  expect(loc).not.toBeNull();
  expect(sent.body.slice(loc.from, loc.to)).toBe("<li data-id='b'>BETA</li>");

  // Both baselines still come from the capture, never from a re-read of the page.
  expect(saveMod.getLastSavedContents()).not.toBe("");
  expect(result.ok && saveMod.getUnsavedChanges()).toBe(false);
});

test("that capture's candidate really is a candidate: model of its own bytes, not nothing", () => {
  const file = plugin.source.text();
  const capture = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  const artifact = snapshot.captureArtifact(capture);

  expect(capture.forSave).toBe(file);
  expect(Object.keys(capture).sort()).toEqual(["captureId", "forComparison", "forDirty", "forSave"]);
  expect(artifact).not.toBeNull();
  expect(artifact.captureId).toBe(capture.captureId);
  expect(artifact.html).toBe(capture.forSave);
  expect(artifact.source.model.src).toBe(capture.forSave);
  expect(typeof artifact.source.repairGeneration).toBe("number");

  // A live element is in the map the candidate brings, so adoption is a real pairing and
  // not an empty one.
  expect(artifact.source.map.get(document.querySelector("#list"))).toBeTruthy();
});

test("text typed after the capture is not in its model, and the next save adopts its own", async () => {
  const node = textNode("b");
  node.data = "gamma";

  const release = holdResponse();
  const before = plugin.source.stats();
  const saving = saveMod.savePage();
  await tick();
  const captured = router.save[0].body;
  expect(captured).toContain("gamma");

  sourceMap.resetPairingCounts();
  release({ body: { msg: "Saved" } });
  await saving;

  // A typed B, accepted A. A is the file.
  expect(plugin.source.text()).toBe(captured);
  const loc = plugin.source.locate(document.querySelector("[data-id='b']"));
  expect(captured.slice(loc.from, loc.to)).toBe("<li data-id='b'>gamma</li>");
  expect(plugin.source.stats().refreshes).toBe(before.refreshes);
  expect(sourceMap.pairingCounts.align).toBe(0);

  // The next save verifies and adopts its own candidate, from the same live nodes.
  textNode("b").data = "GAMMA";
  const second = await saveAndAnswer({ body: { msg: "Saved" } });
  expect(second.result.ok).toBe(true);
  expect(second.sent.body).toContain("<li data-id='b'>GAMMA</li>");
  expect(second.sent.body).toContain("<li data-id='a'>alpha</li>");   // still the author's bytes
  expect(second.after.align).toBe(0);
  expect(second.after.hashKey).toBe(0);
  expect(second.after.stats.refreshes).toBe(second.before.stats.refreshes);
  expect(second.after.stats.saves).toBe(second.before.stats.saves + 1);
  expect(plugin.source.text()).toBe(second.sent.body);
});

test("a refused save adopts nothing", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  textNode("a").data = "ALPHA";
  const file = plugin.source.text();

  const { after, before, result } = await saveAndAnswer({
    status: 412,
    body: { msg: "This document changed since you last loaded it.", code: "conflict" },
  });

  expect(result.ok).toBe(false);
  expect(result.msgType).toBe("conflict");
  expect(after.stats.saves).toBe(before.stats.saves);
  expect(after.align).toBe(0);
  expect(after.hashKey).toBe(0);
  expect(after.stats.refreshes).toBe(before.stats.refreshes);
  expect(plugin.source.text()).toBe(file);          // the model of the file is unchanged
  textNode("a").data = "alpha";
});

test("an unknown outcome adopts nothing until a receipt proves it landed", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  textNode("a").data = "ALPHA";
  const file = plugin.source.text();

  const { after, before, result } = await saveAndAnswer(() => {
    // The request never gets an answer, and the host keeps no receipt to ask about.
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    throw err;
  });

  expect(result.msgType).toBe("unknown");
  expect(saveCore.saveFateIsUnknown()).toBe(true);
  expect(after.stats.saves).toBe(before.stats.saves);
  expect(after.align).toBe(0);
  expect(after.hashKey).toBe(0);
  expect(after.stats.refreshes).toBe(before.stats.refreshes);
  expect(plugin.source.text()).toBe(file);
  expect(router.meta.length).toBeGreaterThan(0);   // it did ask, and the answer settled nothing
  textNode("a").data = "alpha";
});

test("a later render cannot replace the artifact of the capture that is on the wire", async () => {
  textNode("b").data = "delta";

  const release = holdResponse();
  const before = plugin.source.stats();
  const saving = saveMod.savePage();
  await tick();
  const first = router.save[0].body;
  expect(first).toContain("delta");

  // Something else renders after A was captured: a newer capture with newer text.
  textNode("b").data = "EPSILON";
  const later = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  expect(later.forSave).toContain("EPSILON");
  expect(later.captureId).not.toBe(0);

  sourceMap.resetPairingCounts();
  release({ body: { msg: "Saved" } });
  await saving;

  // A is what the host took, so A's candidate is what describes the file.
  expect(plugin.source.text()).toBe(first);
  expect(plugin.source.text()).not.toContain("EPSILON");
  expect(plugin.source.stats().refreshes).toBe(before.refreshes);
  expect(sourceMap.pairingCounts.align).toBe(0);
});

test("a morph or a disk frame since the capture invalidates its pairing", async () => {
  const before = plugin.source.stats();

  textNode("b").data = "zeta";
  const release = holdResponse();
  const saving = saveMod.savePage();
  await tick();
  const captured = router.save[0].body;

  // A peer frame replaced live nodes after the capture, and the page was re-paired.
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { seq: 1, source: "peer" } }));
  plugin.source.text();                                   // runs the queued refresh now

  sourceMap.resetPairingCounts();
  release({ body: { msg: "Saved" } });
  await saving;
  await tick();

  // The guarded path, not the stale candidate: a parse and a whole-document pairing.
  expect(plugin.source.stats().refreshes).toBe(before.refreshes + 2);
  expect(sourceMap.pairingCounts.align + sourceMap.pairingCounts.hashKey).toBeGreaterThan(0);
  expect(plugin.source.text()).toBe(captured);
  expect(plugin.source.locate(document.querySelector("#list"))).not.toBeNull();
});

test("a disk version does not let a capture coalesce across it", async () => {
  const before = plugin.source.stats();
  const disk = plugin.source.text().replace("<li data-id='a'>alpha</li>", '<li data-id="a">alpha</li>');

  textNode("b").data = "eta";
  const release = holdResponse();
  const saving = saveMod.savePage();
  await tick();
  const captured = router.save[0].body;

  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { seq: 2, source: "disk", etag: null, html: disk } }));
  expect(plugin.source.text()).toBe(disk);

  sourceMap.resetPairingCounts();
  release({ body: { msg: "Saved" } });
  await saving;
  await tick();

  expect(plugin.source.text()).toBe(captured);
  expect(plugin.source.text()).not.toBe(disk);
  expect(plugin.source.stats().refreshes).toBe(before.refreshes + 2);
  expect(sourceMap.pairingCounts.align + sourceMap.pairingCounts.hashKey).toBeGreaterThan(0);
});

test("a raw save takes the safe path", async () => {
  const before = plugin.source.stats();
  const bytes = plugin.source.text().replace("<li data-id='a'>alpha</li>", "<li data-id='a'>ALPHA</li>");

  sourceMap.resetPairingCounts();
  router.responses.save = { body: { msg: "Saved" } };
  const result = await saveCore.saveHtml(bytes);
  await tick();

  expect(result.ok).toBe(true);
  expect(plugin.source.stats().refreshes).toBe(before.refreshes + 1);
  expect(sourceMap.pairingCounts.align + sourceMap.pairingCounts.hashKey).toBeGreaterThan(0);
  expect(plugin.source.text()).toBe(bytes);
  textNode("a").data = "alpha";
});

test("a page with its own save handlers keeps the inspection path", async () => {
  const list = document.querySelector("#list");
  const runs = jest.fn();
  window.__sourceHandlerRuns = runs;
  list.setAttribute("onbeforesave", "window.__sourceHandlerRuns()");

  const { sent, before, after, result } = await saveAndAnswer({ body: { msg: "Saved" } });

  expect(result.ok).toBe(true);
  expect(runs).toHaveBeenCalled();                        // the handler ran, once per save
  expect(after.stats.saves).toBe(before.stats.saves + 1);
  // Those handlers can edit the clone after the capture, so the accepted bytes are
  // re-paired against the live page rather than taken from the capture's candidate.
  expect(after.stats.refreshes).toBe(before.stats.refreshes + 1);
  expect(after.align + after.hashKey).toBeGreaterThan(0);
  expect(plugin.source.text()).toBe(sent.body);
  expect(plugin.source.locate(document.querySelector("[data-id='b']"))).not.toBeNull();

  list.removeAttribute("onbeforesave");
  delete window.__sourceHandlerRuns;
});

test("a partial reprint is counted only on acceptance, and still adopts its capture", async () => {
  jest.spyOn(console, "info").mockImplementation(() => {});
  // The renderer's documented break: one text node's bytes are copied twice, a
  // corruption only the copy path can make, so the element around it is printed instead.
  snapshot.setSaveRenderer((clone, today) => plugin.renderSave(clone, today, { doubleCopied: "alpha" }));
  const before = plugin.source.stats();

  const { sent, midflight, after, result } = await saveAndAnswer({ body: { msg: "Saved" } });

  expect(result.ok).toBe(true);
  expect(sent.body).toContain('<li data-id="a">alpha</li>');   // the failing element, printed
  expect(sent.body).toContain("<ul id=list>");                 // its parent, the author's bytes
  expect(midflight.stats.partialReprints).toBe(before.partialReprints);   // a render is not a save
  expect(after.stats.partialReprints).toBe(before.partialReprints + 1);
  expect(after.stats.reprints).toBe(before.reprints);
  expect(after.stats.saves).toBe(before.saves + 1);
  // A partial print verifies against the clone, so its capture still adopts.
  expect(after.align).toBe(0);
  expect(after.hashKey).toBe(0);
  expect(after.stats.refreshes).toBe(before.refreshes);
  expect(plugin.source.text()).toBe(sent.body);

  snapshot.setSaveRenderer(plugin.renderSave);
});

test("a conditional hosted save adopts its capture too", async () => {
  router.responses.meta = { body: { spec: 1, extensions: ["conditional"], document: { etag: "v1" } } };
  await etagMod.seedEtag({ fresh: true });
  expect(etagMod.lastSeenEtag()).toBe("v1");

  textNode("b").data = "theta";
  const { sent, before, after, result } = await saveAndAnswer({ body: { msg: "Saved", etag: "v2" } });

  expect(result.ok).toBe(true);
  expect(sent.headers["If-Match"]).toBe("v1");
  expect(after.stats.saves).toBe(before.stats.saves + 1);
  expect(after.align).toBe(0);
  expect(after.hashKey).toBe(0);
  expect(after.stats.refreshes).toBe(before.stats.refreshes);
  expect(plugin.source.text()).toBe(sent.body);
  expect(etagMod.lastSeenEtag()).toBe("v2");
});

test("a failed save releases its artifact", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  const capture = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  expect(snapshot.captureArtifact(capture)).not.toBeNull();

  router.responses.save = { status: 500, text: "" };
  sourceMap.resetPairingCounts();
  const result = await saveCore.saveCapturedHtml(capture.forSave, capture.captureId, () => {}, { capture });

  expect(result.ok).toBe(false);
  expect(snapshot.captureArtifact(capture)).toBeNull();
  expect(sourceMap.pairingCounts.align + sourceMap.pairingCounts.hashKey).toBe(0);
});

test("an inspection capture sends no sync frame", () => {
  const before = frames;
  snapshot.captureSaveClone({ flushUndo: false, authored: false });
  expect(frames).toBe(before);
});
