/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * Spec §6, `receipts`: the client half. A save that times out leaves two questions
 * open at once, did our write land and did somebody else write, and this tab
 * cannot answer either from the outside. So it stamps every attempt with an opaque
 * id and asks the host the one question only the host can answer.
 *
 * What a person should see in the common case, a few seconds of bad wifi, is
 * nothing at all. The conflict bar is for the case where somebody else really did
 * write, and these tests are mostly about keeping it there.
 *
 * Driven entirely through the public surface: the save lane, the headers that go
 * out, and the clay:save-* events.
 */

let saveMod, etagMod, metaMod, coreMod;
let responses;
let calls;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function installRouter() {
  calls = { meta: [], save: [] };
  global.fetch = jest.fn(async (url, options) => {
    const target = String(url);
    if (target.includes("/_/meta")) {
      calls.meta.push([target, options]);
      const body = typeof responses.meta === "function" ? responses.meta(calls.meta.length) : responses.meta;
      if (!body) return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
      return { ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(body) };
    }
    calls.save.push([target, options]);
    const answer = responses.save(calls.save.length);
    if (answer.abort) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    const status = answer.status ?? 200;
    return {
      ok: status < 400,
      status,
      statusText: "",
      text: async () => JSON.stringify(answer.body ?? {})
    };
  });
}

const accepted = (etag) => () => ({ body: { msg: "Saved", etag } });
const timesOut = () => ({ abort: true });
const refusedBy = (extra) => () => ({
  status: 412,
  body: { msg: "This document changed since you last loaded it.", code: "conflict", ...extra }
});

const headerOf = (index, name) => calls.save[index][1].headers[name];
const savedIds = () => calls.save.map((_, i) => headerOf(i, "Save-ID"));

async function edit(text) {
  document.getElementById("c").textContent = text;
}

// A host that keeps receipts, as all three of ours do.
const RECEIPTS_HOST = ["conditional", "receipts"];

async function rediscover(extensions = RECEIPTS_HOST, etag = "seed-1") {
  metaMod.resetHostMeta();
  etagMod.forgetEtag();
  coreMod.resetSaveAttempts();
  responses.meta = { spec: 1, extensions, document: { etag } };
  await etagMod.seedEtag();
}

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">start</div>';
  responses = {
    meta: { spec: 1, extensions: RECEIPTS_HOST, document: { etag: "seed-1" } },
    save: accepted("stored-1")
  };
  installRouter();
  saveMod = await import("../../src/core/save.js");
  etagMod = await import("../../src/core/etag.js");
  metaMod = await import("../../src/core/host-meta.js");
  coreMod = await import("../../src/core/save-core.js");
  await flush();
});

beforeEach(async () => {
  installRouter();
  document.documentElement.removeAttribute("savestatus");
  await rediscover();
});

test("every save carries an id of its own", async () => {
  responses.save = accepted("stored-a");
  await edit("one");
  await saveMod.savePage();

  responses.save = accepted("stored-b");
  await edit("two");
  await saveMod.savePage();

  const [first, second] = savedIds();
  expect(first).toBeTruthy();
  expect(second).toBeTruthy();
  // Two tabs sharing an id would each read the other's receipt as proof of their
  // own write, so uniqueness per attempt is the whole property.
  expect(first).not.toBe(second);
});

// The case this capability exists for. The write landed, the answer did not come
// back, and the person should never learn that anything happened.
test("a timed-out save the host vouches for is a save that worked", async () => {
  await edit("slow network, but it landed");
  responses.save = timesOut;
  responses.meta = () => ({
    spec: 1, extensions: RECEIPTS_HOST,
    document: { etag: "after-the-write", saveId: pendingId() }
  });

  const conflicts = [];
  document.addEventListener("clay:save-conflict", (e) => conflicts.push(e.detail));
  const result = await saveMod.savePage();
  document.removeEventListener("clay:save-conflict", (e) => conflicts.push(e.detail));

  expect(result.ok).toBe(true);
  expect(conflicts).toHaveLength(0);
  // The stamp for the bytes the host proved are ours, so the next save is judged
  // against them rather than being refused against a version we never saw.
  responses.save = accepted("stored-next");
  await edit("carrying on");
  await saveMod.savePage();
  expect(headerOf(calls.save.length - 1, "If-Match")).toBe("after-the-write");
});

// The id of the attempt currently in flight: the router records it as the save goes
// out, so a meta answer built during the recovery can name it.
function pendingId() {
  return headerOf(calls.save.length - 1, "Save-ID");
}

test("a receipt this tab never sent is not proof of anything", async () => {
  await edit("somebody else's id");
  responses.save = timesOut;
  responses.meta = { spec: 1, extensions: RECEIPTS_HOST, document: { etag: "moved", saveId: "not-ours" } };

  await saveMod.savePage();
  await flush();

  // Not adopted: the recovery re-sent instead of reporting the save as landed, and
  // the re-send carried the stamp this tab still holds.
  expect(calls.save).toHaveLength(2);
  expect(headerOf(1, "If-Match")).toBe("seed-1");
});

// The re-send is a retry of the same attempt, not a new save, which is what keeps
// the first request's landing provable if it turns out to have landed after all.
test("a save the host cannot vouch for is re-sent under the original stamp and the same id", async () => {
  await edit("nothing landed");
  responses.save = (n) => (n === 1 ? timesOut() : accepted("stored-after-retry")());
  responses.meta = { spec: 1, extensions: RECEIPTS_HOST, document: { etag: "seed-1" } };

  const result = await saveMod.savePage();

  expect(result.ok).toBe(true);
  expect(calls.save).toHaveLength(2);
  expect(headerOf(1, "If-Match")).toBe("seed-1");
  expect(headerOf(1, "Save-ID")).toBe(headerOf(0, "Save-ID"));
});

// §6's late-duplicate rule, and the reason none of this rests on the host being
// truthful: the re-send is still conditional, so a write that DID land refuses it,
// and the refusal carries the proof that it was ours.
test("a refusal that turns out to be answering our own earlier save finishes quietly", async () => {
  await edit("the duplicate");
  responses.save = (n) => {
    if (n === 1) return timesOut();
    if (n === 2) return refusedBy({ etag: "our-own-bytes", saveId: headerOf(0, "Save-ID") })();
    return accepted("stored-on-top")();
  };
  responses.meta = { spec: 1, extensions: RECEIPTS_HOST, document: { etag: "moved-by-us" } };

  const conflicts = [];
  const onConflict = (e) => conflicts.push(e.detail);
  document.addEventListener("clay:save-conflict", onConflict);
  const result = await saveMod.savePage();
  document.removeEventListener("clay:save-conflict", onConflict);

  expect(result.ok).toBe(true);
  expect(conflicts).toHaveLength(0);
  // The stamp came from the refusal, and the save that followed was judged against
  // it. Nothing here was overwritten unconditionally.
  expect(headerOf(2, "If-Match")).toBe("our-own-bytes");
});

test("a refusal naming somebody else is still a conflict", async () => {
  await edit("a real conflict");
  responses.save = refusedBy({ etag: "their-bytes", saveId: "somebody-elses-id" });

  const conflicts = [];
  const onConflict = (e) => conflicts.push(e.detail);
  document.addEventListener("clay:save-conflict", onConflict);
  const result = await saveMod.savePage();
  document.removeEventListener("clay:save-conflict", onConflict);

  expect(result.ok).toBe(false);
  expect(result.msgType).toBe("conflict");
  expect(conflicts).toHaveLength(1);
  // One send. A refusal that is not ours is never retried on top of somebody's work.
  expect(calls.save).toHaveLength(1);
});

// The bar's wording, decided by whether the host answered the question at all.
test("a host that keeps receipts settles the question, so the notice stops hedging", async () => {
  await edit("answered");
  responses.save = (n) => (n === 1 ? timesOut() : refusedBy({ etag: "their-bytes" })());
  responses.meta = { spec: 1, extensions: RECEIPTS_HOST, document: { etag: "somebody-elses", saveId: "theirs" } };

  const conflicts = [];
  const onConflict = (e) => conflicts.push(e.detail);
  document.addEventListener("clay:save-conflict", onConflict);
  await saveMod.savePage();
  document.removeEventListener("clay:save-conflict", onConflict);

  expect(conflicts).toHaveLength(1);
  // The host said these bytes are not ours, so offering "this may be your own save"
  // would be telling somebody a maybe about something already known.
  expect(conflicts[0].afterTimeout).toBe(false);
});

test("a host that keeps none leaves the question open, and the notice keeps saying so", async () => {
  await rediscover(["conditional"], "seed-plain");
  await edit("unanswered");
  responses.save = (n) => (n === 1 ? timesOut() : refusedBy({ etag: "moved" })());
  responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "moved" } };

  const conflicts = [];
  const onConflict = (e) => conflicts.push(e.detail);
  document.addEventListener("clay:save-conflict", onConflict);
  await saveMod.savePage();
  document.removeEventListener("clay:save-conflict", onConflict);

  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].afterTimeout).toBe(true);
});

// A host that cannot be reached answers nothing, and nothing is what this tab then
// claims: it keeps the stamp, keeps the question open, and sends no recovery write.
test("a host that cannot be reached leaves everything where it was", async () => {
  await edit("offline entirely");
  responses.save = timesOut;
  responses.meta = null;

  const result = await saveMod.savePage();

  expect(result.ok).toBe(false);
  expect(result.msgType).toBe("unknown");
  expect(calls.save).toHaveLength(1);

  responses.save = accepted("stored-later");
  responses.meta = { spec: 1, extensions: RECEIPTS_HOST, document: { etag: "seed-1" } };
  await edit("later");
  await saveMod.savePage();
  expect(headerOf(calls.save.length - 1, "If-Match")).toBe("seed-1");
});

// The bar used to appear seconds after a timeout without anybody doing anything:
// the save queued behind the timed-out one went out on its own, was refused, and
// put a conflict on screen over what was really a few seconds of bad wifi.
test("a save queued behind an unanswerable one waits rather than walking into a refusal", async () => {
  await edit("the first");
  responses.save = timesOut;
  responses.meta = null;

  const first = saveMod.savePage();
  await edit("typed while it was in flight");
  const queued = await saveMod.savePage();
  expect(queued.msgType).toBe("skipped");

  await first;
  await flush();

  // Only the save that timed out. The newer bytes are still queued and still dirty,
  // so nothing is lost; they go out with the next save instead of into a question.
  expect(calls.save).toHaveLength(1);
});

test("and goes out as usual once an answer arrives", async () => {
  await edit("the first");
  responses.save = accepted("stored-1");

  const first = saveMod.savePage();
  await edit("typed while it was in flight");
  await saveMod.savePage();

  await first;
  await flush();

  expect(calls.save).toHaveLength(2);
  expect(headerOf(1, "If-Match")).toBe("stored-1");
});


// A save that never reached the host at all, in a tab that HAS saved successfully
// before. The host answers truthfully with the earlier save's receipt, because that
// really is what produced the bytes it stores. Reading that as "my save landed" is
// the one mistake that costs somebody their work: the tab reports Saved, advances
// its baselines, drops the close warning, and the bytes are on no disk anywhere.
test("an earlier save's receipt is not proof that THIS save landed", async () => {
  responses.save = accepted("stored-first");
  await edit("the first save, which really does land");
  await saveMod.savePage();
  const firstId = headerOf(0, "Save-ID");

  // The second save never reaches the host: nothing changes on disk, so the host
  // still holds the FIRST save's receipt and stamp, and says so honestly.
  await edit("the second save, which never arrives");
  responses.save = timesOut;
  responses.meta = { spec: 1, extensions: RECEIPTS_HOST, document: { etag: "stored-first", saveId: firstId } };

  const result = await saveMod.savePage();

  expect(result.ok).toBe(false);
  expect(document.documentElement.getAttribute("savestatus")).not.toBe("saved");
});

// The normative rule, in the spec's own words: "Every recovery write still has to
// satisfy the original If-Match." The stamp this tab holds is mutable and moves for
// reasons that have nothing to do with this save: a disk-sourced live-sync frame
// records the stamp of the bytes it applied. A re-send that reads the stamp again
// is conditional on the WRONG version, and the host accepts it, replacing bytes the
// person never saw with bytes captured before they arrived.
test("a recovery re-send carries the stamp the original save carried, not whatever the tab now holds", async () => {
  await edit("the save that times out");
  responses.save = (n) => (n === 1 ? timesOut() : accepted("stored-after")());
  responses.meta = { spec: 1, extensions: RECEIPTS_HOST, document: { etag: "moved-by-somebody" } };

  // Somebody else's write lands while the save is unresolved, and this tab morphs to
  // it and takes its stamp. `recordEtag` is what live-sync itself calls after
  // applying a disk frame, so this is that path and not a stand-in for it: firing
  // the event instead would prove nothing here, because the listener deliberately
  // leaves a stamped frame alone and live-sync is what records it.
  const savePromise = saveMod.savePage();
  etagMod.recordEtag("somebody-elses-bytes");
  await savePromise;

  expect(calls.save).toHaveLength(2);
  expect(headerOf(1, "If-Match")).toBe("seed-1");
});

// No stamp means nothing to re-send under. An unconditional recovery write replaces
// whatever arrived while this tab was waiting, with no comparison to refuse it.
test("a timed-out save that carried no stamp is not re-sent", async () => {
  await rediscover(["receipts"], "");
  await edit("unguarded");
  responses.save = timesOut;
  responses.meta = { spec: 1, extensions: ["receipts"], document: { etag: "whatever-is-there-now" } };

  const result = await saveMod.savePage();

  expect(result.ok).toBe(false);
  expect(calls.save).toHaveLength(1);
  expect(headerOf(0, "If-Match")).toBeUndefined();
});

// A receipts host may lose its pair to a restart or an eviction and is still
// conforming. Absence proves nothing, so the question stays open and the notice
// keeps saying the refusal may be answering this tab's own timed-out save.
test("a receipts host that lost its pair leaves the question open", async () => {
  await edit("the host restarted");
  responses.save = (n) => (n === 1 ? timesOut() : refusedBy({ etag: "moved" })());
  responses.meta = { spec: 1, extensions: RECEIPTS_HOST, document: { etag: "moved" } };

  const conflicts = [];
  const onConflict = (e) => conflicts.push(e.detail);
  document.addEventListener("clay:save-conflict", onConflict);
  await saveMod.savePage();
  document.removeEventListener("clay:save-conflict", onConflict);

  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].afterTimeout).toBe(true);
});
