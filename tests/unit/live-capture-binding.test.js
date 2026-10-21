import { jest } from "@jest/globals";

/**
 * C2a: a live pin belongs to the capture whose exact body was sent. A raw save,
 * a skipped capture or a newer unsent snapshot must neither steal that pin nor
 * drop it, and only a body that still matches the pin may be retired.
 */

await jest.unstable_mockModule("../../src/core/host-meta.js", () => ({
  hostSupports: async () => false,
  hostMeta: async () => ({ spec: 1, extensions: [], document: null }),
}));
await jest.unstable_mockModule("../../src/live/local-lane.js", () => ({
  localLaneSupported: () => false,
  localTransport: () => ({}),
}));

window.clayEditMode = true;

// Every document save reaches this mock. A queued response resolves the next
// /_/save call; with none queued, the save is accepted.
const saves = [];
const responses = [];
global.fetch = jest.fn(async (url, init = {}) => {
  const target = String(url);
  if (target.includes("/_/save")) {
    saves.push({ url: target, init });
    const answer = await (responses.length ? responses.shift()(saves.length, init) : { status: 200, body: { msg: "Saved" } });
    const status = answer.status ?? 200;
    return {
      ok: status < 400,
      status,
      statusText: "",
      headers: { get: () => null },
      text: async () => JSON.stringify(answer.body ?? {}),
      json: async () => answer.body ?? {},
    };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" };
});

const { live, confirmSaved, storeOf, sendingCapture } = await import("../../src/plugins/live.js");
const snapshot = await import("../../src/core/snapshot.js");
const { stampOf } = await import("../../src/live/ops.js");
const { saveCapturedHtml, saveHtml, onSaveAttempt, resetSaveAttempts } = await import("../../src/core/save-core.js");

const tag = (name, json) => `<script type="application/json" merge="${name}" clay="live">${json}</script>`;

const open = (name, json = '{"n":0}') => {
  document.body.innerHTML = tag(name, json);
  return live(name);
};

const capture = () => snapshot.captureForSaveAndComparison({ flushUndo: false });
const pendingIds = (name) => storeOf(name).pendingEntries().map((entry) => entry.id);

beforeEach(() => {
  saves.length = 0;
  responses.length = 0;
  resetSaveAttempts();
});

test("a captured save binds its pin and confirms only that capture", async () => {
  const game = open("cb_normal");
  game.add("n", 1);
  const cap = capture();
  const ids = pendingIds("cb_normal");
  expect(ids).toHaveLength(1);

  const result = await saveCapturedHtml(cap.forSave, cap.captureId);
  expect(result.ok).toBe(true);

  const evidence = sendingCapture();
  expect(evidence.captureId).toBe(cap.captureId);
  expect(evidence.qualified.get("cb_normal")).toEqual(ids);
  expect(storeOf("cb_normal").pending).toEqual([]);
  expect(game.toJSON()).toEqual({ n: 1 });
});

test("a stamped file-mode body qualifies its captured operation", async () => {
  const name = "cb_stamped";
  const original = '{"n":0}';
  document.body.innerHTML = tag(name, original).replace(' clay="live"', ` clay="live" live-at="${stampOf("e1", 0, original)}"`);
  const game = live(name);
  game.add("n", 1);
  const cap = capture();
  const savedTag = new DOMParser().parseFromString(cap.forSave, "text/html").querySelector(`script[merge="${name}"]`);
  expect(savedTag.getAttribute("live-at")).not.toBeNull();
  expect(savedTag.getAttribute("live-by")).not.toBeNull();

  const result = await saveCapturedHtml(cap.forSave, cap.captureId);
  expect(result.ok).toBe(true);
  expect(sendingCapture().qualified.get(name)).toEqual([1]);
  expect(storeOf(name).pending).toEqual([]);
});

test("a skipped capture followed by an unrelated raw save never binds", async () => {
  const game = open("cb_skip");
  game.add("n", 1);
  const cap = capture();

  const raw = await saveHtml(cap.forSave);
  expect(raw.ok).toBe(true);
  // captureId null, so the raw save cannot consume the skipped capture's pin.
  expect(storeOf("cb_skip").pending).toHaveLength(1);
  expect(game.toJSON()).toEqual({ n: 1 });

  // The pin survived, so the capture's own send can still confirm its ops.
  const owned = await saveCapturedHtml(cap.forSave, cap.captureId);
  expect(owned.ok).toBe(true);
  expect(storeOf("cb_skip").pending).toEqual([]);
  expect(game.toJSON()).toEqual({ n: 1 });
});

test("direct confirmSaved(html) keeps its explicit legacy behavior", async () => {
  const game = open("cb_direct");
  game.add("n", 1);
  const cap = capture();

  confirmSaved(cap.forSave);
  expect(storeOf("cb_direct").pending).toEqual([]);
  expect(game.toJSON()).toEqual({ n: 1 });

  confirmSaved(cap.forSave);
  expect(storeOf("cb_direct").pending).toEqual([]);
});

test("a direct save result cannot shadow a later capture's DOM refusal", async () => {
  const game = open("cb_shadow");
  game.add("n", 1);
  const first = capture();
  responses.push(() => ({ status: 502, body: { msg: "lost" } }));
  await saveCapturedHtml(first.forSave, first.captureId);

  game.add("n", 1);
  const second = capture();
  document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { status: 403 } }));
  confirmSaved(second.forSave);
  expect(storeOf("cb_shadow").pending).toHaveLength(1);
});

test("a newer unsent capture replaces only the older unsent pin and keeps pending ids", async () => {
  const game = open("cb_replace");
  game.add("n", 1);
  const first = capture();
  const second = capture();

  // The replaced capture no longer owns a pin, so its id confirms nothing.
  const orphan = await saveCapturedHtml(first.forSave, first.captureId);
  expect(orphan.ok).toBe(true);
  expect(storeOf("cb_replace").pending).toHaveLength(1);

  const result = await saveCapturedHtml(second.forSave, second.captureId);
  expect(result.ok).toBe(true);
  expect(sendingCapture().captureId).toBe(second.captureId);
  expect(storeOf("cb_replace").pending).toEqual([]);
  expect(game.toJSON()).toEqual({ n: 1 });
});

test("a newer unsent snapshot while an old capture is on the wire stays distinct", async () => {
  const game = open("cb_newer");
  game.add("n", 1);
  const first = capture();

  let release;
  responses.push(() => new Promise((resolve) => { release = () => resolve({ status: 200, body: { msg: "Saved" } }); }));
  const firstSave = saveCapturedHtml(first.forSave, first.captureId);
  expect(sendingCapture().captureId).toBe(first.captureId);

  game.add("n", 1);
  const second = capture();
  expect(second.captureId).not.toBe(first.captureId);

  release();
  const firstResult = await firstSave;
  expect(firstResult.ok).toBe(true);
  // The older save confirms its own op only; the newer capture is untouched.
  expect(storeOf("cb_newer").pending).toHaveLength(1);
  expect(game.toJSON()).toEqual({ n: 2 });

  const secondResult = await saveCapturedHtml(second.forSave, second.captureId);
  expect(secondResult.ok).toBe(true);
  expect(sendingCapture().qualified.get("cb_newer")).toEqual([2]);
  expect(storeOf("cb_newer").pending).toEqual([]);
  expect(game.toJSON()).toEqual({ n: 2 });
});

test("an altered captured body does not qualify", async () => {
  const game = open("cb_altered");
  game.add("n", 1);
  const cap = capture();
  const altered = cap.forSave.replace('{"n":1}', '{"n":9}');
  expect(altered).not.toBe(cap.forSave);

  const result = await saveCapturedHtml(altered, cap.captureId);
  expect(result.ok).toBe(true);
  const evidence = sendingCapture();
  expect(evidence.captureId).toBe(cap.captureId);
  expect(evidence.qualified.has("cb_altered")).toBe(false);
  expect(storeOf("cb_altered").pending).toHaveLength(1);
});

test("a removed captured tag does not qualify", async () => {
  const game = open("cb_removed");
  game.add("n", 1);
  const cap = capture();
  const without = cap.forSave.replace(tag("cb_removed", '{"n":1}'), "");
  expect(without).not.toContain("cb_removed");

  const result = await saveCapturedHtml(without, cap.captureId);
  expect(result.ok).toBe(true);
  expect(sendingCapture().qualified.has("cb_removed")).toBe(false);
  expect(storeOf("cb_removed").pending).toHaveLength(1);
});

test("duplicate live tags do not qualify", async () => {
  const game = open("cb_dup");
  game.add("n", 1);
  const cap = capture();
  const original = tag("cb_dup", '{"n":1}');
  const duplicated = cap.forSave.replace(original, original + original);
  expect(duplicated.split("cb_dup")).toHaveLength(3);

  const result = await saveCapturedHtml(duplicated, cap.captureId);
  expect(result.ok).toBe(true);
  expect(sendingCapture().qualified.has("cb_dup")).toBe(false);
  expect(storeOf("cb_dup").pending).toHaveLength(1);
});

test("both retry ids of one logical save stay with the same capture and body", async () => {
  const game = open("cb_retry");
  game.add("n", 1);
  const cap = capture();

  const attempts = [];
  const off = onSaveAttempt((attempt) => attempts.push(attempt));
  // A 412 naming this tab's own just-sent id: the late-duplicate recovery mints a
  // second id and resends the same body.
  responses.push((count, init) => ({ status: 412, body: { msg: "conflict", saveId: init.headers["Save-ID"] } }));
  const result = await saveCapturedHtml(cap.forSave, cap.captureId);
  off();

  expect(result.ok).toBe(true);
  expect(attempts).toHaveLength(2);
  expect(attempts[0].captureId).toBe(cap.captureId);
  expect(attempts[1].captureId).toBe(cap.captureId);
  expect(attempts[1].html).toBe(attempts[0].html);
  expect(attempts[1].saveId).not.toBe(attempts[0].saveId);
  expect(sendingCapture().captureId).toBe(cap.captureId);
  expect(storeOf("cb_retry").pending).toEqual([]);
});
