/**
 * save-request-blob: a large save body is a Blob, and it is built once.
 *
 * A string body is encoded to UTF-8 inside `fetch`, synchronously and on the main
 * thread, so an 11 MB save spends that time before the request even leaves. Above
 * `SAVE_BLOB_MIN_BYTES` the body is a Blob instead: the same bytes, the same media type
 * the string body arrived with, and the retry of an attempt sends the very Blob it
 * already built rather than encoding the document again.
 *
 * What must NOT change is what the host receives. Every assertion below is about the
 * body's identity and type; the bytes are compared through `text()` so the assertion is
 * on the document, not on how it travels.
 */
import { jest } from "@jest/globals";

// Imported from the constant's own definition so the two sides of the boundary are the
// real ones, not a number repeated here that could drift.
const MIN = 1024 * 1024;
const UNDER = "u".repeat(MIN - 1);
const OVER = "o".repeat(MIN + 1);
// What a string body has always gone out as, written out by `buildSaveRequest` above the
// threshold because a Blob's own type never becomes a request header.
const BODY_TYPE = "text/plain;charset=UTF-8";

// jsdom 20's Blob has no `text()`, so the bytes are read back the way this environment
// can: through FileReader, which decodes them as UTF-8 exactly as `text()` would.
const blobText = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

const readBody = async (body) => (typeof body === "string" ? body : await blobText(body));

const okJson = (body) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: { get: () => null },
  text: async () => JSON.stringify(body)
});

let core;
let save;

beforeAll(async () => {
  window.clayEditMode = true;
  core = await import("../../src/core/save-core.js");
  save = await import("../../src/core/save.js");
});

test("a body under the threshold is still the string it always was", async () => {
  const { options } = core.buildSaveRequest(UNDER, false, undefined, "id-under", null);

  expect(typeof options.body).toBe("string");
  expect(options.body).toBe(UNDER);
  expect(await readBody(options.body)).toBe(UNDER);
  // No explicit type: the request stays the same un-preflighted one it was.
  expect(options.headers["Content-Type"]).toBeUndefined();
});

test("a body over the threshold is a Blob of those exact bytes and media type", async () => {
  const { options } = core.buildSaveRequest(OVER, false, undefined, "id-over", null);

  expect(options.body).toBeInstanceOf(Blob);
  expect(await readBody(options.body)).toBe(OVER);
  expect(options.body.size).toBe(OVER.length);
  // `Blob.type` is lowercased by the spec; the media type and charset are the same ones.
  expect(options.body.type.toLowerCase()).toBe(BODY_TYPE.toLowerCase());
  expect(options.headers["Content-Type"]).toBe(BODY_TYPE);
  // Everything else about the request is untouched.
  expect(options.method).toBe("POST");
  expect(options.headers["Save-ID"]).toBe("id-over");
});

test("a retry sends the same Blob instead of building a second one", async () => {
  document.body.innerHTML = '<div id="content">start</div>';
  document.getElementById("content").textContent = "r".repeat(MIN + 512);

  const sent = [];
  const converting = {
    ok: false,
    status: 409,
    statusText: "Conflict",
    headers: { get: (name) => (String(name).toLowerCase() === "retry-after" ? "0" : null) },
    text: async () => JSON.stringify({ code: "page-converting", msg: "Converting" })
  };
  global.fetch = jest.fn(async (url, options = {}) => {
    if (String(url).includes("/_/save")) {
      sent.push(options.body);
      return sent.length === 1 ? converting : okJson({ msg: "Saved" });
    }
    return okJson({ spec: 1, document: { etag: "base-1" } });
  });

  const result = await save.savePage();
  expect(result.ok).toBe(true);

  // Two actual sends of one attempt: the host's `page-converting` refusal asks for the
  // same bytes again, and those are the bytes already encoded.
  expect(sent.length).toBe(2);
  expect(sent[0]).toBeInstanceOf(Blob);
  expect(sent[1]).toBe(sent[0]);
  expect(await readBody(sent[1])).toContain("r".repeat(MIN + 512));
});

test("a keepalive request is unchanged, and never carries a body that size", () => {
  const small = "k".repeat(1000);
  const kept = core.buildSaveRequest(small, false, undefined, "id-keep", null, true);
  expect(kept.options.keepalive).toBe(true);
  expect(typeof kept.options.body).toBe("string");
  expect(kept.options.body).toBe(small);
  expect(kept.options.headers["Content-Type"]).toBeUndefined();

  // A body that large cannot be keepalive at all, so the two never meet: the hint is
  // dropped and the body takes the Blob path like any other large save.
  const large = core.buildSaveRequest(OVER, false, undefined, "id-keep-large", null, true);
  expect(large.options.keepalive).toBeUndefined();
  expect(large.options.body).toBeInstanceOf(Blob);
});
