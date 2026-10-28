/**
 * save-soon-first-prepare: the first save of a session that has to prepare across tasks
 * answers the `savePageSoon()` callers waiting on it.
 *
 * The preparer is loaded on demand, so the first big save of a session has to load it before
 * it can take its capture. Callers whose timer fired while an earlier save was on the wire
 * are waiting for the save that follows it, and that save is this one: if the callers are
 * taken before the module is asked for, the re-entry finds an empty list and they are never
 * answered.
 *
 * The request here is held on the wire so the soon() timer fires while it is there, and the
 * edit typed in that window is the one the callers are asking about.
 */

import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

jest.setTimeout(120000);

// Comfortably over the threshold once serialized: the saved bytes are the whole document,
// not just this text.
const BIG = 320 * 1024;

let save;
let posts = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setText = (text) => { document.getElementById("c").textContent = text; };
const lastPost = () => posts[posts.length - 1] ?? "";

const waitFor = async (check, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await sleep(10);
  }
};

function okJson(body) {
  return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body };
}

// One save request stays on the wire until the test lets it go, so the soon() timer can
// fire while the lane is busy.
let wire = null;
const holdWire = () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  wire = { held, release: () => release() };
  return wire;
};

function installRouter() {
  posts = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/_/save")) {
      posts.push(String(options.body ?? ""));
      const held = wire;
      if (held) {
        wire = null;
        await held.held;
      }
      return okJson({ msg: "Saved", etag: `etag-${posts.length}` });
    }
    return okJson({ spec: 1, document: { etag: "base-1" } });
  });
}

beforeAll(async () => {
  window.clayEditMode = true;
  // A document this big with one small edit inside it: the saved size stays over the
  // threshold, which is what decides the path, whatever the edit says.
  document.body.innerHTML = `<article id="filler">${"x".repeat(BIG)}</article><article id="c">initial</article>`;
  installRouter();
  // No save before the test below: the preparer is still unloaded, so this test's own save
  // is the one that has to load it.
  save = await import("../../src/core/save.js");
  for (let i = 0; i < 100 && !save.baselineSettled(); i++) await sleep(50);
  expect(save.baselineSettled()).toBe(true);
}, 60000);

test("a soon() caller queued behind the session's first save is answered by the prepared save that follows it", async () => {
  setText("first-save-on-wire");
  const sentBefore = posts.length;
  const held = holdWire();
  const first = save.savePage();
  await waitFor(() => posts.length === sentBefore + 1);
  expect(lastPost()).toContain("first-save-on-wire");

  // Typed while the first request is on the wire: the save that follows it is the one that
  // carries these bytes, and its result is the answer the caller below is owed.
  setText("latest-text");

  let answered = false;
  let answer = null;
  const soon = save.savePageSoon();
  soon.then((value) => { answered = true; answer = value; });

  // The timer fires while the request is still on the wire, so the caller is moved to the
  // save that goes out behind it rather than asking for one of its own.
  await sleep(400);
  expect(answered).toBe(false);

  held.release();
  expect((await first).ok).toBe(true);
  expect(posts).toHaveLength(sentBefore + 1);

  const outcome = await Promise.race([soon, sleep(20000).then(() => "timed-out")]);
  expect(outcome).not.toBe("timed-out");

  expect(answered).toBe(true);
  expect(answer).toMatchObject({ ok: true });
  expect(posts).toHaveLength(sentBefore + 2);
  expect(lastPost()).toContain("latest-text");
  expect(lastPost()).not.toContain("first-save-on-wire");
  expect(answer.etag).toBe(`etag-${sentBefore + 2}`);
  expect(save.getLastSavedContents()).toContain("latest-text");
});
