/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

// `querySaveOutcome` asks the host about one identified save. It must be a request
// of its own, it must never reject, and it must only ever accept an answer that
// still advertises the capability and echoes the exact identity it asked about.
// A wrong or absent answer is null, never "not applied".

let queryMod, metaMod, etagMod;
let calls;
let responses;

const SAVE_ID = "attempt-1";
const HASH = "a".repeat(64);

function installRouter() {
  calls = { meta: [], query: [] };
  responses = {
    meta: { spec: 1, extensions: ["conditional", "save-history"], document: { etag: "base-1" } },
    query: (n, headers) => ({
      body: {
        spec: 1,
        extensions: ["save-history"],
        document: { saveOutcome: { saveId: headers["Save-ID"], requestHash: headers["Save-Request-Hash"], status: "applied" } }
      }
    })
  };
  global.fetch = jest.fn(async (url, options) => {
    const target = String(url);
    const headers = options?.headers || {};
    if (headers["Save-ID"]) {
      calls.query.push({ url: target, options });
      const answer = await responses.query(calls.query.length, headers, options);
      if (answer.abort) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      if (answer.throw) throw new Error("network down");
      const status = answer.status ?? 200;
      return {
        ok: status < 400,
        status,
        statusText: "",
        text: async () => (answer.text !== undefined ? answer.text : JSON.stringify(answer.body ?? {}))
      };
    }
    calls.meta.push({ url: target, options });
    const meta = typeof responses.meta === "function" ? await responses.meta() : responses.meta;
    return { ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(meta) };
  });
}

const hang = (n, headers, options) =>
  new Promise((resolve, reject) => {
    const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    if (options.signal.aborted) fail();
    else options.signal.addEventListener("abort", fail);
  });

beforeAll(async () => {
  metaMod = await import("../../src/core/host-meta.js");
  queryMod = metaMod;
  etagMod = await import("../../src/core/etag.js");
});

beforeEach(async () => {
  installRouter();
  metaMod.resetHostMeta();
  etagMod.forgetEtag();
  await etagMod.seedEtag();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("querySaveOutcome", () => {
  test("uses the discovery URL, token rules and private request behavior", async () => {
    etagMod.recordEtag("base-1");
    const before = etagMod.lastSeenEtag();

    const outcome = await queryMod.querySaveOutcome({ saveId: SAVE_ID, requestHash: HASH });

    expect(outcome).toEqual({ saveId: SAVE_ID, requestHash: HASH, status: "applied" });
    expect(calls.query).toHaveLength(1);
    const [target, options] = [calls.query[0].url, calls.query[0].options];
    expect(target).toBe(new URL("/_/meta", window.location.origin).href);
    expect(options.method).toBe("GET");
    expect(options.headers["Save-ID"]).toBe(SAVE_ID);
    expect(options.headers["Save-Request-Hash"]).toBe(HASH);
    expect(options.headers["Document-URL"]).toBe(window.location.href);
    expect(options.credentials).toBe("same-origin");
    expect(options.cache).toBe("no-store");
    expect(options.redirect).toBe("manual");
    // This is a question, not a discovery: it must not move the stamp.
    expect(etagMod.lastSeenEtag()).toBe(before);
  });

  test("an unknown status is carried through, not guessed", async () => {
    responses.query = () => ({
      body: {
        spec: 1,
        extensions: ["save-history"],
        document: { saveOutcome: { saveId: SAVE_ID, requestHash: HASH, status: "unknown" } }
      }
    });
    const outcome = await queryMod.querySaveOutcome({ saveId: SAVE_ID, requestHash: HASH });
    expect(outcome).toEqual({ saveId: SAVE_ID, requestHash: HASH, status: "unknown" });
  });

  test("the cached discovery document is not replaced by the query's answer", async () => {
    responses.query = () => ({
      body: {
        spec: 2,
        extensions: ["save-history", "something-new"],
        document: { etag: "a-different-stamp", saveOutcome: { saveId: SAVE_ID, requestHash: HASH, status: "applied" } }
      }
    });
    await queryMod.querySaveOutcome({ saveId: SAVE_ID, requestHash: HASH });

    const meta = await metaMod.hostMeta();
    expect(meta.spec).toBe(1);
    expect(meta.extensions).toEqual(["conditional", "save-history"]);
    expect(meta.document.etag).toBe("base-1");
    expect(etagMod.lastSeenEtag()).toBe("base-1");
  });

  test("no request is made when save-history is not advertised", async () => {
    responses.meta = { spec: 1, extensions: ["conditional"], document: { etag: "base-1" } };
    metaMod.resetHostMeta();

    const outcome = await queryMod.querySaveOutcome({ saveId: SAVE_ID, requestHash: HASH });
    expect(outcome).toBeNull();
    expect(calls.query).toHaveLength(0);
  });

  test("two concurrent queries are independent", async () => {
    const [first, second] = await Promise.all([
      queryMod.querySaveOutcome({ saveId: "one", requestHash: "1".repeat(64) }),
      queryMod.querySaveOutcome({ saveId: "two", requestHash: "2".repeat(64) })
    ]);

    expect(first).toEqual({ saveId: "one", requestHash: "1".repeat(64), status: "applied" });
    expect(second).toEqual({ saveId: "two", requestHash: "2".repeat(64), status: "applied" });
    expect(calls.query).toHaveLength(2);
    expect(calls.query[0].options.headers["Save-ID"]).toBe("one");
    expect(calls.query[1].options.headers["Save-ID"]).toBe("two");
  });

  const BAD = [
    ["a 404", () => ({ status: 404 })],
    ["a 401", () => ({ status: 401 })],
    ["a 403", () => ({ status: 403 })],
    ["a 400", () => ({ status: 400 })],
    ["malformed JSON", () => ({ text: "not json" })],
    ["a non-spec body", () => ({ body: { extensions: ["save-history"] } })],
    ["a body without the capability", () => ({ body: { spec: 1, extensions: [], document: { saveOutcome: { saveId: SAVE_ID, requestHash: HASH, status: "applied" } } } })],
    ["a missing outcome", () => ({ body: { spec: 1, extensions: ["save-history"], document: {} } })],
    ["a different id", () => ({ body: { spec: 1, extensions: ["save-history"], document: { saveOutcome: { saveId: "someone-else", requestHash: HASH, status: "applied" } } } })],
    ["a different hash", () => ({ body: { spec: 1, extensions: ["save-history"], document: { saveOutcome: { saveId: SAVE_ID, requestHash: "b".repeat(64), status: "applied" } } } })],
    ["a status that is neither applied nor unknown", () => ({ body: { spec: 1, extensions: ["save-history"], document: { saveOutcome: { saveId: SAVE_ID, requestHash: HASH, status: "not-applied" } } } })]
  ];

  test.each(BAD)("%s yields null, never not-applied", async (_label, make) => {
    responses.query = () => make();
    await expect(queryMod.querySaveOutcome({ saveId: SAVE_ID, requestHash: HASH })).resolves.toBeNull();
  });

  test("a transport failure yields null instead of rejecting", async () => {
    responses.query = () => ({ throw: true });
    await expect(queryMod.querySaveOutcome({ saveId: SAVE_ID, requestHash: HASH })).resolves.toBeNull();
  });

  test("an aborted fetch yields null instead of rejecting", async () => {
    responses.query = hang;
    const controller = new AbortController();
    const pending = queryMod.querySaveOutcome({ saveId: SAVE_ID, requestHash: HASH, signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toBeNull();
  });

  test("a caller's aborted signal answers before any request", async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await queryMod.querySaveOutcome({ saveId: SAVE_ID, requestHash: HASH, signal: controller.signal });
    expect(outcome).toBeNull();
    expect(calls.query).toHaveLength(0);
  });

  test("an abort during discovery never sends the historical query", async () => {
    let answer;
    responses.meta = () => new Promise((resolve) => { answer = resolve; });
    metaMod.resetHostMeta();
    const controller = new AbortController();
    const pending = queryMod.querySaveOutcome({ saveId: SAVE_ID, requestHash: HASH, signal: controller.signal });

    controller.abort();
    answer({ spec: 1, extensions: ["save-history"], document: { etag: "base-1" } });

    await expect(pending).resolves.toBeNull();
    expect(calls.query).toHaveLength(0);
  });

  test("the query gives up after six seconds and never rejects", async () => {
    jest.useFakeTimers();
    responses.query = hang;
    const pending = queryMod.querySaveOutcome({ saveId: SAVE_ID, requestHash: HASH });
    await jest.advanceTimersByTimeAsync(5999);
    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeNull();
  });

  test("missing arguments are refused without a request", async () => {
    await expect(queryMod.querySaveOutcome({})).resolves.toBeNull();
    await expect(queryMod.querySaveOutcome({ saveId: SAVE_ID })).resolves.toBeNull();
    await expect(queryMod.querySaveOutcome({ requestHash: HASH })).resolves.toBeNull();
    await expect(queryMod.querySaveOutcome()).resolves.toBeNull();
    expect(calls.query).toHaveLength(0);
  });
});
