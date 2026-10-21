/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/page.html"}
 */
import { jest } from "@jest/globals";

// The capture-bound save hooks. A lost response can only be resolved by proving
// that ONE identified attempt happened, so the interface has to say exactly which
// body left, under which capture, on which of its actual sends, and once per
// logical save. These tests drive it through the real save lane.

let coreMod, saveMod, metaMod, etagMod;
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

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">start</div>';
  coreMod = await import("../../src/core/save-core.js");
  saveMod = await import("../../src/core/save.js");
  metaMod = await import("../../src/core/host-meta.js");
  etagMod = await import("../../src/core/etag.js");
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
  delete window.clay?.testMode;
});

describe("capture-bound save hooks", () => {
  test("the attempt hook runs synchronously before the fetch with the exact body", async () => {
    const seenAtHook = [];
    const attempts = [];
    unsubs.push(coreMod.onSaveAttempt((attempt) => {
      seenAtHook.push(calls.save.length);
      attempts.push(attempt);
    }));

    const html = "<html><body>the exact body</body></html>";
    const result = await coreMod.saveHtml(html);

    expect(result.ok).toBe(true);
    // The hook ran before any request existed.
    expect(seenAtHook).toEqual([0]);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].html).toBe(html);
    expect(attempts[0].html).toBe(calls.save[0].options.body);
    expect(attempts[0].saveId).toBe(headerOf(0, "Save-ID"));
    expect(attempts[0].etag).toBe(headerOf(0, "If-Match") ?? null);
    expect(attempts[0].captureId).toBeNull();
  });

  test("a bound capture is reported on both hooks, and a raw save is unbound", async () => {
    let announced = null;
    const onReady = (event) => { announced = event.detail.captureId; };
    document.addEventListener("clay:snapshot-ready", onReady);

    const attempts = [];
    const outcomes = [];
    unsubs.push(coreMod.onSaveAttempt((a) => attempts.push(a)));
    unsubs.push(coreMod.onSaveOutcome((o) => outcomes.push(o)));

    document.getElementById("c").textContent = "bound";
    await saveMod.savePage();
    document.removeEventListener("clay:snapshot-ready", onReady);

    expect(attempts[0].captureId).toBe(announced);
    expect(outcomes[0].captureId).toBe(announced);
    expect(outcomes[0].sent).toBe(true);

    await coreMod.saveHtml("<html><body>raw</body></html>");
    expect(attempts[1].captureId).toBeNull();
    expect(outcomes[1].captureId).toBeNull();
  });

  test("the accepted hook carries the capture beside the html and stays one-argument safe", async () => {
    const seen = [];
    coreMod.onSaveAccepted((html, context) => seen.push({ html, context }));
    coreMod.onSaveAccepted((html) => seen.push({ html, context: null }));

    await coreMod.saveCapturedHtml("<html><body>accepted</body></html>", 7);
    expect(seen).toHaveLength(2);
    expect(seen[0].context.captureId).toBe(7);
    expect(seen[0].html).toContain("accepted");
    // The one-argument listener is not handed anything it must understand.
    expect(seen[1].html).toContain("accepted");
  });

  test("the outcome runs after accepted and before the caller callback and DOM event", async () => {
    const order = [];
    coreMod.onSaveAccepted(() => order.push("accepted"));
    unsubs.push(coreMod.onSaveOutcome(() => order.push("outcome")));
    const onSaved = () => order.push("dom");
    document.addEventListener("clay:save-saved", onSaved);

    document.getElementById("c").textContent = "ordering";
    await saveMod.savePage(() => order.push("callback"));
    document.removeEventListener("clay:save-saved", onSaved);

    expect(order).toEqual(["accepted", "outcome", "dom", "callback"]);
  });

  test("every real send notifies, while the outcome lists unique attempts", async () => {
    const sent = [];
    const outcomes = [];
    unsubs.push(coreMod.onSaveAttempt((a) => sent.push(`${a.saveId}:${a.etag}`)));
    unsubs.push(coreMod.onSaveOutcome((o) => outcomes.push(o)));

    responses.save = (n) =>
      n <= 3
        ? { status: 503, headers: { "Retry-After": "0" }, body: { msg: "Converting.", code: "page-converting", reason: "page-converting" } }
        : { body: { msg: "Saved", etag: "stored-retry" } };

    const result = await coreMod.saveHtml("<html><body>retry</body></html>");

    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(4);
    expect(new Set(sent).size).toBe(1);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].attempts).toEqual([{ saveId: headerOf(0, "Save-ID"), etag: "base-1" }]);
    expect(outcomes[0].sent).toBe(true);
  });

  test("a second id from late-own-412 recovery is a second attempt on one capture", async () => {
    responses.save = (n, headers) =>
      n === 1
        ? { status: 412, body: { msg: "This document changed.", code: "conflict", saveId: headers["Save-ID"], etag: "peer-base" } }
        : { body: { msg: "Saved", etag: "stored-2" } };

    const outcomes = [];
    unsubs.push(coreMod.onSaveOutcome((o) => outcomes.push(o)));
    const result = await coreMod.saveCapturedHtml("<html><body>late</body></html>", 9);

    expect(result.ok).toBe(true);
    expect(outcomes[0].captureId).toBe(9);
    expect(outcomes[0].attempts).toHaveLength(2);
    expect(outcomes[0].attempts[0].saveId).not.toBe(outcomes[0].attempts[1].saveId);
    expect(coreMod.saveFateIsUnknown()).toBe(false);
  });

  test("an early skip settles with sent:false and no attempts", async () => {
    const outcomes = [];
    unsubs.push(coreMod.onSaveOutcome((o) => outcomes.push(o)));

    let release;
    responses.save = () => new Promise((resolve) => { release = resolve; });
    const first = coreMod.saveHtml("<html><body>holding</body></html>");
    await flush();

    const second = await coreMod.saveHtml("<html><body>skipped</body></html>");
    expect(second.msgType).toBe("skipped");
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ captureId: null, sent: false });
    expect(outcomes[0].attempts).toEqual([]);

    release({ body: { msg: "Saved", etag: "stored-first" } });
    await first;
  });

  test("test mode settles with sent:false", async () => {
    window.clay = { ...(window.clay || {}), testMode: true };
    const outcomes = [];
    unsubs.push(coreMod.onSaveOutcome((o) => outcomes.push(o)));

    const result = await coreMod.saveHtml("<html><body>test mode</body></html>");
    expect(result.ok).toBe(true);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].sent).toBe(false);
    expect(outcomes[0].attempts).toEqual([]);
    expect(calls.save).toHaveLength(0);
  });

  test("a throwing observer cannot change the result", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    unsubs.push(coreMod.onSaveAttempt(() => { throw new Error("attempt observer boom"); }));
    unsubs.push(coreMod.onSaveOutcome(() => { throw new Error("outcome observer boom"); }));

    const result = await coreMod.saveHtml("<html><body>observer</body></html>");
    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(1);
    expect(error).toHaveBeenCalledWith("clayjs: onSaveAttempt hook failed:", expect.any(Error));
    expect(error).toHaveBeenCalledWith("clayjs: onSaveOutcome hook failed:", expect.any(Error));
    error.mockRestore();
  });

  test("unsubscribing stops delivery without touching the save", async () => {
    let attempts = 0;
    let outcomes = 0;
    const offAttempt = coreMod.onSaveAttempt(() => { attempts += 1; });
    const offOutcome = coreMod.onSaveOutcome(() => { outcomes += 1; });

    const first = await coreMod.saveHtml("<html><body>one</body></html>");
    offAttempt();
    offOutcome();
    const second = await coreMod.saveHtml("<html><body>two</body></html>");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(attempts).toBe(1);
    expect(outcomes).toBe(1);
  });
});
