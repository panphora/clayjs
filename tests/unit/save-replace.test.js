/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/board.html"}
 */
import { jest } from "@jest/globals";

/**
 * `clay.save.replace` (plan 05, Step 5): the one write the upgrade makes.
 *
 * It is a conditional save of bytes this page did not build, so what matters is that
 * exactly the bytes handed in go out, the stamp handed in goes out as `If-Match`, and
 * the answer comes back as one of four codes instead of the save lane's message
 * vocabulary. No capture, no snapshot, no retry, and no request at all on a host that
 * never promised to honour `If-Match`.
 *
 * Each test gets a fresh module registry: the capability flag and the stamp live in
 * module state, and one test's discovery must not answer for the next one's.
 */

const META_CONDITIONAL = { spec: 1, extensions: ["conditional"], document: { etag: "seed-1" } };
const HTML = '<!DOCTYPE html>\n<html><head><meta name="hyper-version" content="1.1.0"></head><body><p>new</p></body></html>';

let calls;
let metaBody;
let saveAnswer;

function respond(status, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status < 400,
    status,
    statusText: String(status),
    headers: { get: (name) => headers[name] ?? null },
    text: async () => text,
  };
}

function installRouter() {
  calls = { meta: [], save: [] };
  global.fetch = jest.fn(async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/_/meta")) {
      calls.meta.push({ target, options });
      if (!metaBody) return respond(404, "");
      return respond(200, metaBody);
    }
    calls.save.push({ target, options });
    const answer = typeof saveAnswer === "function" ? saveAnswer(calls.save.length) : saveAnswer;
    return respond(answer.status ?? 200, answer.body ?? { msg: "Saved" }, answer.headers);
  });
}

async function fresh() {
  jest.resetModules();
  installRouter();
  const etag = await import("../../src/core/etag.js");
  const core = await import("../../src/core/save-core.js");
  const replaceMod = await import("../../src/core/save-replace.js");
  return { etag, core, replace: replaceMod.replace };
}

beforeEach(() => {
  window.clayEditMode = true;
  window.clay = { canEdit: true, isDraftMode: false };
  metaBody = META_CONDITIONAL;
  saveAnswer = { status: 200, body: { msg: "Saved", etag: "stored-1" } };
  document.body.innerHTML = '<p id="c">old</p>';
});

test("one POST of exactly the bytes given, with the stamp given as If-Match", async () => {
  const { replace } = await fresh();

  const result = await replace(HTML, { etag: "stamp-before" });

  expect(result).toEqual({ ok: true, etag: "stored-1" });
  expect(calls.save).toHaveLength(1);
  const [sent] = calls.save;
  expect(sent.options.method).toBe("POST");
  expect(sent.options.body).toBe(HTML);
  expect(sent.options.headers["If-Match"]).toBe("stamp-before");
  expect(sent.options.headers["Document-URL"]).toBe(window.location.href);
});

test("without an etag argument it carries the stamp this tab holds", async () => {
  const { replace, etag } = await fresh();
  await etag.seedEtag();

  await replace(HTML);

  expect(calls.save[0].options.headers["If-Match"]).toBe("seed-1");
});

test("with no stamp anywhere it refuses as a conflict and sends nothing", async () => {
  metaBody = { spec: 1, extensions: ["conditional"] };
  const { replace } = await fresh();

  const result = await replace(HTML);

  expect(result).toEqual({ ok: false, code: "conflict" });
  expect(calls.save).toHaveLength(0);
});

test("the returned ETag becomes the tab's stamp", async () => {
  const { replace, etag } = await fresh();
  saveAnswer = { status: 200, body: { msg: "Saved", etag: "stored-2" } };

  await replace(HTML, { etag: "stamp-before" });

  expect(etag.lastSeenEtag()).toBe("stored-2");
});

test("each refusal maps to its own code, and nothing is recorded", async () => {
  const cases = [
    [412, "conflict"],
    [401, "forbidden"],
    [403, "forbidden"],
    [500, "failed"],
    [409, "failed"],
  ];
  for (const [status, code] of cases) {
    const { replace, etag } = await fresh();
    await etag.seedEtag();
    const before = etag.lastSeenEtag();
    saveAnswer = { status, body: { msg: "no" } };

    expect(await replace(HTML, { etag: "stamp-before" })).toEqual({ ok: false, code });
    expect(etag.lastSeenEtag()).toBe(before);
  }
});

test("a connection that fails is `failed`, and one request was still all it made", async () => {
  const { replace } = await fresh();
  saveAnswer = () => { throw new TypeError("Failed to fetch"); };

  expect(await replace(HTML, { etag: "stamp-before" })).toEqual({ ok: false, code: "failed" });
  expect(calls.save).toHaveLength(1);
});

test("a host that never announced conditional gets no request at all", async () => {
  const { replace } = await fresh();
  metaBody = { spec: 1, extensions: ["sync"], document: { etag: "seed-1" } };

  expect(await replace(HTML, { etag: "stamp-before" })).toEqual({ ok: false, code: "unsupported" });
  expect(calls.save).toHaveLength(0);
});

test("a host with no discovery at all gets no request either", async () => {
  const { replace } = await fresh();
  metaBody = null;

  expect(await replace(HTML, { etag: "stamp-before" })).toEqual({ ok: false, code: "unsupported" });
  expect(calls.save).toHaveLength(0);
});

test("no save hook and no snapshot run: the bytes go out exactly as given", async () => {
  const { replace, core } = await fresh();
  const attempts = [];
  const accepted = [];
  const snapshotReady = jest.fn();
  core.onSaveAttempt((attempt) => attempts.push(attempt));
  core.onSaveAccepted((html) => accepted.push(html));
  document.addEventListener("clay:snapshot-ready", snapshotReady);
  const page = document.getElementById("c").outerHTML;

  await replace(HTML, { etag: "stamp-before" });

  expect(attempts).toEqual([]);
  expect(accepted).toEqual([]);
  expect(snapshotReady).not.toHaveBeenCalled();
  // This page still holds what it held: the write went out, nothing was composed here.
  expect(document.body.innerHTML).toContain(page);
});

test("view mode with canEdit saves: an upgrade is not an editing gesture", async () => {
  window.clayEditMode = false;
  const { replace } = await fresh();
  window.clay = { canEdit: true, isDraftMode: false };

  const result = await replace(HTML, { etag: "stamp-before" });

  expect(result).toEqual({ ok: true, etag: "stored-1" });
  expect(calls.save).toHaveLength(1);
  expect(calls.save[0].options.body).toBe(HTML);
  expect(calls.save[0].options.headers["If-Match"]).toBe("stamp-before");
});
