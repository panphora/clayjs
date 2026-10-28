/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/big.html"}
 */
import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";

/**
 * A large page's prepared save answers its own renderer's queued refresh.
 *
 * The source map queues a re-pair after an accepted save and after a peer frame, and the
 * save's own renderer runs that queued refresh before it lays the bytes out. The save
 * prepared against the pairing it found, so the refresh it ran itself is not a page that
 * moved under it: the render falls back to today's bytes when a re-pair really did
 * supersede it, and an accepted capture's candidate is rejected when it is stale. What
 * must not happen is the save cancelling itself and sending nothing.
 *
 * The task boundary here is the real one, and the page is over `SLICED_SAVE_MIN_BYTES`
 * with its own [onbeforesave] markup, which is the second of the two ways a queued
 * refresh is waiting when a prepared save starts.
 */

// Comfortably over the threshold once serialized.
const BIG = 320 * 1024;

const PAGE = (text) => [
  "<!DOCTYPE html>",
  "<html>",
  "  <head><title>Big</title></head>",
  `  <body><article id="filler">${"x".repeat(BIG)}</article><article id="c">${text}</article><div id="h" onbeforesave="void 0"></div></body>`,
  "</html>",
].join("\n");

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

jest.setTimeout(120000);

let save;
let plugin;
let posts = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setText = (text) => { document.getElementById("c").textContent = text; };
const lastPost = () => posts[posts.length - 1] ?? "";

function okJson(body) {
  return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body };
}

function installRouter() {
  posts = [];
  const source = PAGE("initial");
  global.fetch = jest.fn(async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/_/save")) {
      posts.push(String(options.body ?? ""));
      return okJson({ msg: "Saved", etag: `etag-${posts.length}` });
    }
    const headers = options.headers || {};
    if (headers["Clay-Source"]) {
      return {
        ok: true,
        status: 200,
        redirected: false,
        type: "basic",
        headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
        text: async () => source,
      };
    }
    return okJson({ spec: 1, document: { etag: "base-1" } });
  });
}

function seedDocument() {
  const parsed = new DOMParser().parseFromString(PAGE("initial"), "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

beforeAll(async () => {
  window.clayEditMode = true;
  seedDocument();
  installRouter();
  save = await import("../../src/core/save.js");
  plugin = await import("../../src/plugins/source.js");
  window.clay = { ...(window.clay || {}), source: plugin.source };
  // The save path renders through the map only once its session installed; this is the
  // page's own demand, and it is what makes a queued re-pair the save's own to run.
  await plugin.source.ready;
  expect(plugin.source.stats().installed).toBe(true);
  // The load-time settle is the page's own, not the person's.
  for (let i = 0; i < 100 && !save.baselineSettled(); i++) await sleep(50);
  expect(save.baselineSettled()).toBe(true);
  // The first saves of a page have no last saved size to judge, so they prepare in one
  // task. Two of them leave the document over the threshold for every test below.
  setText("first");
  expect((await save.savePage()).ok).toBe(true);
  // Let the refresh that save queued run, so the second save is a save against a settled
  // map rather than a second test of the first one.
  await sleep(300);
  setText("warm");
  expect((await save.savePage()).ok).toBe(true);
  await sleep(300);
  posts = [];
});

test("a save right after an accepted one is sent, not cancelled by its own queued refresh", async () => {
  setText("accepted-A");
  const a = await save.savePage();
  expect(a.ok).toBe(true);
  expect(lastPost()).toContain("accepted-A");

  setText("second-B");
  const sentBefore = posts.length;
  const b = await save.savePage();

  expect(b.msgType).not.toBe("skipped");
  expect(b.ok).toBe(true);
  expect(posts.length).toBe(sentBefore + 1);
  expect(lastPost()).toContain("second-B");
});

test("a save after a peer frame queued a re-pair is sent, not cancelled", async () => {
  // Settle the refresh the accepted save above queued: the only one waiting when the
  // next save starts is then the peer frame's.
  await sleep(300);

  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "peer", seq: 1 } }));
  setText("after-peer");
  const sentBefore = posts.length;
  const result = await save.savePage();

  expect(result.msgType).not.toBe("skipped");
  expect(result.ok).toBe(true);
  expect(posts.length).toBe(sentBefore + 1);
  expect(lastPost()).toContain("after-peer");
});
