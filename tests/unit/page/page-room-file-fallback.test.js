/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { entriesOf } from "../../../src/page/ybind/parts.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { buildCandidate, isCheckpointKey } from "../../../src/live/page-compaction.js";
import { rangesOf, within, docRanges } from "../../../src/page/ybind/containment.js";
import { docFromValue } from "../../../src/page/ybind/provider.js";

/**
 * A host without live-data keeps the page: the page provider asks a file-only host for
 * no room, the local tab lane runs the document's room in host mode, and the file it
 * saves carries the whole page value. A file a host-mode room compacted (one checkpoint
 * key and loose client keys) opens and saves on a host without compaction, whose legacy
 * room and file-only lane both keep every update it came with.
 */

const BLOCKS = [
  { id: "h", t: "heading", text: "Notes" },
  { id: "p", t: "paragraph", text: "Hello" },
];
const TAG_SEL = 'script[type="application/json"][merge="page"][clay~="live"]';
const ARTICLE_SEL = "article[data-page]";
const PART_KEY = /^.+\.\d+\.\d+$/;
const ROOM_ROUTE = "/_/sync/data";

const clone = (v) => JSON.parse(JSON.stringify(v));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, timeout = 6000) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await sleep(5);
  return predicate();
};

const renderOf = (value) => renderFromTags([JSON.stringify(value)]);
const tagHtml = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;
const articleHtml = (value) => {
  const { html, rev } = renderOf(value);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const fileHtml = (value) =>
  `<!doctype html><html><head><title>Notes</title>${tagHtml(value)}</head><body>${articleHtml(value)}</body></html>`;

const articleOf = (html) => new DOMParser().parseFromString(html, "text/html").querySelector(ARTICLE_SEL);
const tagOf = (html) => new DOMParser().parseFromString(html, "text/html").querySelector(TAG_SEL);

// The page value as the file must carry it: every key whole, no update in parts, and
// nothing the value states left out.
function expectWholePage(value, texts) {
  expect(value.v).toBe(1);
  const keys = Object.keys(value.y);
  expect(keys.filter((key) => PART_KEY.test(key))).toEqual([]);
  for (const key of keys) {
    expect(typeof value.y[key]).toBe("string");
    expect(value.y[key].length).toBeGreaterThan(0);
  }
  const doc = docFromValue(value, { strict: true });
  doc.destroy();
  const blocks = blocksFromYValue(value);
  const written = Object.values(blocks).map((block) => block.c ?? "").join("\n");
  for (const text of texts) expect(written).toContain(text);
  return blocks;
}

// The whole page value a file states, as the ranges a Yjs state covers: what a later
// value has to hold to have lost nothing of it.
const covered = (value) => {
  const doc = docFromValue(value);
  try {
    return docRanges(doc);
  } finally {
    doc.destroy();
  }
};

// One peer's edit of the page as a room admits it: the update alone, against the state
// the file's tag already holds.
function peerUpdate(base, text, client) {
  const doc = new Y.Doc();
  try {
    for (const [, encoded] of entriesOf(base.y)) Y.applyUpdateV2(doc, Y.fromBase64(encoded));
    doc.clientID = client;
    const before = Y.encodeStateVector(doc);
    const flow = doc.getText("flow");
    flow.insert(flow.length, text);
    return Y.toBase64(Y.encodeStateAsUpdateV2(doc, before));
  } finally {
    doc.destroy();
  }
}

let keyCount = 0;
const looseKey = () => `u1a-b-${(++keyCount).toString(36)}`;

// The page value a host-mode room wrote: one checkpoint key and two loose client keys.
// The checkpoint is built the way the room's compactor builds one, over the file's own
// update and the first peer edit; the two newer edits stay loose on top of it.
function compactedPageValue(blocks, texts) {
  const base = seedValue(blocks);
  const [folded, ...loose] = texts;
  const built = buildCandidate({
    kind: "full",
    sources: [...entriesOf(base.y), [looseKey(), peerUpdate(base, folded, 7101)]],
  });
  expect(built.failure).toBeUndefined();
  const checkpoint = `c${(0xc0ffee10 + (++keyCount)).toString(16)}-1`;
  const y = { [checkpoint]: built.update };
  loose.forEach((text, index) => { y[looseKey()] = peerUpdate(base, text, 7200 + index); });
  return { value: { v: 1, g: 0, y }, keys: Object.keys(y), checkpoint, loose: Object.keys(y).slice(1) };
}

let channels = [];

class FakeChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.closed = false;
    channels.push(this);
  }
  postMessage(data) {
    const copy = JSON.parse(JSON.stringify(data));
    for (const other of channels) {
      if (other === this || other.closed || other.name !== this.name) continue;
      setTimeout(() => other.onmessage?.({ data: copy }), 0);
    }
  }
  close() {
    this.closed = true;
  }
}

async function load({ liveData = false, value = seedValue(BLOCKS) } = {}) {
  jest.resetModules();
  channels = [];
  globalThis.BroadcastChannel = FakeChannel;
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_name, callback) => callback({}) } });
  delete window.clayEditMode;
  for (const attribute of ["documentetag", "savestatus", "editmode", "canedit", "pageowner", "draftmode"]) {
    document.documentElement.removeAttribute(attribute);
  }
  document.head.innerHTML = tagHtml(value);
  document.body.innerHTML = articleHtml(value);

  const extensions = liveData ? ["page", "live-data", "sync"] : ["page", "sync"];
  const requests = [];
  const saves = [];

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions, document: {} }),
    hostSupports: async (name) => extensions.includes(name),
    hostMetaOutcome: () => "ok",
    querySaveOutcome: () => null,
    resetHostMeta: () => ({}),
  }));

  let rooms = null;
  let room = null;
  let started = null;
  if (liveData) {
    const server = await import("../../../src/server/rooms/index.js");
    rooms = server.createRooms();
    room = rooms.open("/notes.html", fileHtml(value), { nodeId: "n1" });
    await jest.unstable_mockModule("../../../src/live/server-lane.js", () => ({
      serverTransport: () => ({
        start(handlers) {
          started = handlers;
          handlers.open({ clientId: "tab-1", lane: "live" });
          handlers.state(clone(rooms.state(room, "tab-1", null, { compaction: 1 })));
          return () => { started = null; };
        },
        async send(clientId, frame) {
          const answer = rooms.apply(room, clientId, frame);
          if (answer?.error) return { status: server.ROOM_ERROR_STATUS[answer.error] ?? 409, body: { code: answer.error }, retryAfter: 0 };
          if (answer?.stale) return { status: 409, body: { code: "stale-epoch" }, retryAfter: 0 };
          const body = clone(answer);
          if (!answer.duplicate) {
            const data = { epoch: answer.epoch, seq: answer.seq, name: frame.name, ops: body.ops, from: clientId, n: frame.n, ...(answer.checkpoint === true && { checkpoint: true }) };
            setTimeout(() => started?.frame(data), 0);
          }
          return { status: 200, body };
        },
        async fetchState(clientId, since) {
          return clone(rooms.state(room, clientId, since ?? null, { compaction: 1 }));
        },
      }),
    }));
  }

  globalThis.EventSource = window.EventSource = class extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.readyState = 0;
    }
    close() {}
  };

  // The host: a POST is a save, and every GET is a miss.
  global.fetch = jest.fn(async (url, options) => {
    requests.push({ url: String(url), method: options?.method ?? "GET" });
    if ((options?.method ?? "GET") !== "POST") {
      return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
    }
    saves.push({ url: String(url), headers: options?.headers ?? {}, body: String(options?.body ?? "") });
    return {
      ok: true,
      status: 200,
      statusText: "",
      headers: { get: (name) => (String(name).toLowerCase() === "etag" ? "stamp-2" : null) },
      text: async () => JSON.stringify({ msg: "Saved", etag: "stamp-2" }),
    };
  });

  // The lane modules live.js imports when it needs a lane: loaded here so a boot that
  // follows another session's reads the same graph.
  await Promise.all([import("../../../src/live/fast-lane.js"), import("../../../src/live/local-lane.js")]);

  const liveModule = await import("../../../src/plugins/live.js");
  window.clay = { live: (name) => liveModule.live(name) };
  const pageModule = await import("../../../src/plugins/page.js");
  const context = { generation: 1, destination: "host", signal: new AbortController().signal, isCurrent: () => true, represented: null, reader: null, initial: false };
  const liveLease = liveModule.liveWriterParticipant().prepare(context);
  const pageLease = pageModule.pageParticipant().prepare(context);
  await pageLease.ready;
  const facts = await import("../../../src/core/is-edit-mode.js");
  const save = await import("../../../src/core/save.js");
  facts.commitModeFacts({ mode: "edit", isEditMode: true });
  save.adoptEntryBaseline({ represented: null });
  liveLease.enable();
  pageLease.enable();
  await until(() => pageModule.page.view !== null);
  return {
    ...liveModule,
    save,
    page: pageModule.page,
    requests,
    saves,
    rooms,
    room,
    liveLease,
    pageLease,
    close() {
      pageLease.dispose();
      liveLease.dispose();
    },
  };
}

const type = (page, text) => {
  const view = page.view;
  view.dispatch(view.state.tr.insertText(text, view.state.doc.content.size - 1));
};

// The room has taken the edit, and this tab holds it as the room's own value: what a
// save writes into the file.
const accepted = (harness, text) => until(() => {
  const store = harness.storeOf("page");
  if (!store || store.pending.length) return false;
  try {
    return Object.values(blocksFromYValue(store.authoritative)).some((block) => block.c?.includes(text));
  } catch {
    return false;
  }
});

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  for (const attribute of ["documentetag", "savestatus", "editmode", "canedit", "pageowner", "draftmode"]) {
    document.documentElement.removeAttribute(attribute);
  }
  delete window.clay;
  delete window.clayEditMode;
});

test("a page on a host without live-data saves and reopens with its whole page value", async () => {
  const typed = " Typed on a file-only host";
  const harness = await load({ liveData: false });
  expect(harness.page.view).toBeTruthy();
  expect(harness.page.view.editable).toBe(true);

  // The lane this tab runs is the local one, in the document's room scope.
  expect(await until(() => harness.localLane() !== null)).toBe(true);
  expect(harness.localLane().scope).toContain("page-rooms:2");
  expect(await until(() => harness.localLane().isSequencer === true)).toBe(true);

  type(harness.page, typed);
  expect(blocksFromYValue(harness.storeOf("page").value).p.c).toContain(typed);
  expect(await accepted(harness, typed)).toBe(true);

  const result = await harness.save.savePageForce();
  expect(result.ok).toBe(true);
  expect(harness.saves.length).toBeGreaterThan(0);

  // Nothing asked a live-data route for the room: the local lane ran it in this tab.
  expect(harness.requests.filter((entry) => entry.url.includes(ROOM_ROUTE))).toEqual([]);

  const saved = harness.saves.at(-1).body;
  const tag = tagOf(saved);
  expect(tag).toBeTruthy();
  const value = JSON.parse(tag.textContent);
  const blocks = expectWholePage(value, ["Notes", "Hello", typed]);

  // The article the same file carries is that value, and the typed text is in it.
  const article = articleOf(saved);
  const rendered = renderFromTags([tag.textContent]);
  expect(article.innerHTML).toBe(rendered.html);
  expect(article.getAttribute("data-rev")).toBe(rendered.rev);
  expect(article.textContent).toContain(typed);
  expect(blocks.p.c).toContain(typed);

  harness.close();

  // The same file reopens: a fresh page holds the whole value and the typed text.
  const reopened = await load({ liveData: false, value });
  expect(blocksFromYValue(reopened.storeOf("page").value).p.c).toContain(typed);
  expect(reopened.page.view.dom.textContent).toContain(typed);
  expect(reopened.requests.filter((entry) => entry.url.includes(ROOM_ROUTE))).toEqual([]);
  reopened.close();
}, 30000);

test("a file saved by a compacting room opens and saves on a host without compaction", async () => {
  const folded = " folded into the checkpoint";
  const first = " a loose edit";
  const second = " another loose edit";
  const typed = " typed after the compacted file";
  const compacted = compactedPageValue(BLOCKS, [folded, first, second]);

  // The file this test writes: one checkpoint key and two loose keys.
  expect(compacted.keys).toHaveLength(3);
  expect(isCheckpointKey(compacted.checkpoint)).toBe(true);
  expect(compacted.loose.every((key) => !isCheckpointKey(key))).toBe(true);
  const original = covered(compacted.value);
  expect(original.complete).toBe(true);
  const originalUpdates = compacted.keys.map((key) => rangesOf(Y.fromBase64(compacted.value.y[key])));

  // (a) a legacy room: the host's registry with compaction off.
  // (b) a file-only host: no live-data, so the local tab lane runs the room.
  for (const host of [{ name: "a legacy room", liveData: true }, { name: "the local lane", liveData: false }]) {
    const harness = await load({ liveData: host.liveData, value: compacted.value });
    expect(harness.page.view).toBeTruthy();
    expect(await until(() => harness.storeOf("page")?.handle.status.mode === "fast")).toBe(true);
    expect(Object.keys(harness.storeOf("page").authoritative.y).sort()).toEqual([...compacted.keys].sort());

    // The file-only host runs the same room in this tab, and asks no route for it.
    if (!host.liveData) {
      expect(await until(() => harness.localLane()?.scope?.includes("page-rooms:2") === true)).toBe(true);
    }

    type(harness.page, typed);
    expect(await accepted(harness, typed)).toBe(true);

    const result = await harness.save.savePageForce();
    expect(result.ok).toBe(true);
    expect(harness.saves.length).toBeGreaterThan(0);

    if (!host.liveData) expect(harness.requests.filter((entry) => entry.url.includes(ROOM_ROUTE))).toEqual([]);

    const saved = harness.saves.at(-1).body;
    const tag = tagOf(saved);
    expect(tag).toBeTruthy();
    const value = JSON.parse(tag.textContent);
    expectWholePage(value, ["Notes", "Hello", folded, first, second, typed]);

    // Everything the compacted file held is still in the value the file holds now.
    const now = covered(value);
    expect(now.complete).toBe(true);
    originalUpdates.forEach((ranges, index) => {
      expect({ host: host.name, key: compacted.keys[index], held: within(now, ranges) })
        .toEqual({ host: host.name, key: compacted.keys[index], held: true });
    });

    const article = articleOf(saved);
    const rendered = renderFromTags([tag.textContent]);
    expect(article.innerHTML).toBe(rendered.html);
    expect(article.textContent).toContain(typed);

    harness.close();

    // The same file opens again on the same host with every word still in it.
    const reopened = await load({ liveData: host.liveData, value });
    const all = Object.values(blocksFromYValue(reopened.storeOf("page").value)).map((block) => block.c ?? "").join("\n");
    for (const text of [folded, first, second, typed]) {
      expect({ host: host.name, text, held: all.includes(text) }).toEqual({ host: host.name, text, held: true });
    }
    reopened.close();
  }
}, 40000);
