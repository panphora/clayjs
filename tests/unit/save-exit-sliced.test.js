/**
 * save-exit-sliced: a large page's exit checkpoint keeps its permit.
 *
 * Above `SLICED_SAVE_MIN_BYTES` a save prepares across tasks, and a preparing job is
 * cancelled by a closed session. The exit's own checkpoint is the one write that closed
 * session still admits, so the permit the barrier minted has to travel with the call:
 * through a preparer that is not loaded yet, and into the sliced job it starts.
 *
 * Both handoffs are covered. The page here is the live page source, whose exit checkpoint
 * is the slot `exitSave` holds, and the leave is the real barrier. The first exit is the
 * page's second save, so the preparer is still unloaded and the call has to re-enter with
 * its permit; the second exit takes the loaded path.
 */

import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

jest.setTimeout(120000);

const BIG = 320 * 1024;

let save, saveCore, unsaved, transition;
let posts = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setText = (text) => { document.getElementById("c").textContent = text; };

function okJson(body) {
  return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body };
}

function installRouter() {
  posts = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/_/save")) {
      posts.push(String(options.body ?? ""));
      return okJson({ msg: "Saved", etag: `etag-${posts.length}` });
    }
    return okJson({ spec: 1, document: { etag: "base-1" } });
  });
}

// One leave of a page that has closed its session: the page source's own flush is the
// exit checkpoint, and the barrier is the only writer a closed session admits.
async function leave() {
  const session = save.saveSession();
  session.start();
  const typed = document.getElementById("c").textContent;
  session.quiesce();
  expect(save.savesAdmitted()).toBe(false);
  expect((await save.savePageForce()).msgType).toBe("skipped");
  expect(posts.length).toBe(0);

  let pending = true;
  const seen = [];
  const handle = unsaved.registerUnsavedState({
    id: "page:live",
    isPending: () => pending,
    flush: async (context) => {
      seen.push(context.permit);
      const result = await saveCore.exitSave()(context.permit);
      pending = false;
      return { ok: result?.ok === true };
    },
  });
  try {
    const left = await transition.runSaveBarrier();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeTruthy();
    expect(left).toMatchObject({ ok: true });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain(typed);
  } finally {
    handle.dispose();
    session.stop();
  }
}

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  document.body.innerHTML = `<article id="filler">${"x".repeat(BIG)}</article><article id="c">initial</article>`;
  installRouter();
  save = await import("../../src/core/save.js");
  saveCore = await import("../../src/core/save-core.js");
  unsaved = await import("../../src/lib/unsaved-state.js");
  transition = await import("../../src/core/mode-transition.js");
  for (let i = 0; i < 100 && !save.baselineSettled(); i++) await sleep(50);
  expect(save.baselineSettled()).toBe(true);
  // The page's first save: no last saved size to judge yet, so it prepares in one task and
  // leaves the preparer unloaded for the first exit below.
  setText("first");
  expect((await save.savePage()).ok).toBe(true);
  posts = [];
}, 60000);

test("a large page's exit keeps its permit through a preparer that is still loading", async () => {
  setText("the exit's own edit");
  await leave();
});

test("a large page's exit keeps its permit into the sliced job it starts", async () => {
  setText("after the first exit");
  expect((await save.savePage()).ok).toBe(true);
  posts = [];
  setText("a later exit's own edit");
  await leave();
});
