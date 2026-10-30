/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { webcrypto } from "node:crypto";
import { jest } from "@jest/globals";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import * as realRecoveryUi from "../../../src/page/recovery-ui.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";

const recoveryRoots = () => [...document.querySelectorAll('clay-editor-ui[data-clay-ui="page-recovery"]')].map((host) => host.shadowRoot);
const rq = (selector) => recoveryRoots().map((root) => root.querySelector(selector)).find(Boolean) ?? null;
const rqa = (selector) => recoveryRoots().flatMap((root) => [...root.querySelectorAll(selector)]);
const recoveryHosts = () => document.querySelectorAll('clay-editor-ui[data-clay-ui="page-recovery"]');

/**
 * Step 6b: the review a page draws for work its journal may not replay, and the
 * composition shadow, reach the person through the page plugin's own boot. A session
 * with a journal gets one review, drawn in the editor's chrome; a session with nothing
 * to review draws nothing visible; a reader loads none of it; and the review goes with
 * the session that mounted it, listeners included.
 */

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });

const BLOCKS = [
  { id: "h", t: "heading", text: "Notes" },
  { id: "p", t: "paragraph", text: "Hello" },
];
const TAG_SEL = 'script[type="application/json"][merge="page"][clay~="live"]';

const clone = (v) => JSON.parse(JSON.stringify(v));
const flushAsync = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const until = async (done, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  return done();
};

const pageHtml = (value = seedValue(BLOCKS)) => {
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const tagHtml = (value) =>
  `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;

// The update a page value decodes to, which is what a capsule carries as its work.
const updateOf = (value) => {
  const doc = new Y.Doc();
  try {
    Y.applyUpdateV2(doc, Y.mergeUpdatesV2(Object.values(value.y).map((part) => Y.fromBase64(part))));
    return Y.encodeStateAsUpdateV2(doc);
  } finally {
    doc.destroy();
  }
};

// A capsule this page may not replay: another document's, carrying real page bytes, so
// the review has text of its own to show.
const foreignCapsule = ({ text = "another page's words" } = {}) => ({
  id: "capsule:other:w-9",
  kind: "binary",
  channel: "page.yjs",
  version: 1,
  writerId: "w-9",
  revision: 0,
  context: {
    authority: { host: "https://example.com", documentId: "another-document", principalId: "acct-9" },
    lineage: { generation: "other", baseDigest: "other", baseVector: new Uint8Array(0) },
    formatFloor: 0,
  },
  payload: {
    base: new Uint8Array(0),
    dependencies: new Uint8Array(0),
    owned: updateOf(seedValue([{ id: "q", text }])),
  },
});

// One recovery service, as much of it as the page plugin touches: the records each
// channel lists, the text a composition stages, and the receipts a journal is given.
function fakeRecovery(records = []) {
  let seq = 0;
  const staged = [];
  const service = {
    register({ channel, version = 1 } = {}) {
      return {
        channel,
        version,
        async stage({ key, kind = "text", payload = null } = {}) {
          const record = {
            id: [channel, String(key), "w-9"], kind, channel, version,
            writerId: "w-9", key: String(key), revision: ++seq, payload,
          };
          records.push(record);
          staged.push(record);
          return { id: record.id, revision: record.revision };
        },
        async list() {
          return {
            ok: true,
            records: records
              .filter((record) => record.channel === channel)
              .map((record) => ({ ...record, supported: record.version === version })),
          };
        },
        async dismiss(id) {
          const at = records.findIndex((record) => JSON.stringify(record.id) === JSON.stringify(id));
          if (at >= 0) records.splice(at, 1);
          return { ok: true };
        },
        async append() {
          const revision = ++seq;
          return { ok: true, id: `batch-${revision}`, revision };
        },
        async compact({ records: named = [] } = {}) {
          return { ok: true, retired: named };
        },
        async checkpoint({ records: named = [] } = {}) {
          return { ok: true, retired: named };
        },
        async markAcknowledged() {
          return { ok: true, acknowledged: 0 };
        },
        async flush() {
          return { ok: true };
        },
        subscribe() {
          return () => {};
        },
      };
    },
  };
  return { service, records, staged };
}

let current = null;

async function load({ html = pageHtml(), head = tagHtml(seedValue(BLOCKS)), editMode = true, records = [] } = {}) {
  jest.resetModules();
  window.clayEditMode = editMode;
  document.documentElement.removeAttribute("documentetag");
  document.head.innerHTML = head;
  document.body.innerHTML = html;

  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, stores: {} };
  const requested = [];

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions: ["page"], document: { etag: "stamp-1" } }),
    hostSupports: async (name) => name === "page",
    hostMetaOutcome: () => "ok",
    querySaveOutcome: () => null,
    resetHostMeta: () => ({}),
  }));

  await jest.unstable_mockModule("../../../src/live/local-lane.js", () => ({
    localLaneSupported: () => false,
    localTransport: () => ({}),
  }));

  await jest.unstable_mockModule("../../../src/live/server-lane.js", () => ({
    serverTransport: () => ({
      start(handlers) {
        handlersRef.h = handlers;
        handlers.open({ clientId: "tab-1", lane: "live" });
        handlers.state({ epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0, stores: clone(room.stores) });
        return () => {};
      },
      async send(clientId, frame) {
        room.seq += 1;
        if (room.writer === null) room.writer = clientId;
        handlersRef.h?.writer({ epoch: room.epoch, writer: room.writer, landed: null });
        return { status: 200, body: { seq: room.seq, epoch: room.epoch } };
      },
      async fetchState() {
        return { epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0, stores: clone(room.stores) };
      },
    }),
  }));

  // The review is the real one; the factory is where a request for it is seen.
  await jest.unstable_mockModule("../../../src/page/recovery-ui.js", () => {
    requested.push("recovery-ui");
    return realRecoveryUi;
  });

  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "",
    headers: { get: () => null },
    text: async () => "{}",
  }));

  const recovery = fakeRecovery(records);
  const { live, storeOf } = await import("../../../src/plugins/live.js");
  window.clay = { live, recovery: recovery.service };
  const { page } = await import("../../../src/plugins/page.js");
  current = page;
  return { page, storeOf, requested, ...recovery };
}

afterEach(() => {
  try { current?.dispose(); } catch {}
  current = null;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const reviewButton = () => rq(".page-recovery");

test("a capsule this page may not replay is shown as a review after boot", async () => {
  const capsule = foreignCapsule();
  const { page, requested } = await load({ records: [capsule] });

  await page.ready;
  await flushAsync();
  await until(() => reviewButton()?.hidden === false);

  expect(requested).toEqual(["recovery-ui"]);
  const button = reviewButton();
  expect(button).toBeTruthy();
  expect(button.hidden).toBe(false);
  expect(button.textContent).toBe("Recover work (1)");
  // Drawn inside the editor's own chrome, so it never reaches the saved file.
  expect(button.closest('[clay="editor-ui"]')).toBeTruthy();

  button.click();
  expect(rq(".page-recovery-panel").hidden).toBe(false);
  expect(rq(".page-recovery-panel").textContent).toContain("another page's words");
  // Nothing of it was applied to the page.
  expect(page.view.state.doc.textContent).toContain("Hello");
  expect(page.view.state.doc.textContent).not.toContain("another page's words");
});

test("a journal with nothing to review draws no review", async () => {
  const { page, requested } = await load({ records: [] });

  await page.ready;
  await flushAsync();

  // The journal is open, so the review's module is here; what it drew is hidden.
  expect(requested).toEqual(["recovery-ui"]);
  expect(reviewButton()).toBeTruthy();
  expect(reviewButton().hidden).toBe(true);
  expect(rq(".page-recovery-panel").hidden).toBe(true);
});

test("view mode asks for no recovery module and draws no review", async () => {
  const { requested } = await load({ editMode: false, records: [foreignCapsule()] });

  await flushAsync();

  expect(requested).toEqual([]);
  expect(reviewButton()).toBe(null);
  expect(recoveryHosts()).toHaveLength(0);
});

test("mode exit removes the review and its listeners", async () => {
  const { page, staged } = await load({ records: [foreignCapsule()] });
  await page.ready;
  await flushAsync();
  await until(() => reviewButton()?.hidden === false);

  const surface = page.view.dom;
  const block = surface.querySelector('[data-id="p"]');
  expect(block).toBeTruthy();

  page.dispose();
  await flushAsync();

  expect(reviewButton()).toBe(null);
  expect(rq(".page-recovery-panel")).toBe(null);
  expect(recoveryHosts()).toHaveLength(0);

  // The composition listeners went with it: a composition on the old surface stages
  // nothing.
  block.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  block.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true }));
  await flushAsync();
  expect(staged).toEqual([]);
});

test("a composition in edit mode reaches the shadow", async () => {
  const { page, staged } = await load({ records: [] });
  await page.ready;
  await flushAsync();

  const block = page.view.dom.querySelector('[data-id="p"]');
  expect(block).toBeTruthy();
  block.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  block.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true }));
  await flushAsync();

  // The visible text of the block being composed is staged as text, on the composition
  // channel, and no composition turned into a transaction.
  const kept = staged.filter((record) => record.channel === "page.ime");
  expect(kept.length).toBeGreaterThan(0);
  expect(kept.at(-1).payload).toEqual({ blockId: "p", text: "Hello" });
  expect(page.view.state.doc.textContent).toBe("NotesHello");
});
