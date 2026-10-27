/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * The candidate travels with its capture, and is adopted only for that capture.
 *
 * A save that rendered and verified its own bytes has already paid for the parse and
 * the pairing of them. Carrying that pair with the capture is what lets the acceptance
 * install it by assignment, so the accepted save schedules no inspection snapshot, no
 * `model(bytes)` of the bytes the host took and no `pairAgainstPage()` over the whole
 * document.
 *
 * The claims here are the ones that make the shortcut safe, because adopting a model
 * that is not the file writes somebody else's bytes on the next save:
 *
 *   adoption needs this capture's id AND its exact bytes, and a map no morph has
 *   invalidated since;
 *   a skip, a refusal, an error and an unknown outcome release the artifact and adopt
 *   nothing, so nothing becomes public before the host acknowledges that request;
 *   a timeout recovery adopts the artifact of the request that landed, never the
 *   newest render;
 *   a raw save, a capture without a request and a two-argument renderer keep the
 *   guarded repair they had.
 */

let snapshot, sourceMap, saveCore, saveMod, modeMod, plugin;

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

// Seeded ONCE: the map is keyed by live node identity, so a fresh import of the page
// would describe nodes that no candidate could pair with.
function seedDocument() {
  const parsed = new DOMParser().parseFromString(SRC, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
// A save settles over a promise chain, and a guarded repair lands on an idle callback
// (or a zero timeout when the platform has none): two turns is enough for both.
const settle = async () => { await tick(); await tick(); };

let router;

function answerFor(answer) {
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
    text: async () => (answer.text !== undefined ? answer.text : JSON.stringify(answer.body ?? {}))
  };
}

function installRouter() {
  router = { responses: {}, save: [], meta: [] };
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
    return {
      ok: true,
      status: 200,
      redirected: false,
      type: "basic",
      headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
      text: async () => SRC
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
  modeMod = await import("../../src/core/is-edit-mode.js");
  saveMod = await import("../../src/core/save.js");
  // A snapshot hook and an undo flush are the two things an inspection capture does on
  // its way past, and acceptance must take neither.
  snapshot.onSnapshot(() => { hookRuns++; });
  document.addEventListener("clay:snapshot-ready", () => { frames++; });
  installRouter();
  plugin = await import("../../src/plugins/source.js");
  await plugin.source.ready;
});

beforeEach(async () => {
  jest.restoreAllMocks();
  undoFlush = jest.fn();
  window.clay = { ...(window.clay || {}), undo: { flush: undoFlush } };
  router.save = [];
  router.meta = [];
  delete router.responses.meta;
  router.responses.save = { body: { msg: "Saved" } };
  sourceMap.resetPairingCounts();
  saveCore.resetSaveAttempts();
  snapshot.setSaveRenderer(plugin.renderSave);
  await settle();
});

afterAll(() => {
  snapshot.setSaveRenderer(null);
});

const textNode = (id) => document.querySelector(`[data-id='${id}']`).firstChild;

function counts() {
  return {
    ...plugin.source.stats(),
    align: sourceMap.pairingCounts.align,
    hashKey: sourceMap.pairingCounts.hashKey,
    hooks: hookRuns,
    frames,
    flushes: undoFlush.mock.calls.length
  };
}

/** Drive one save through the real lane and answer it. */
async function saveAndAnswer(answer, { drive = () => saveMod.savePage() } = {}) {
  const release = holdResponse();
  const before = counts();
  const saving = drive();
  await tick();
  const sent = router.save.length ? router.save[router.save.length - 1] : null;
  const midflight = counts();
  sourceMap.resetPairingCounts();
  release(answer);
  const result = await saving;
  await settle();
  return { sent, before, midflight, after: counts(), result };
}

test("an accepted save adopts its capture's own model, by assignment", async () => {
  textNode("b").data = "BETA";

  const { sent, before, midflight, after, result } = await saveAndAnswer({ body: { msg: "Saved" } });

  expect(result.ok).toBe(true);
  expect(sent.body).toContain("<li data-id='b'>BETA</li>");

  // Nothing became public before the host answered.
  expect(midflight.saves).toBe(before.saves);
  expect(midflight.refreshes).toBe(before.refreshes);

  // Acceptance is assignments: no re-model of the accepted bytes, no pairing, no
  // inspection snapshot, no authored hook, no undo flush.
  expect(after.refreshes).toBe(before.refreshes);
  expect(after.align).toBe(0);
  expect(after.hashKey).toBe(0);
  expect(after.frames).toBe(midflight.frames);
  expect(after.hooks).toBe(midflight.hooks);
  expect(after.flushes).toBe(midflight.flushes);
  expect(after.saves).toBe(before.saves + 1);

  // And it is the file now: `text()` is those bytes and a live node indexes them.
  expect(plugin.source.text()).toBe(sent.body);
  const loc = plugin.source.locate(document.querySelector("[data-id='b']"));
  expect(loc).not.toBeNull();
  expect(sent.body.slice(loc.from, loc.to)).toBe("<li data-id='b'>BETA</li>");

  // Both save baselines still come from the capture, never from a re-read of the page.
  expect(saveMod.getLastSavedContents()).not.toBe("");
  expect(saveMod.getUnsavedChanges()).toBe(false);
});

test("a capture whose bytes are not the accepted bytes takes the guarded repair", async () => {
  textNode("b").data = "delta";
  const capture = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  const acceptedBytes = capture.forSave.replace("<li data-id='b'>delta</li>", "<li data-id='b'>DELTA</li>");
  expect(acceptedBytes).not.toBe(capture.forSave);
  // The page already holds these bytes, so a repair models and pairs them cleanly.
  textNode("b").data = "DELTA";

  const before = counts();
  sourceMap.resetPairingCounts();
  const result = await saveCore.saveCapturedHtml(acceptedBytes, capture.captureId, () => {}, { capture });
  await settle();

  expect(result.ok).toBe(true);
  // The artifact is the model of a different string, so it is not this save's file.
  expect(plugin.source.stats().refreshes).toBe(before.refreshes + 1);
  expect(sourceMap.pairingCounts.align + sourceMap.pairingCounts.hashKey).toBeGreaterThan(0);
  expect(plugin.source.text()).toBe(acceptedBytes);
  expect(snapshot.captureArtifact(capture)).toBeNull();
});

test("a capture id that is not the accepted request's does not adopt", async () => {
  textNode("b").data = "epsilon";
  const capture = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });

  const before = counts();
  sourceMap.resetPairingCounts();
  const result = await saveCore.saveCapturedHtml(capture.forSave, capture.captureId + 1, () => {}, { capture });
  await settle();

  expect(result.ok).toBe(true);
  expect(plugin.source.stats().refreshes).toBe(before.refreshes + 1);
  expect(sourceMap.pairingCounts.align + sourceMap.pairingCounts.hashKey).toBeGreaterThan(0);
  expect(plugin.source.text()).toBe(capture.forSave);
  expect(snapshot.captureArtifact(capture)).toBeNull();
});

test("a skipped save releases its artifact and adopts nothing", async () => {
  const capture = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  expect(snapshot.captureArtifact(capture)).not.toBeNull();
  const before = counts();

  modeMod.commitModeFacts({ isEditMode: false });
  let result;
  try {
    result = await saveCore.saveCapturedHtml(capture.forSave, capture.captureId, () => {}, { capture });
  } finally {
    modeMod.commitModeFacts({ isEditMode: true });
  }
  await settle();

  expect(result.msgType).toBe("skipped");
  expect(snapshot.captureArtifact(capture)).toBeNull();
  expect(plugin.source.stats().saves).toBe(before.saves);
  expect(plugin.source.stats().refreshes).toBe(before.refreshes);
});

test("a refusal and an error release the artifact and adopt nothing", async () => {
  const file = plugin.source.text();

  const refused = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  let before = counts();
  router.responses.save = { status: 409, body: { msg: "Wrote by somebody else", code: "write-locked" } };
  let result = await saveCore.saveCapturedHtml(refused.forSave, refused.captureId, () => {}, { capture: refused });
  await settle();
  expect(result.ok).toBe(false);
  expect(snapshot.captureArtifact(refused)).toBeNull();
  expect(plugin.source.stats().saves).toBe(before.saves);
  expect(plugin.source.stats().refreshes).toBe(before.refreshes);
  expect(plugin.source.text()).toBe(file);

  jest.spyOn(console, "error").mockImplementation(() => {});
  const failed = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  before = counts();
  router.responses.save = { status: 500, text: "" };
  result = await saveCore.saveCapturedHtml(failed.forSave, failed.captureId, () => {}, { capture: failed });
  await settle();
  expect(result.ok).toBe(false);
  expect(result.msgType).toBe("error");
  expect(snapshot.captureArtifact(failed)).toBeNull();
  expect(plugin.source.stats().saves).toBe(before.saves);
  expect(plugin.source.stats().refreshes).toBe(before.refreshes);
  expect(plugin.source.text()).toBe(file);
});

test("an unknown outcome releases the artifact and adopts nothing", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  const capture = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  const before = counts();
  // A request that never got an answer. The host cannot be asked either, so the save
  // ends as a timeout: uncertain, and nothing to adopt.
  router.responses.save = () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };

  const result = await saveCore.saveCapturedHtml(capture.forSave, capture.captureId, () => {}, { capture });
  await settle();

  expect(result.ok).toBe(false);
  expect(result.msgType).toBe("unknown");
  expect(result.code).toBe("timeout");
  expect(snapshot.captureArtifact(capture)).toBeNull();
  expect(plugin.source.stats().saves).toBe(before.saves);
  expect(plugin.source.stats().refreshes).toBe(before.refreshes);
});

test("a timeout recovery adopts its own request's artifact, not the newest render", async () => {
  textNode("b").data = "omega";
  const request = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  expect(request.forSave).toContain("<li data-id='b'>omega</li>");
  // A newer render exists before the answer comes. A recovery may adopt only the bytes
  // the request that landed carried.
  textNode("b").data = "OMEGA";
  const newer = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  expect(newer.captureId).toBeGreaterThan(request.captureId);
  expect(newer.forSave).toContain("<li data-id='b'>OMEGA</li>");
  textNode("b").data = "omega";

  const attempts = [];
  const off = saveCore.onSaveAttempt((attempt) => attempts.push(attempt));
  const before = counts();
  sourceMap.resetPairingCounts();
  router.responses.save = () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
  // The host proves the timed-out attempt landed by naming its exact receipt id.
  router.responses.meta = () => ({
    body: { spec: 1, extensions: ["conditional"], document: { etag: "landed-1", saveId: attempts[0]?.saveId ?? null } }
  });

  let result;
  try {
    result = await saveCore.saveCapturedHtml(request.forSave, request.captureId, () => {}, { capture: request });
  } finally {
    off();
  }
  await settle();

  expect(attempts.length).toBeGreaterThan(0);
  expect(result.ok).toBe(true);
  expect(result.msgType).toBe("success");
  // Proof, so the request's own candidate is the file: no re-model, no pairing.
  expect(plugin.source.stats().refreshes).toBe(before.refreshes);
  expect(sourceMap.pairingCounts.align).toBe(0);
  expect(sourceMap.pairingCounts.hashKey).toBe(0);
  expect(plugin.source.stats().saves).toBe(before.saves + 1);
  expect(plugin.source.text()).toBe(request.forSave);
  const loc = plugin.source.locate(document.querySelector("[data-id='b']"));
  expect(request.forSave.slice(loc.from, loc.to)).toBe("<li data-id='b'>omega</li>");
  expect(snapshot.captureArtifact(request)).toBeNull();
});

test("a two-argument renderer keeps today's behaviour", async () => {
  snapshot.setSaveRenderer((clone, today) => today);
  textNode("b").data = "zeta";

  try {
    const { sent, before, after, result } = await saveAndAnswer({ body: { msg: "Saved" } });

    expect(result.ok).toBe(true);
    expect(sent.body).toContain("zeta");
    // A renderer that hands back today's serialization attaches no candidate, so the
    // accepted save takes the inspection path it always took. Bytes this module did
    // not render are also not its save to count.
    expect(after.saves).toBe(before.saves);
    expect(after.refreshes).toBe(before.refreshes + 1);
    expect(after.align + after.hashKey).toBeGreaterThan(0);
    expect(plugin.source.text()).toBe(sent.body);
  } finally {
    snapshot.setSaveRenderer(plugin.renderSave);
  }
});

test("a raw save adopts nothing and keeps the guarded repair", async () => {
  const file = plugin.source.text();
  // Whatever quoting the last renderer wrote, this is the same element with one more
  // attribute: bytes this module did not render.
  const bytes = file.replace(/<li data-id=["']a["']>/, (element) => element.replace(">", " data-x=\"1\">"));
  expect(bytes).not.toBe(file);
  const accepted = [];
  saveCore.onSaveAccepted((html, info) => accepted.push({ html, info }));

  const before = counts();
  sourceMap.resetPairingCounts();
  const result = await saveCore.saveHtml(bytes);
  await settle();

  expect(result.ok).toBe(true);
  expect(accepted).toHaveLength(1);
  // No artifact field at all: a raw string belongs to no capture and can confirm none.
  expect(Object.keys(accepted[0].info)).toEqual(["captureId"]);
  expect(accepted[0].info.captureId).toBeNull();
  expect(plugin.source.stats().refreshes).toBe(before.refreshes + 1);
  expect(sourceMap.pairingCounts.align + sourceMap.pairingCounts.hashKey).toBeGreaterThan(0);
  expect(plugin.source.text()).toBe(bytes);
  // Leave the page holding what the model says, so the next test starts in agreement.
  document.querySelector("[data-id='a']").setAttribute("data-x", "1");
});

test("an artifact exists only for a request capture, and holds no detached tree", () => {
  // An inspection capture has no request behind it to adopt anything.
  const inspection = snapshot.captureForSaveAndComparison({ emitForSync: false });
  expect(snapshot.captureArtifact(inspection)).toBeNull();

  const request = snapshot.captureForSaveAndComparison({ emitForSync: false, forRequest: true });
  const artifact = snapshot.captureArtifact(request);
  expect(artifact).not.toBeNull();
  expect(Object.keys(artifact).sort()).toEqual(["captureId", "html", "source"]);
  expect(artifact.captureId).toBe(request.captureId);
  expect(artifact.html).toBe(request.forSave);

  // The map is a WeakMap keyed by live page nodes, so the artifact holds no clone of
  // the page; the model is a parse of the bytes and carries no DOM at all.
  expect(artifact.source.map).toBeInstanceOf(WeakMap);
  expect(artifact.source.map.get(document.querySelector("#list"))).toBeTruthy();
  expect(domNodesIn(artifact)).toEqual([]);

  // The artifact is keyed by the capture object itself, so releasing it is forgetting
  // the entry, not a registry a later capture could be confused by.
  snapshot.releaseCaptureArtifact(request);
  expect(snapshot.captureArtifact(request)).toBeNull();
});

/** Every DOM node reachable from a value, however it is nested. */
function domNodesIn(value, seen = new Set(), found = []) {
  if (!value || typeof value !== "object" || seen.has(value)) return found;
  seen.add(value);
  if (typeof value.nodeType === "number") found.push(value);
  if (value instanceof Map) {
    for (const [key, entry] of value) { domNodesIn(key, seen, found); domNodesIn(entry, seen, found); }
    return found;
  }
  if (value instanceof Set) {
    for (const entry of value) domNodesIn(entry, seen, found);
    return found;
  }
  for (const key of Object.keys(value)) {
    try { domNodesIn(value[key], seen, found); } catch (err) { /* a getter that throws holds nothing */ }
  }
  return found;
}
