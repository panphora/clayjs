/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/page.html"}
 */
import { jest } from "@jest/globals";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ReadableStream, WritableStream, TransformStream } from "node:stream/web";
import { MessageChannel, MessagePort, BroadcastChannel } from "node:worker_threads";

// The host parser loads the rooms package, whose bundled HTML parser needs Node globals jsdom does not provide.
for (const [name, value] of Object.entries({ ReadableStream, WritableStream, TransformStream, MessageChannel, MessagePort, BroadcastChannel })) globalThis[name] ??= value;

// The host grammar is the only definition of a valid `Page-Conversion` value, so
// every emitted header is parsed by the committed host parser itself. That is the
// cross-repository convention the round14d tests use: read the sibling checkout,
// and say so plainly when it is not here rather than silently weakening the test.
const HYPERCLAY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../hyperclay/server-lib");
const present = existsSync(path.join(HYPERCLAY, "page-conversion.js"));
if (!present) console.log("save-conversion-header.test.js: skipped, the sibling hyperclay checkout is not here");
const suite = present ? describe : describe.skip;

let parsePageConversion;
let coreMod, saveMod, snapMod, metaMod, etagMod;

let calls;
let responses;
let unsubs;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function installRouter() {
  calls = { save: [], meta: [] };
  responses = {
    meta: { spec: 1, extensions: ["conditional"], document: { etag: "base-1" } },
    save: () => ({ body: { msg: "Saved", etag: "stored-1" } })
  };
  global.fetch = jest.fn(async (url, options) => {
    const target = String(url);
    const headers = options?.headers || {};
    if (target.includes("/_/save")) {
      calls.save.push({ url: target, options });
      const answer = await responses.save(calls.save.length, headers);
      if (answer.abort) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      const status = answer.status ?? 200;
      return {
        ok: status < 400,
        status,
        statusText: "",
        headers: {
          get: (name) => {
            const table = answer.headers || {};
            const key = Object.keys(table).find((k) => k.toLowerCase() === String(name).toLowerCase());
            return key === undefined ? null : table[key];
          }
        },
        text: async () => JSON.stringify(answer.body ?? {})
      };
    }
    calls.meta.push({ url: target, options });
    return { ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(responses.meta) };
  });
}

const headerOf = (index, name) => calls.save[index].options.headers[name];
const conversionOf = (index) => headerOf(index, "Page-Conversion");
const savedIds = () => calls.save.map((_, i) => headerOf(i, "Save-ID"));

const FILE_BASE = "a".repeat(64);
const ROOM_BASE = "b".repeat(64);
const fileHeader = (base = FILE_BASE) => `v1; source=file; base=${base}`;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">start</div>';
  coreMod = await import("../../src/core/save-core.js");
  saveMod = await import("../../src/core/save.js");
  snapMod = await import("../../src/core/snapshot.js");
  metaMod = await import("../../src/core/host-meta.js");
  etagMod = await import("../../src/core/etag.js");
  if (present) ({ parsePageConversion } = await import(pathToFileURL(path.join(HYPERCLAY, "page-conversion.js")).href));
  await flush();
});

beforeEach(async () => {
  installRouter();
  unsubs = [];
  metaMod.resetHostMeta();
  etagMod.forgetEtag();
  coreMod.resetSaveAttempts();
  await etagMod.seedEtag();
});

afterEach(() => {
  for (const off of unsubs) off();
  unsubs = [];
});

suite("capture-bound conversion metadata", () => {
  test("the host parser accepts the file form and the attempt hook sees the capture", async () => {
    const attempts = [];
    const outcomes = [];
    unsubs.push(coreMod.onSaveAttempt((a) => attempts.push(a)));
    unsubs.push(coreMod.onSaveOutcome((o) => outcomes.push(o)));

    const html = "<html><body>one</body></html>";
    const result = await coreMod.saveCapturedHtml(html, 11, undefined, { conversion: { source: "file", base: FILE_BASE } });

    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(1);
    expect(conversionOf(0)).toBe(fileHeader());
    expect(parsePageConversion(conversionOf(0))).toEqual({ source: "file", base: FILE_BASE, epoch: null });

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toEqual({ captureId: 11, saveId: headerOf(0, "Save-ID"), html, etag: "base-1" });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ captureId: 11, sent: true });
    expect(outcomes[0].attempts).toEqual([{ saveId: headerOf(0, "Save-ID"), etag: "base-1" }]);
  });

  test("the room form carries the epoch and round-trips through the host parser", async () => {
    const result = await coreMod.saveCapturedHtml("<html><body>room</body></html>", 12, undefined, {
      conversion: { source: "room", base: ROOM_BASE, epoch: "E-1" }
    });

    expect(result.ok).toBe(true);
    expect(conversionOf(0)).toBe(`v1; source=room; base=${ROOM_BASE}; epoch=E-1`);
    expect(parsePageConversion(conversionOf(0))).toEqual({ source: "room", base: ROOM_BASE, epoch: "E-1" });
  });

  test("savePage sends the capture id its snapshot announced", async () => {
    let announced = null;
    const listener = (event) => { announced = event.detail.captureId; };
    document.addEventListener("clay:snapshot-ready", listener);
    const attempts = [];
    unsubs.push(coreMod.onSaveAttempt((a) => attempts.push(a)));

    document.getElementById("c").textContent = "changed for the page save";
    await saveMod.savePage();
    document.removeEventListener("clay:snapshot-ready", listener);

    expect(attempts).toHaveLength(1);
    expect(attempts[0].captureId).toBe(announced);
    expect(conversionOf(0)).toBeUndefined();
  });

  test("a capture id is a monotone safe integer on clay:snapshot-ready", async () => {
    const seen = [];
    const listener = (event) => seen.push(event.detail.captureId);
    document.addEventListener("clay:snapshot-ready", listener);
    const first = snapMod.captureForSaveAndComparison();
    const second = snapMod.captureForSaveAndComparison();
    document.removeEventListener("clay:snapshot-ready", listener);

    expect(Number.isSafeInteger(first.captureId)).toBe(true);
    expect(Number.isSafeInteger(second.captureId)).toBe(true);
    expect(second.captureId).toBeGreaterThan(first.captureId);
    expect(seen).toEqual([first.captureId, second.captureId]);
  });

  test("every page-converting retry of one logical save carries the same header and id", async () => {
    const converting = () => ({
      status: 503,
      headers: { "Retry-After": "0" },
      body: { msg: "Converting the page.", msgType: "error", code: "page-converting", reason: "page-converting" }
    });
    responses.save = (n) => (n <= 3 ? converting() : { body: { msg: "Saved", etag: "stored-conv" } });

    const outcomes = [];
    unsubs.push(coreMod.onSaveOutcome((o) => outcomes.push(o)));

    const captureId = snapMod.captureForSaveAndComparison({ emitForSync: false }).captureId;
    const result = await coreMod.saveCapturedHtml("<html><body>convert</body></html>", captureId, undefined, {
      conversion: { source: "room", base: ROOM_BASE, epoch: "E-9" }
    });

    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(4);
    for (let i = 0; i < calls.save.length; i++) {
      expect(conversionOf(i)).toBe(`v1; source=room; base=${ROOM_BASE}; epoch=E-9`);
    }
    expect(new Set(savedIds()).size).toBe(1);
    // Four sends, but one id and one stamp: one actual attempt.
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].attempts).toEqual([{ saveId: headerOf(0, "Save-ID"), etag: "base-1" }]);
  });

  test("a late-own-412 recovery carries the header on both distinct ids", async () => {
    responses.save = (n, headers) =>
      n === 1
        ? { status: 412, body: { msg: "This document changed.", code: "conflict", saveId: headers["Save-ID"], etag: "peer-base" } }
        : { body: { msg: "Saved", etag: "stored-2" } };

    const outcomes = [];
    unsubs.push(coreMod.onSaveOutcome((o) => outcomes.push(o)));

    const result = await coreMod.saveCapturedHtml("<html><body>late</body></html>", 21, undefined, {
      conversion: { source: "file", base: FILE_BASE }
    });

    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(2);
    expect(conversionOf(0)).toBe(fileHeader());
    expect(conversionOf(1)).toBe(fileHeader());
    expect(savedIds()[1]).not.toBe(savedIds()[0]);
    expect(headerOf(1, "If-Match")).toBe("peer-base");
    expect(outcomes[0].attempts).toEqual([
      { saveId: savedIds()[0], etag: "base-1" },
      { saveId: savedIds()[1], etag: "peer-base" }
    ]);
  });

  test("a raw saveHtml carries no conversion header, and neither does the next one", async () => {
    await coreMod.saveCapturedHtml("<html><body>captured</body></html>", 30, undefined, {
      conversion: { source: "file", base: FILE_BASE }
    });
    await coreMod.saveHtml("<html><body>raw</body></html>");
    await coreMod.saveHtml("<html><body>raw again</body></html>");

    expect(conversionOf(0)).toBe(fileHeader());
    expect(conversionOf(1)).toBeUndefined();
    expect(conversionOf(2)).toBeUndefined();
  });

  test("a captured save with no conversion request is ordinary", async () => {
    await coreMod.saveCapturedHtml("<html><body>plain</body></html>", 31);
    expect(conversionOf(0)).toBeUndefined();
  });

  const INVALID = [
    ["an uppercase base", { source: "file", base: "A".repeat(64) }],
    ["a short base", { source: "file", base: "a".repeat(63) }],
    ["a non-hex base", { source: "file", base: "z".repeat(64) }],
    ["an epoch on a file source", { source: "file", base: FILE_BASE, epoch: "E-1" }],
    ["a room without an epoch", { source: "room", base: ROOM_BASE }],
    ["an empty room epoch", { source: "room", base: ROOM_BASE, epoch: "" }],
    ["an over-long room epoch", { source: "room", base: ROOM_BASE, epoch: "E".repeat(65) }],
    ["an unknown source", { source: "other", base: FILE_BASE }],
    ["a missing source", { base: FILE_BASE }],
    ["no fields at all", {}]
  ];

  test.each(INVALID)("%s is refused before any fetch", async (_label, conversion) => {
    const outcomes = [];
    unsubs.push(coreMod.onSaveOutcome((o) => outcomes.push(o)));

    const result = await coreMod.saveCapturedHtml("<html><body>bad</body></html>", 40, undefined, { conversion });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid-header");
    expect(result.msgType).toBe("error");
    expect(calls.save).toHaveLength(0);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ captureId: 40, sent: false });
    expect(outcomes[0].attempts).toEqual([]);
  });

  test("a skipped save does not lend its metadata to a later save", async () => {
    let release;
    responses.save = () => new Promise((resolve) => { release = resolve; });

    const first = coreMod.saveHtml("<html><body>holding the lane</body></html>");
    await flush();
    expect(calls.save).toHaveLength(1);

    const outcomes = [];
    unsubs.push(coreMod.onSaveOutcome((o) => outcomes.push(o)));
    const skipped = await coreMod.saveCapturedHtml("<html><body>skipped</body></html>", 50, undefined, {
      conversion: { source: "file", base: FILE_BASE }
    });

    expect(skipped.msgType).toBe("skipped");
    expect(calls.save).toHaveLength(1);
    expect(conversionOf(0)).toBeUndefined();
    expect(outcomes[0]).toMatchObject({ captureId: 50, sent: false });

    release({ body: { msg: "Saved", etag: "stored-first" } });
    await first;

    responses.save = () => ({ body: { msg: "Saved", etag: "stored-later" } });
    await coreMod.saveCapturedHtml("<html><body>later</body></html>", 51, undefined, {
      conversion: { source: "file", base: "c".repeat(64) }
    });
    expect(conversionOf(1)).toBe(fileHeader("c".repeat(64)));
  });

  const REFUSALS = [
    { label: "invalid-header", status: 400, code: "page-conversion-refused", reason: "invalid-header" },
    { label: "invalid-capture", status: 422, code: "page-conversion-refused", reason: "invalid-capture" },
    { label: "invalid-source", status: 409, code: "page-conversion-refused", reason: "invalid-source" },
    { label: "ambiguous-source", status: 409, code: "page-conversion-refused", reason: "ambiguous-source" },
    { label: "room-page-authority", status: 409, code: "page-conversion-refused", reason: "room-page-authority" },
    { label: "implicit-conversion", status: 409, code: "page-conversion-required", reason: "implicit-conversion" },
    { label: "source-changed", status: 409, code: "page-conversion-stale", reason: "source-changed" },
    { label: "room-changed", status: 409, code: "page-conversion-stale", reason: "room-changed" },
    { label: "room-required", status: 409, code: "page-conversion-stale", reason: "room-required" }
  ];

  test.each(REFUSALS)("$label reaches the caller with its reason and no retry", async (row) => {
    responses.save = () => ({
      status: row.status,
      body: { msg: `${row.code} refusal`, msgType: "error", code: row.code, reason: row.reason }
    });

    const result = await coreMod.saveCapturedHtml("<html><body>refused</body></html>", 60, undefined, {
      conversion: { source: "file", base: FILE_BASE }
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(row.code);
    expect(result.reason).toBe(row.reason);
    expect(result.hadTimeout).toBe(false);
    expect(calls.save).toHaveLength(1);
    expect(conversionOf(0)).toBe(fileHeader());
  });

  test("a converting refusal surfaces typed after its bounded retries", async () => {
    responses.save = () => ({
      status: 503,
      headers: { "Retry-After": "0" },
      body: { msg: "Converting the page.", msgType: "error", code: "page-converting", reason: "page-converting" }
    });

    const captureId = snapMod.captureForSaveAndComparison({ emitForSync: false }).captureId;
    const result = await coreMod.saveCapturedHtml("<html><body>never</body></html>", captureId, undefined, {
      conversion: { source: "file", base: FILE_BASE }
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("page-converting");
    expect(result.reason).toBe("page-converting");
    expect(calls.save).toHaveLength(4);
    for (let i = 0; i < calls.save.length; i++) expect(conversionOf(i)).toBe(fileHeader());
  });
});
