/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * Spec §6, `conditional`: the client half. A host that advertises the capability
 * stamps the bytes it stored, accepts that stamp back as `If-Match`, and refuses
 * with 412 rather than overwriting a version this tab has never seen.
 *
 * Everything here is driven through the public surface — the save lane, the
 * savestatus attribute, the clay:save-* events — so the test says nothing about
 * where the stamp is kept, only that the right value goes out and the right thing
 * happens when it is refused.
 */

let saveMod, etagMod, metaMod;
let responses;
let calls;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function installRouter() {
  calls = { meta: [], save: [] };
  global.fetch = jest.fn(async (url, options) => {
    const target = String(url);
    if (target.includes("/_/meta")) {
      calls.meta.push([target, options]);
      const body = responses.meta;
      if (!body) return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
      return { ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(body) };
    }
    calls.save.push([target, options]);
    const answer = responses.save(calls.save.length);
    const status = answer.status ?? 200;
    return {
      ok: status < 400,
      status,
      statusText: "",
      // Read the way Headers.get does, case-insensitively, so a refusal can carry
      // Retry-After exactly as a host sends it.
      headers: {
        get: (name) => {
          const table = answer.headers || {};
          const key = Object.keys(table).find((k) => k.toLowerCase() === String(name).toLowerCase());
          return key === undefined ? null : table[key];
        }
      },
      // `text` lets a case answer with a genuinely empty body, which is what a
      // proxy does when it refuses on the host's behalf.
      text: async () => (answer.text !== undefined ? answer.text : JSON.stringify(answer.body ?? {}))
    };
  });
}

const accepted = (etag) => () => ({ body: etag ? { msg: "Saved", etag } : { msg: "Saved" } });
const refused = () => ({
  status: 412,
  body: { msg: "This document changed since you last loaded it.", code: "conflict" }
});

function ifMatchOf(index) {
  return calls.save[index][1].headers["If-Match"];
}

function headerOf(index, name) {
  return calls.save[index][1].headers[name];
}

async function edit(text) {
  document.getElementById("c").textContent = text;
}

// Re-run discovery from scratch, the way a freshly loaded page does, so one file
// can exercise several kinds of host.
async function rediscover() {
  metaMod.resetHostMeta();
  etagMod.forgetEtag();
  await etagMod.seedEtag();
}

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">start</div>';
  responses = {
    meta: { spec: 1, extensions: ["conditional"], document: { etag: "seed-1" } },
    save: accepted("stored-1")
  };
  installRouter();
  saveMod = await import("../../src/core/save.js");
  etagMod = await import("../../src/core/etag.js");
  metaMod = await import("../../src/core/host-meta.js");
  await flush();
});

beforeEach(() => {
  const metaBody = responses.meta;
  installRouter();
  responses.meta = metaBody;
  document.documentElement.removeAttribute("savestatus");
});

test("the first save of a page that has never saved carries the stamp discovery seeded", async () => {
  responses.save = accepted("stored-1");
  await edit("one");

  const result = await saveMod.savePage();

  expect(result.ok).toBe(true);
  expect(calls.save).toHaveLength(1);
  // Without a seed this save would be unconditional, and the save most likely to
  // collide is the first one: the page has been open longest by then.
  expect(ifMatchOf(0)).toBe("seed-1");
});

test("later saves carry the stamp the host returned, never one derived from the bytes sent", async () => {
  // The reformatting case. `stored-1` deliberately has nothing to do with the body
  // of save one, exactly as a host with formathtml="true" stamps bytes the client
  // never sent. If the client ever computed its own stamp, save two would carry a
  // value the host could not match and would be refused for no reason.
  responses.save = accepted("stored-2");
  await edit("two");
  await saveMod.savePage();

  expect(ifMatchOf(0)).toBe("stored-1");
  expect(ifMatchOf(0)).not.toContain("two");

  responses.save = accepted("stored-3");
  await edit("three");
  await saveMod.savePage();

  expect(ifMatchOf(1)).toBe("stored-2");
});

test("a host that never advertised conditional is sent no If-Match, even when it returns an etag", async () => {
  responses.meta = { spec: 1, extensions: ["sync"], document: { etag: "seed-x" } };
  await rediscover();

  responses.save = accepted("stored-x");
  await edit("plain host");
  await saveMod.savePage();
  await edit("plain host again");
  await saveMod.savePage();

  // §5: a client must not infer a capability any other way, and a host that never
  // promised to honour the header may do anything at all with it.
  expect(ifMatchOf(0)).toBeUndefined();
  expect(ifMatchOf(1)).toBeUndefined();

  // The positive control on the same page and the same stamp. Without it this
  // test would pass against a client that never sends the header at all, which is
  // to say against the code this change replaces.
  responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "seed-x" } };
  await rediscover();
  await edit("announced host");
  await saveMod.savePage();

  expect(ifMatchOf(2)).toBe("seed-x");
});

test("no stamp means no header, and the first save's own response arms the next one", async () => {
  // A private document, or any caller the host will not hand a per-document block
  // to: `conditional` is offered, but this page has no stamp to send yet.
  responses.meta = { spec: 1, extensions: ["conditional"] };
  await rediscover();

  responses.save = accepted("stored-y");
  await edit("unseeded");
  await saveMod.savePage();
  expect(ifMatchOf(0)).toBeUndefined();

  await edit("unseeded again");
  await saveMod.savePage();
  expect(ifMatchOf(1)).toBe("stored-y");
});

test("an accepted save that answers with no stamp clears the old one instead of sending it again", async () => {
  responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "seed-z" } };
  await rediscover();

  responses.save = accepted(null);
  await edit("no stamp back");
  await saveMod.savePage();
  expect(ifMatchOf(0)).toBe("seed-z");

  // The document on disk is our bytes now, so `seed-z` describes something the
  // host has stopped storing. Sending it again would 412 forever.
  await edit("no stamp back twice");
  await saveMod.savePage();
  expect(ifMatchOf(1)).toBeUndefined();
});

describe("a save that times out", () => {
  // §7: the write may have landed and it may not, and this client cannot tell.
  // The stamp is left exactly as it was. Taking the host's current one instead
  // would be a guess that our own write is what moved the document, and the times
  // that guess is wrong are precisely the times a peer wrote: the tab would adopt
  // a stamp for bytes it has never seen and overwrite them on the next save with
  // no refusal and no notice. A kept stamp costs a refusal, which is recoverable.
  beforeEach(async () => {
    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "before-timeout" } };
    await rediscover();

    // The write lands on the host and the answer never reaches the browser, so
    // the host's stamp moves during the request the client gives up on.
    responses.save = () => {
      responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "it-landed" } };
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
  });

  test("keeps its stamp rather than adopting whatever the host now holds", async () => {
    await edit("slow network, save one");
    const timedOut = await saveMod.savePage();
    expect(timedOut.msgType).toBe("unknown");
    await flush();

    responses.save = accepted("stored-t");
    await edit("the retry");
    await saveMod.savePage();

    expect(ifMatchOf(calls.save.length - 1)).toBe("before-timeout");
  });

  test("marks the refusal that follows, so the notice can explain it", async () => {
    await edit("slow network, save two");
    await saveMod.savePage();
    await flush();

    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);
    responses.save = refused;
    await edit("the retry after a timeout");
    await saveMod.savePage();
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(seen).toHaveLength(1);
    expect(seen[0].afterTimeout).toBe(true);
  });

  test("stops marking refusals once a save the host answered has landed", async () => {
    await edit("slow network, save three");
    await saveMod.savePage();
    await flush();

    responses.save = accepted("stored-t");
    await edit("a save that got through");
    await saveMod.savePage();

    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);
    responses.save = refused;
    await edit("a later, unrelated conflict");
    await saveMod.savePage();
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(seen).toHaveLength(1);
    expect(seen[0].afterTimeout).toBe(false);
  });
});

describe("a 412", () => {
  beforeEach(async () => {
    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "seed-c" } };
    await rediscover();
    responses.save = refused;
  });

  test("is reported as a conflict, not as a failed save", async () => {
    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await edit("an hour of typing");
    const result = await saveMod.savePage();
    const status = document.documentElement.getAttribute("savestatus");
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(result.ok).toBe(false);
    expect(result.msgType).toBe("conflict");
    expect(result.code).toBe("conflict");
    expect(status).toBe("conflict");
    expect(seen).toHaveLength(1);
    expect(seen[0].msg).toBe("This document changed since you last loaded it.");
  });

  // Spec §6: the host may name what moved the document, and only the host can know.
  // Being told it was your own other tab is a very different thing to being told a
  // colleague overwrote you, so the field has to survive the whole way from the
  // refusal body to the event the notice listens to.
  test("carries the host's word on what changed the file through to the event", async () => {
    responses.save = () => ({
      status: 412,
      body: { msg: "This document changed since you last loaded it.", code: "conflict", changedBy: "another-tab" }
    });
    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await edit("an hour of typing");
    const result = await saveMod.savePage();
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(result.changedBy).toBe("another-tab");
    expect(seen[0].changedBy).toBe("another-tab");
  });

  // A host that cannot tell must say nothing rather than guess, and the page then
  // uses the phrase that is true in every case.
  test("says nothing about the source when the host does not", async () => {
    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await edit("an hour of typing");
    await saveMod.savePage();
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(seen[0].changedBy).toBeNull();
  });

  // A regression guard rather than a test of new behaviour: a refused save has
  // always left the baselines where they were. It is here because the conflict
  // branch is a new path through applySaveResult, and the one thing that path must
  // never do is record bytes as saved that the host refused to write.
  test("keeps the edits: the page stays dirty and the close warning still fires", async () => {
    await edit("still mine");
    await saveMod.savePage();

    expect(saveMod.getUnsavedChanges()).toBe(true);
    const { captureForDirtyCheck } = await import("../../src/core/snapshot.js");
    expect(captureForDirtyCheck()).not.toBe(saveMod.getLastSavedDirty());
  });

  test("stops autosave, so the same refusal is not retried every throttle window", async () => {
    await edit("hold me");
    await saveMod.savePage();
    expect(saveMod.isSaveConflicted()).toBe(true);

    const before = calls.save.length;
    await edit("more typing");
    const auto = await saveMod.savePageThrottled();

    expect(auto.msgType).toBe("skipped");
    expect(calls.save).toHaveLength(before);
  });

  // A proxy can refuse on the host's behalf and send nothing at all. There is no
  // `code` in an empty body to read, so the status has to carry this on its own.
  test("still conflicts when the refusal has no body", async () => {
    responses.save = () => ({ status: 412, text: "" });
    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await edit("nothing came back but the number");
    const result = await saveMod.savePage();
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(result.msgType).toBe("conflict");
    expect(saveMod.isSaveConflicted()).toBe(true);
    expect(seen).toHaveLength(1);
  });

  test("clay.save.overwrite takes a fresh stamp from the host, lands, and clears the hold", async () => {
    await edit("keep mine");
    await saveMod.savePage();
    expect(saveMod.isSaveConflicted()).toBe(true);

    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "theirs-9" } };
    responses.save = accepted("mine-10");

    const result = await saveMod.saveOverwritingConflict();

    expect(result.ok).toBe(true);
    expect(ifMatchOf(calls.save.length - 1)).toBe("theirs-9");
    expect(saveMod.isSaveConflicted()).toBe(false);
    expect(document.documentElement.getAttribute("savestatus")).toBe("saved");
  });
});

// htmlclay refuses a save that arrives while an outside process is truncating the
// file, and that refusal lifts itself within a second. Reading its 409 as §6's
// conflict suspended autosave until a person intervened, over a condition that had
// already cleared. The status decides (§3), so this is an ordinary failure and the
// next autosave goes out and lands.
describe("a 409 that calls itself a conflict", () => {
  beforeEach(async () => {
    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "seed-409" } };
    await rediscover();
    responses.save = () => ({
      status: 409,
      body: { msg: "Refusing to save over a truncation in progress", code: "conflict" }
    });
  });

  test("is an error, holds nothing, and the next autosave still goes out", async () => {
    const seen = [];
    const onConflict = (e) => seen.push(e.detail);
    document.addEventListener("clay:save-conflict", onConflict);

    await edit("typed while the file was being truncated");
    const result = await saveMod.savePage();
    document.removeEventListener("clay:save-conflict", onConflict);

    expect(result.ok).toBe(false);
    expect(result.msgType).toBe("error");
    expect(saveMod.isSaveConflicted()).toBe(false);
    expect(seen).toHaveLength(0);
    expect(document.documentElement.getAttribute("savestatus")).toBe("error");

    const before = calls.save.length;
    responses.save = accepted("stored-409");
    await edit("and the guard has lifted");
    const auto = await saveMod.savePageThrottled();

    expect(auto.ok).toBe(true);
    expect(calls.save).toHaveLength(before + 1);
  });
});

describe("live sync", () => {
  beforeEach(async () => {
    responses.meta = { spec: 1, extensions: ["conditional", "sync"], document: { etag: "seed-s" } };
    await rediscover();
    responses.save = accepted("stored-s");
  });

  test("a disk-sourced frame replaces the stamp, so the next save is not refused for a change it applied", async () => {
    responses.meta = { spec: 1, extensions: ["conditional", "sync"], document: { etag: "disk-2" } };
    document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { seq: 7, source: "disk" } }));
    await flush();

    await edit("after the disk frame");
    await saveMod.savePage();

    expect(ifMatchOf(calls.save.length - 1)).toBe("disk-2");
  });

  test("a peer's snapshot leaves the stamp alone and asks the host nothing", async () => {
    const before = calls.meta.length;
    document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { seq: 8, source: "peer" } }));
    await flush();

    await edit("after a peer frame");
    await saveMod.savePage();

    // §10 relays never write to disk, so the stamp is still true after one lands.
    expect(calls.meta).toHaveLength(before);
    expect(ifMatchOf(calls.save.length - 1)).toBe("seed-s");
  });
});

// The host answers a page refusal with a stable `code`, the typed `reason` behind
// it, and on a 503 a `Retry-After`. None of that survived the response boundary
// before: the never-rejecting result carried only a message, a status and the
// conflict fields, so a caller could not tell a capacity refusal from a stale
// conversion, and `retryAfter` was dropped entirely.
describe("typed refusals from the host contract", () => {
  const ROWS = [
    { label: "invalid-header", status: 400, code: "page-conversion-refused", reason: "invalid-header" },
    { label: "invalid-capture", status: 422, code: "page-conversion-refused", reason: "invalid-capture" },
    { label: "invalid-source", status: 409, code: "page-conversion-refused", reason: "invalid-source" },
    { label: "ambiguous-source", status: 409, code: "page-conversion-refused", reason: "ambiguous-source" },
    { label: "room-page-authority", status: 409, code: "page-conversion-refused", reason: "room-page-authority" },
    { label: "implicit-conversion", status: 409, code: "page-conversion-required", reason: "implicit-conversion" },
    { label: "source-changed", status: 409, code: "page-conversion-stale", reason: "source-changed" },
    { label: "room-changed", status: 409, code: "page-conversion-stale", reason: "room-changed" },
    { label: "room-required", status: 409, code: "page-conversion-stale", reason: "room-required" },
    { label: "page-converting", status: 503, code: "page-converting", reason: "page-converting", header: "0", delay: 0, sends: 4 },
    { label: "budget", status: 503, code: "page-capacity", reason: "budget", header: "60", delay: 60 },
    { label: "receipt-capacity", status: 503, code: "page-capacity", reason: "receipt-capacity", header: "60", delay: 60 },
    { label: "file-changed", status: 428, code: "page-condition-required", reason: "file-changed" },
    { label: "save-id-reused", status: 409, code: "save-id-reused" },
  ];

  beforeEach(async () => {
    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "seed-typed" } };
    await rediscover();
  });

  for (const row of ROWS) {
    test(`${row.label}: ${row.code} is surfaced with its reason and is not a conflict`, async () => {
      responses.save = () => ({
        status: row.status,
        headers: row.header ? { "Retry-After": row.header } : undefined,
        body: {
          msg: `${row.code} refusal`,
          msgType: "error",
          code: row.code,
          ...(row.reason ? { reason: row.reason } : {}),
        },
      });

      const seen = [];
      const onError = (e) => seen.push(e.detail);
      document.addEventListener("clay:save-error", onError);
      await edit(`refused: ${row.label}`);
      const result = await saveMod.savePage();
      document.removeEventListener("clay:save-error", onError);

      expect(result.ok).toBe(false);
      expect(result.msgType).toBe("error");
      expect(result.code).toBe(row.code);
      expect(result.reason).toBe(row.reason ?? null);
      expect(result.retryAfter).toBe(row.delay ?? null);
      expect(result.saveOutcome).toBeNull();
      expect(saveMod.isSaveConflicted()).toBe(false);
      expect(document.documentElement.getAttribute("savestatus")).toBe("error");
      expect(calls.save).toHaveLength(row.sends ?? 1);
      expect(seen).toHaveLength(1);
      expect(seen[0].code).toBe(row.code);
      expect(seen[0].reason).toBe(row.reason ?? null);
      expect(seen[0].retryAfter).toBe(row.delay ?? null);
    });
  }

  test("a 412 is still a conflict and carries no conversion fields", async () => {
    responses.save = refused;
    await edit("an ordinary conflict");
    const result = await saveMod.savePage();

    expect(result.msgType).toBe("conflict");
    expect(result.code).toBe("conflict");
    expect(result.reason).toBeNull();
    expect(result.retryAfter).toBeNull();
    expect(result.saveOutcome).toBeNull();
    expect(saveMod.isSaveConflicted()).toBe(true);
  });

  test("Retry-After as an HTTP date is decoded relative to now", async () => {
    const when = new Date(Date.now() + 10000).toUTCString();
    responses.save = () => ({
      status: 503,
      headers: { "Retry-After": when },
      body: { msg: "Over budget.", msgType: "error", code: "page-capacity", reason: "budget" },
    });

    await edit("dated retry");
    const result = await saveMod.savePage();

    expect(result.retryAfter).toBeGreaterThanOrEqual(9);
    expect(result.retryAfter).toBeLessThanOrEqual(10);
  });

  test("a Retry-After that is neither a number nor a date is null", async () => {
    responses.save = () => ({
      status: 503,
      headers: { "Retry-After": "soon" },
      body: { msg: "Over budget.", msgType: "error", code: "page-capacity", reason: "budget" },
    });

    await edit("nonsense retry");
    const result = await saveMod.savePage();

    expect(result.retryAfter).toBeNull();
  });

  test.each(["1.5", "2026-10-22"])("a parseable non-HTTP date %s is invalid", async (header) => {
    responses.save = () => ({
      status: 503,
      headers: { "Retry-After": header },
      body: { msg: "Over budget.", msgType: "error", code: "page-capacity", reason: "budget" },
    });

    await edit(`invalid retry ${header}`);
    const result = await saveMod.savePage();

    expect(result.retryAfter).toBeNull();
  });

  test("Retry-After is clamped to an hour", async () => {
    responses.save = () => ({
      status: 503,
      headers: { "Retry-After": "99999" },
      body: { msg: "Over budget.", msgType: "error", code: "page-capacity", reason: "budget" },
    });

    await edit("absurd retry");
    const result = await saveMod.savePage();

    expect(result.retryAfter).toBe(3600);
  });
});

describe("page-converting retries inside one logical save", () => {
  const converting = () => ({
    status: 503,
    headers: { "Retry-After": "1" },
    body: { msg: "Converting the page.", msgType: "error", code: "page-converting", reason: "page-converting" },
  });

  beforeEach(async () => {
    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "seed-conv" } };
    await rediscover();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("waits the header's seconds, then re-sends the same body, Save-ID and If-Match", async () => {
    responses.save = (n) => (n === 1 ? converting() : accepted("stored-conv")());
    await edit("still converting");
    const pending = saveMod.savePage();
    await jest.advanceTimersByTimeAsync(0);

    expect(calls.save).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(999);
    expect(calls.save).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(2);
    expect(headerOf(1, "Save-ID")).toBe(headerOf(0, "Save-ID"));
    expect(headerOf(1, "If-Match")).toBe(headerOf(0, "If-Match"));
    expect(calls.save[1][1].body).toBe(calls.save[0][1].body);
  });

  test("stops after three extra attempts and surfaces the refusal", async () => {
    responses.save = converting;
    await edit("never converts");
    const pending = saveMod.savePage();
    await jest.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 3; i++) await jest.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.code).toBe("page-converting");
    expect(result.msgType).toBe("error");
    expect(result.hadTimeout).toBe(false);
    expect(calls.save).toHaveLength(4);
  });

  test("a newer capture cancels the retry, so stale bytes are not re-sent", async () => {
    responses.save = (n) => (n === 1 ? converting() : accepted("should-not-arrive")());
    await edit("superseded");
    const pending = saveMod.savePage();
    await jest.advanceTimersByTimeAsync(0);
    expect(calls.save).toHaveLength(1);

    const snap = await import("../../src/core/snapshot.js");
    snap.captureForSaveAndComparison({ emitForSync: false });

    await jest.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.code).toBe("page-converting");
    expect(calls.save).toHaveLength(1);
  });

  test("a bound capture already superseded before sending gets no conversion retry", async () => {
    responses.save = converting;
    const snap = await import("../../src/core/snapshot.js");
    const { saveCapturedHtml } = await import("../../src/core/save-core.js");
    const older = snap.captureForSaveAndComparison({ emitForSync: false });
    const newer = snap.captureForSaveAndComparison({ emitForSync: false });
    expect(newer.captureId).toBeGreaterThan(older.captureId);

    const pending = saveCapturedHtml(older.forSave, older.captureId);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result.code).toBe("page-converting");
    expect(calls.save).toHaveLength(1);
  });
});
