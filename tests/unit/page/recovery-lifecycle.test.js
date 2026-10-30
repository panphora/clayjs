/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { webcrypto } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { pageStateFor } from "../../../src/page/save-states.js";

/**
 * Step 7: the save indicator says where the typing lives, and the recovery pieces live and
 * die with the page's own mode lease. Every state in the table is drawn from the evidence
 * that earns it: a write in flight is Pending, a committed transaction is Stored, a room's
 * acknowledgement is Shared, and only a checkpoint that covers the records is Saved. A
 * journal that cannot write says so once, and the copy it offers holds the blocked edit.
 * Edit, view, edit leaves one observer and one panel; a refused exit resumes the same
 * document; an exit waits for every append; a reader creates nothing at all.
 */

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });

const BLOCKS = [
  { id: "h", t: "heading", text: "Notes" },
  { id: "p", t: "paragraph", text: "Hello" },
];
const TAG_SEL = 'script[type="application/json"][merge="page"][clay~="live"]';
const ARTICLE_SEL = "article[data-page]";

const clone = (v) => JSON.parse(JSON.stringify(v));
const tick = async (turns = 40) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
const until = async (done, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  return done();
};

const pageHtml = (value = seedValue(BLOCKS)) => {
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const tagHtml = (value = seedValue(BLOCKS)) =>
  `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;

// One recovery service, as much of it as the page journal, its review and its copies use.
// An append commits when the test releases it, or at once; a refusal names its code; a
// compaction retires only the records it was handed and only when it says it did.
function fakeRecovery() {
  const gate = { manual: false, waiting: [], fail: null, compactFails: false };
  const records = new Map();
  const calls = { registers: [], appends: 0, compactions: [], acknowledgements: 0, checkpoints: [], flushes: 0 };
  let seq = 0;
  const store = (channel) => {
    if (!records.has(channel)) records.set(channel, []);
    return records.get(channel);
  };
  const retire = (channel, named) => {
    const list = store(channel);
    for (const name of named) {
      const at = list.findIndex((record) => record.id === name?.id);
      if (at >= 0) list.splice(at, 1);
    }
  };
  const service = {
    register({ channel, version = 1 } = {}) {
      calls.registers.push(channel);
      const list = store(channel);
      const commit = (key) => {
        const revision = ++seq;
        const record = { id: `${channel}:${revision}`, revision, channel, version, key };
        list.push(record);
        return { ok: true, id: record.id, revision };
      };
      return {
        channel,
        version,
        append({ key } = {}) {
          calls.appends += 1;
          if (gate.fail) return Promise.resolve({ ok: false, code: gate.fail });
          if (!gate.manual) return Promise.resolve(commit(key));
          return new Promise((resolve) => gate.waiting.push(() => resolve(commit(key))));
        },
        async list() {
          return { ok: true, records: list.map((record) => ({ ...record, supported: true })) };
        },
        async dismiss(id) {
          retire(channel, [{ id }]);
          return { ok: true };
        },
        async compact({ records: named = [] } = {}) {
          calls.compactions.push(named.length);
          if (gate.compactFails) return { ok: false, code: "busy" };
          retire(channel, named);
          return { ok: true, retired: named };
        },
        async checkpoint({ records: named = [] } = {}) {
          calls.checkpoints.push(named.length);
          retire(channel, named);
          return { ok: true, retired: named };
        },
        async markAcknowledged({ records: named = [] } = {}) {
          calls.acknowledgements += 1;
          return { ok: true, acknowledged: named.length };
        },
        async stage({ key, kind = "text", payload = null } = {}) {
          const revision = ++seq;
          const record = { id: `${channel}:stage:${revision}`, revision, channel, version, kind, key, payload };
          list.push(record);
          return { ok: true, id: record.id, revision };
        },
        async flush() {
          calls.flushes += 1;
          return { ok: true };
        },
        subscribe() {
          return () => {};
        },
      };
    },
  };
  return {
    service,
    gate,
    calls,
    recordsOf: (channel) => store(channel),
    commitNext() {
      const next = gate.waiting.shift();
      next?.();
      return Boolean(next);
    },
  };
}

let current = null;
let downloads = null;

// The host answers a save with the stamp of the bytes it stored: that stamp and the
// state pinned to the capture are the pair a covering proof is made of.
const STAMPED = () => ({ status: 200, body: { msg: "Saved", etag: "stamp-2" } });

async function load({ editMode = true, liveData = true, answer = STAMPED } = {}) {
  jest.resetModules();
  window.clayEditMode = editMode;
  if (liveData) document.documentElement.setAttribute("documentetag", "stamp-1");
  else document.documentElement.removeAttribute("documentetag");
  document.head.innerHTML = tagHtml();
  document.body.innerHTML = pageHtml();

  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, stores: {} };
  const saves = [];
  // `live-provenance` is what lets a capture carry the room position its ops came from,
  // so a page holding unconfirmed ops can still be saved to the file.
  const extensions = liveData ? ["page", "live-data", "live-provenance", "conditional"] : ["page"];

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions, document: { etag: "stamp-1" } }),
    hostSupports: async (name) => extensions.includes(name),
    hostPageStateHref: async () => null,
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
      async send(clientId) {
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

  // The one file a copy is: captured, never written to a server.
  downloads = [];
  await jest.unstable_mockModule("../../../src/core/download.js", () => ({
    downloadHtml: ({ html, name }) => { downloads.push({ html, name }); return true; },
    documentName: () => "notes",
  }));

  global.fetch = jest.fn(async (url, options) => {
    if ((options?.method ?? "GET") !== "POST") {
      return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
    }
    const reply = answer(saves.length);
    saves.push({ url: String(url), options, headers: options?.headers ?? {}, body: String(options?.body ?? "") });
    const doc = new DOMParser().parseFromString(String(options?.body ?? ""), "text/html");
    const tag = doc.querySelector(TAG_SEL);
    const status = reply.status ?? 200;
    const headers = reply.headers ?? {};
    if (status < 400 && tag) room.stores.page = { value: JSON.parse(tag.textContent), ephemeral: false, last: 0, landed: 0 };
    return {
      ok: status < 400,
      status,
      statusText: "",
      headers: {
        get: (name) => {
          const key = Object.keys(headers).find((k) => k.toLowerCase() === String(name).toLowerCase());
          return key ? headers[key] : null;
        },
      },
      text: async () => JSON.stringify(reply.body ?? {}),
    };
  });

  if (liveData) {
    const etag = await import("../../../src/core/etag.js");
    await etag.seedEtag();
  }

  const recovery = fakeRecovery();
  const { live, storeOf, checkpointWithin } = await import("../../../src/plugins/live.js");
  window.clay = { live: (name) => live(name), recovery: recovery.service };
  const { page, preparePageSession, pageParticipant } = await import("../../../src/plugins/page.js");
  const save = await import("../../../src/core/save.js");
  current = page;
  return { page, preparePageSession, pageParticipant, storeOf, checkpointWithin, saves, save, ...recovery };
}

let states = [];
let onState = null;

function watchStates() {
  states = [];
  onState = (event) => states.push(event.detail?.state);
  document.addEventListener("clay:page-save-state", onState);
}

afterEach(() => {
  if (onState) document.removeEventListener("clay:page-save-state", onState);
  onState = null;
  try { current?.dispose(); } catch {}
  current = null;
  jest.useRealTimers();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("documentetag");
  document.documentElement.removeAttribute("savestatus");
  delete window.clay;
});

// The chip's drawing is a module the first save state fetches, so a reading waits for it.
const drawn = async () => {
  await import("../../../src/plugins/indicator-chip.js");
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
const context = (generation = 1) => ({ generation, destination: "host", signal: new AbortController().signal, isCurrent: () => true });
const settle = async (save, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (!save.baselineSettled() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
};

// The table, in the one order that never overstates the evidence, and the only texts the
// indicator may draw for these five states.
test("the five states answer to the table, and the indicator draws its texts", async () => {
  const facts = { pending: 1, journaled: 1, acknowledged: 1, checkpointed: true };
  expect(pageStateFor({ unavailable: true, ...facts })).toBe("unavailable");
  expect(pageStateFor(facts)).toBe("pending");
  expect(pageStateFor({ journaled: 1, acknowledged: 1, checkpointed: true })).toBe("journaled");
  expect(pageStateFor({ acknowledged: 1, checkpointed: true })).toBe("acknowledged");
  expect(pageStateFor({ checkpointed: true })).toBe("checkpointed");
  // A page with no journal has nothing to say about its bytes.
  expect(pageStateFor()).toBe(null);
  // Nothing is acknowledged and nothing is covered while a write has not committed.
  expect(pageStateFor({ pending: 2 })).toBe("pending");

  jest.resetModules();
  window.clayEditMode = true;
  document.body.innerHTML = "";
  await import("../../../src/plugins/indicator.js");
  const texts = {
    pending: "Saving…",
    acknowledged: "Saving…",
    checkpointed: "Saved",
    unavailable: "Can't store changes: download a copy",
  };
  for (const [state, text] of Object.entries(texts)) {
    document.dispatchEvent(new CustomEvent("clay:page-save-state", { detail: { state } }));
    await drawn();
    const chip = document.querySelector("[data-clay-indicator]");
    expect({ state, text: chip.textContent }).toEqual({ state, text });
    expect(chip.dataset.state).toBe(state);
  }
  // The journal is not a save: it draws no chip of its own, so typing stays quiet.
  document.dispatchEvent(new CustomEvent("clay:page-save-state", { detail: { state: "journaled" } }));
  await drawn();
  const chip = document.querySelector("[data-clay-indicator]");
  expect(chip.textContent).not.toBe("Stored on this device");
  expect(chip.dataset.state).not.toBe("journaled");
});

// The page's recovery pieces are its own children: the page participant prepares,
// quiesces and disposes them through its lease, and neither is a live switch row.
test("the recovery modules are page children, and the page stays an export", async () => {
  const { MODULE_SUPPORT, PAGE_FEATURE_SUPPORT } = await import("../../../src/core/mode-support.js");

  expect(Object.keys(PAGE_FEATURE_SUPPORT).sort()).toEqual(["page/recovery-ui.js", "page/ybind/recovery.js"]);
  for (const [path, row] of Object.entries(PAGE_FEATURE_SUPPORT)) {
    expect({ path, row }).toEqual({ path, row: { owner: "plugins/page.js", lifecycle: "child" } });
  }
  // Adding a child row never turns its owner into something else, and a page feature is
  // never a row a live switch resolves on its own.
  expect(MODULE_SUPPORT["plugins/page.js"]).toBe("export");
  expect(MODULE_SUPPORT["core/recovery.js"]).toBe("neutral");
  expect(Object.keys(MODULE_SUPPORT).filter((path) => path in PAGE_FEATURE_SUPPORT)).toEqual([]);
});

test("a page state stays on screen while the journal has nothing to report, and Saved fades", async () => {
  jest.resetModules();
  window.clayEditMode = true;
  document.body.innerHTML = "";
  await import("../../../src/plugins/indicator.js");
  jest.useFakeTimers();

  const fire = (state) => document.dispatchEvent(new CustomEvent("clay:page-save-state", { detail: { state } }));
  fire("journaled");
  await drawn();
  expect(document.querySelector("[data-clay-indicator]")).toBeNull();

  fire("pending");
  await drawn();
  const chip = document.querySelector("[data-clay-indicator]");
  expect(chip.textContent).toBe("Saving…");
  jest.advanceTimersByTime(10_000);
  expect(chip.style.opacity).toBe("1");

  fire("unavailable");
  await drawn();
  expect(chip.style.opacity).toBe("1");
  expect(chip.dataset.state).toBe("unavailable");

  fire("checkpointed");
  await drawn();
  expect(chip.textContent).toBe("Saved");
  jest.advanceTimersByTime(2200);
  expect(chip.style.opacity).toBe("0");
});

test("nothing is Stored before the transaction commits, and a room's word is not Saved", async () => {
  const harness = await load();
  const { page, storeOf, gate, commitNext } = harness;
  watchStates();
  gate.manual = true;

  await page.ready;
  await settle(harness.save);
  await until(() => !!page.view);

  const view = page.view;
  view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
  await tick();

  // Handed over and not committed: Pending, and never Stored or Saved.
  expect(states).toContain("pending");
  expect(states).not.toContain("journaled");
  expect(states).not.toContain("checkpointed");

  commitNext();
  expect(await until(() => states.includes("journaled"))).toBe(true);
  expect(states).not.toContain("checkpointed");

  // The room's confirmation is metadata: Shared, still not Saved.
  const store = storeOf("page");
  store.confirm(store.mark);
  await tick();
  expect(states).toContain("acknowledged");
  expect(states).not.toContain("checkpointed");
  expect(harness.calls.acknowledgements).toBe(1);
});

test("only a checkpoint that covers the records says Saved, and a save that proves nothing keeps them", async () => {
  const harness = await load({ answer: () => ({ status: 200, body: { msg: "Saved" } }) });
  const { page, preparePageSession, checkpointWithin, calls, recordsOf } = harness;
  watchStates();

  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(harness.save);
    lease.enable();
    const view = page.view;
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    await until(() => states.includes("journaled"));
    const stored = recordsOf("page.yjs").length;
    expect(stored).toBeGreaterThan(0);

    // An accepted save with no ETag proves no stored pair: the records stay and no
    // state ever claims Saved.
    checkpointWithin(0);
    expect(await until(() => harness.saves.length > 0)).toBe(true);
    await tick(120);
    expect(calls.checkpoints).toEqual([]);
    expect(recordsOf("page.yjs").length).toBe(stored);
    expect(states).not.toContain("checkpointed");
  } finally {
    lease.dispose();
  }
});

test("a checkpoint that covers the records retires them and only then says Saved", async () => {
  const harness = await load();
  const { page, preparePageSession, checkpointWithin, calls, recordsOf } = harness;
  watchStates();

  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(harness.save);
    lease.enable();
    const view = page.view;
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    await until(() => states.includes("journaled"));
    expect(recordsOf("page.yjs").length).toBeGreaterThan(0);

    // The save's own ETag and the state pinned to its capture are the pair the proof
    // needs: it covers the records it names, the channel retires those, and no others.
    checkpointWithin(0);
    expect(await until(() => recordsOf("page.yjs").length === 0)).toBe(true);
    expect(await until(() => states.includes("checkpointed"))).toBe(true);
    expect(calls.checkpoints.length).toBeGreaterThan(0);
    expect(states).not.toContain("unavailable");

    // A new edit after the checkpoint is work no checkpoint covers: Stored again, and
    // never Saved on the strength of the earlier one.
    view.dispatch(view.state.tr.insertText("?", view.state.doc.content.size - 1));
    expect(await until(() => states.lastIndexOf("journaled") > states.indexOf("checkpointed"))).toBe(true);
  } finally {
    lease.dispose();
  }
});

test("a journal that cannot write says so once, and the copy it offers holds the blocked edit", async () => {
  const harness = await load();
  const { page, gate, storeOf } = harness;
  watchStates();

  await page.ready;
  await settle(harness.save);
  await until(() => !!page.view);
  const view = page.view;
  view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
  await until(() => states.includes("journaled"));

  // The device refuses the next bytes: Unavailable, and nothing is called saved.
  gate.fail = "quota";
  view.dispatch(view.state.tr.insertText("!", view.state.doc.content.size - 1));
  expect(await until(() => states.includes("unavailable"))).toBe(true);
  expect(states).not.toContain("checkpointed");
  expect(states).not.toContain("saved");
  // Not silently evicted: the records the store did confirm are still there.
  expect(harness.recordsOf("page.yjs").length).toBeGreaterThan(0);
  expect(storeOf("page").value).toBeTruthy();

  const action = await until(() => [...document.querySelectorAll("button")].find((button) => button.textContent === "Download a copy"));
  expect(action).toBeTruthy();
  action.click();
  expect(await until(() => downloads.length > 0)).toBe(true);
  // The copy is the blocked edit, not the last file the host took.
  expect(downloads[0].html).toContain("Hello there!");
  expect(harness.saves.at(-1)?.body ?? "").not.toContain("Hello there!");
});

// A device that cannot open the journal says where the work has nowhere to live, once. That
// toast belongs to the session that raised it: leaving edit takes its node out of the page
// before it can fade to nobody, and the next session raises one again, not two.
test("a journal that cannot open says so in edit, and leaving edit takes its toast out", async () => {
  const real = globalThis.crypto;
  const noDigest = new Proxy(real, {
    get(target, property) {
      if (property === "subtle") return undefined;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  Object.defineProperty(globalThis, "crypto", { value: noDigest, configurable: true, writable: true });
  const STORAGE_TEXT = "Changes cannot be stored on this device.";
  const storageToasts = () => [...document.querySelectorAll("[data-clay-toast]")].filter((el) => el.textContent.includes(STORAGE_TEXT));
  let second = null;
  try {
    const harness = await load();
    const { preparePageSession } = harness;
    watchStates();

    const first = preparePageSession(context());
    try {
      await first.ready;
      await settle(harness.save);
      first.enable();
      expect(await until(() => storageToasts().length === 1)).toBe(true);
    } finally {
      first.dispose();
    }
    // The session is over, so its toast goes now rather than through the fade.
    await tick(10);
    expect(storageToasts()).toHaveLength(0);

    second = preparePageSession(context());
    await second.ready;
    await settle(harness.save);
    second.enable();
    expect(await until(() => storageToasts().length === 1)).toBe(true);
    await tick(40);
    expect(storageToasts()).toHaveLength(1);
  } finally {
    try { second?.dispose(); } catch {}
    Object.defineProperty(globalThis, "crypto", { value: real, configurable: true, writable: true });
  }
});

test("the journal compacts at sixty-four batches, and a refused compaction evicts nothing", async () => {
  const harness = await load();
  const { page, gate, calls, recordsOf } = harness;
  watchStates();
  gate.compactFails = true;

  await page.ready;
  await settle(harness.save);
  await until(() => !!page.view);
  const view = page.view;
  for (let i = 0; i < 64; i++) {
    view.dispatch(view.state.tr.insertText("x", view.state.doc.content.size - 1));
    await tick(4);
  }
  expect(await until(() => calls.compactions.length > 0)).toBe(true);
  // Bounded: the first compaction names the sixty-four batches it holds.
  expect(calls.compactions[0]).toBe(64);
  await tick(80);
  // A compaction the store refused retires nothing, and nothing is called Saved.
  expect(recordsOf("page.yjs").length).toBe(64);
  expect(states).not.toContain("checkpointed");
});

test("an exit waits for every append the journal handed over", async () => {
  const harness = await load();
  const { page, gate, calls, commitNext } = harness;
  gate.manual = true;

  await page.ready;
  await settle(harness.save);
  await until(() => !!page.view);
  const view = page.view;
  view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
  await tick();

  const { flushUnsaved, pendingIds } = await import("../../../src/lib/unsaved-state.js");
  expect(pendingIds()).toContain("page:journal");
  let answered = null;
  const barrier = flushUnsaved().then((result) => { answered = result; });
  await tick(60);
  // The append has not committed, so the exit has not been answered.
  expect(answered).toBe(null);

  commitNext();
  await barrier;
  expect(answered?.ok).toBe(true);
  expect(calls.flushes).toBeGreaterThan(0);
  expect(pendingIds()).not.toContain("page:journal");
});

test("edit, view, edit leaves one observer and one panel", async () => {
  const harness = await load();
  const { preparePageSession } = harness;
  watchStates();

  const first = preparePageSession(context());
  try {
    await first.ready;
    await settle(harness.save);
    first.enable();
    expect(document.querySelectorAll(".page-recovery")).toHaveLength(1);
    const firstPanel = document.querySelector(".page-recovery-panel");
    expect(firstPanel).toBeTruthy();
    const firstSurface = harness.page.view.dom;
    const staged = (channel) => harness.recordsOf(channel).filter((record) => String(record.id).startsWith(`${channel}:stage:`));

    first.dispose();
    await tick(20);
    // The view is gone, and so is everything the session drew or listened to.
    expect(document.querySelectorAll(".page-recovery")).toHaveLength(0);
    expect(document.querySelectorAll(".page-recovery-panel")).toHaveLength(0);
    const before = staged("page.ime").length;
    firstSurface.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    firstSurface.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true }));
    await tick(10);
    expect(staged("page.ime").length).toBe(before);

    const second = preparePageSession(context());
    try {
      await second.ready;
      await settle(harness.save);
      second.enable();
      expect(document.querySelectorAll(".page-recovery")).toHaveLength(1);
      expect(document.querySelectorAll(".page-recovery-panel")).toHaveLength(1);
      expect(document.querySelector(".page-recovery-panel")).not.toBe(firstPanel);
      // One shadow listens: a composition pair stages its text twice, not four times.
      const block = harness.page.view.dom.querySelector('[data-id="p"]');
      expect(block).toBeTruthy();
      const mark = staged("page.ime").length;
      block.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      block.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true }));
      await tick(10);
      expect(staged("page.ime").length - mark).toBe(2);
    } finally {
      second.dispose();
    }
  } finally {
    try { first.dispose(); } catch {}
  }
});

test("a refused exit resumes the same document and the same records", async () => {
  const harness = await load();
  const { preparePageSession, page } = harness;
  watchStates();

  const lease = preparePageSession(context());
  try {
    await lease.ready;
    await settle(harness.save);
    lease.enable();
    const view = page.view;
    const panel = document.querySelector(".page-recovery-panel");
    view.dispatch(view.state.tr.insertText(" there", view.state.doc.content.size - 1));
    expect(await until(() => states.includes("journaled"))).toBe(true);
    const records = harness.recordsOf("page.yjs").length;

    // A refused exit closes admission and gives everything back exactly as it was.
    await lease.quiesce();
    expect(page.view).toBe(view);
    expect(view.dom.textContent).toContain("Hello there");
    expect(document.querySelector(".page-recovery-panel")).toBe(panel);

    lease.resume();
    expect(page.view).toBe(view);
    expect(view.editable).toBe(true);
    expect(view.dom.textContent).toContain("Hello there");
    expect(document.querySelector(".page-recovery-panel")).toBe(panel);
    // The records the refused exit kept are the records this session still holds.
    expect(harness.recordsOf("page.yjs").length).toBe(records);
  } finally {
    lease.dispose();
  }
});

test("a reader creates no channel and makes no IndexedDB request", async () => {
  const opened = [];
  const factory = new IDBFactory();
  globalThis.indexedDB = new Proxy(factory, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "open") return (...args) => { opened.push(args[0]); return value.apply(target, args); };
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  const harness = await load({ editMode: false });
  watchStates();
  await tick(120);

  expect(harness.calls.registers).toEqual([]);
  expect(harness.calls.appends).toBe(0);
  expect(opened).toEqual([]);
  expect(await harness.page.ready).toBe(null);
  expect(states).toEqual([]);
  expect(document.querySelector(".page-recovery")).toBe(null);
});

test("a read that lands after the review is disposed draws nothing", async () => {
  const { createRecoveryReview } = await import("../../../src/page/recovery-ui.js");
  const mount = document.createElement("div");
  document.body.append(mount);
  let release = null;
  const channel = {
    async list() {
      return new Promise((resolve) => { release = () => resolve({ ok: true, records: [{ id: "c1", revision: 0, payload: { blockId: "p", text: "half typed" } }] }); });
    },
    async dismiss() { return { ok: true }; },
    async stage() { return { ok: true, id: "s1", revision: 1 }; },
    async flush() { return { ok: true }; },
  };
  const review = createRecoveryReview({ mount, service: { register: () => channel } });
  const pending = review.refresh();
  review.destroy();
  release();
  await pending;
  await tick(20);

  expect(review.count).toBe(0);
  expect(document.querySelector(".page-recovery")).toBe(null);
  expect(document.querySelector(".page-recovery-panel")).toBe(null);
  expect(mount.children).toHaveLength(0);
});
