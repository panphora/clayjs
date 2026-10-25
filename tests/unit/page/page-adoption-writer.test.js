import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { renderFromTags } from "../../../src/page/save-projection.js";

/**
 * Adopting a hand-edited article is the elected live-room writer's alone. On a
 * brand-new room (writer null) the tab claims the room with one redundant set
 * of an existing Yjs update, waits for the election, and then adopts; a room
 * that already has another writer neither claims nor adopts.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const flushAsync = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const until = async (check, tries = 400) => {
  for (let i = 0; i < tries; i++) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};

const BLOCKS = [{ id: "p", t: "paragraph", text: "Hello" }];

async function load({ writer, delayed, failProvenance = false, neverElects = false }) {
  jest.resetModules();
  const value = seedValue(BLOCKS);
  const room = { epoch: "e1", seq: 0, writer, conn: 0 };
  const state = () => ({
    epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0,
    stores: { page: { value: clone(value), ephemeral: false, last: 0, landed: 0 } },
  });
  const sent = [];
  const handlersRef = { h: null };

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions: ["page", "live-data"], document: null }),
    hostSupports: async (name) => {
      if (failProvenance && name === "live-provenance") throw new Error("metadata unavailable");
      return ["page", "live-data"].includes(name);
    },
    hostMetaOutcome: () => "ok",
    querySaveOutcome: () => null,
    resetHostMeta: () => {},
  }));

  await jest.unstable_mockModule("../../../src/core/save.js", () => ({
    savePageForce: async () => ({ ok: true, msgType: "success" }),
    savePage: async () => ({ ok: true, msgType: "success" }),
    savePageThrottled: () => {},
    baselineSettled: () => true,
    isSaveConflicted: () => false,
    autosaveIsSuspended: () => false,
    suspendAutosave: () => {},
    resumeAutosave: () => {},
    holdAllSaves: () => {},
    releaseAllSaves: () => {},
    getLastSavedDirty: () => false,
    setLastSavedBaselines: () => {},
    getLastSavedBytes: () => null,
  }));

  await jest.unstable_mockModule("../../../src/live/local-lane.js", () => ({
    localLaneSupported: () => false,
    localTransport: () => ({}),
  }));

  await jest.unstable_mockModule("../../../src/live/server-lane.js", () => ({
    serverTransport: () => ({
      start(handlers) {
        handlersRef.h = handlers;
        if (delayed) {
          const timer = setTimeout(() => handlers.open({ clientId: "tab-1", lane: "live" }), 5);
          return () => clearTimeout(timer);
        }
        handlers.open({ clientId: "tab-1", lane: "live" });
        handlers.state(state());
        return () => {};
      },
      async send(clientId, frame) {
        sent.push(clone(frame));
        room.seq += 1;
        if (neverElects) return { status: 200, body: { seq: room.seq, epoch: room.epoch } };
        if (room.writer === null) room.writer = clientId;
        handlersRef.h.writer({ epoch: room.epoch, writer: room.writer, landed: null });
        handlersRef.h.frame({ epoch: room.epoch, seq: room.seq, name: frame.name, ops: frame.ops, from: clientId, n: frame.n });
        return { status: 200, body: { seq: room.seq, epoch: room.epoch } };
      },
      async fetchState() {
        return state();
      },
    }),
  }));

  const rendered = renderFromTags([JSON.stringify(value)]);
  document.head.innerHTML = `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;
  document.body.innerHTML = `<article data-page="1" data-rev="${rendered.rev}">${rendered.html}</article>`;
  document.querySelector('article[data-page] [data-id="p"]').textContent = "Hello, edited";

  window.clayEditMode = true;
  const { live, storeOf, fastLane } = await import("../../../src/plugins/live.js");
  window.clay = { live };
  const { page } = await import("../../../src/plugins/page.js");
  return { page, storeOf, fastLane, sent, value };
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("a brand-new room: one redundant claim elects this tab, which adopts the hand edit", async () => {
  const { page, storeOf, sent, value } = await load({ writer: null, delayed: true });
  const adopted = [];
  const onAdopted = (event) => adopted.push({ detail: event.detail, sent: sent.length });
  document.addEventListener("clay:page-adopted", onAdopted);
  const key = Object.keys(value.y)[0];

  try {
    await page.ready;

    const isClaim = (frame) => frame.ops.length === 1 && frame.ops[0].op === "set" &&
      frame.ops[0].path[0] === "y" && frame.ops[0].path[1] === key && frame.ops[0].value === value.y[key];
    const claims = sent.filter(isClaim);
    expect(claims).toHaveLength(1);
    expect(sent[0]).toBe(claims[0]);
    expect(adopted).toEqual([{ detail: { edited: 1, created: 0, deleted: 0, moved: false }, sent: 1 }]);
    expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello, edited");
    expect(page.view.editable).toBe(true);
  } finally {
    document.removeEventListener("clay:page-adopted", onAdopted);
    page.dispose();
  }
});

test("a room whose writer is another tab: no claim is sent and the hand edit is not adopted", async () => {
  const { page, storeOf, sent } = await load({ writer: "other", delayed: false });
  const adopted = [];
  const onAdopted = (event) => adopted.push(event.detail);
  document.addEventListener("clay:page-adopted", onAdopted);

  try {
    // Another tab holds the seat, so this one neither claims nor adopts: it waits in
    // adopting until that tab's adoption reaches it through the room.
    expect(await until(() => page.status?.phase === "adopting")).toBe(true);
    await flushAsync();

    expect(sent).toEqual([]);
    expect(adopted).toEqual([]);
    expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello");
  } finally {
    document.removeEventListener("clay:page-adopted", onAdopted);
    page.dispose();
  }
});

test("a failed live-provenance lookup settles the no-lane gate and adopts in file mode", async () => {
  const { page, storeOf, sent } = await load({ writer: null, delayed: true, failProvenance: true });
  try {
    await page.ready;
    expect(sent).toEqual([]);
    expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello, edited");
    expect(page.view.editable).toBe(true);
  } finally {
    page.dispose();
  }
});

test("a lane that never reports a writer still adopts the hand edit, after the writer wait", async () => {
  const { WRITER_WAIT_MS } = await import("../../../src/plugins/page.js");
  const { page, storeOf, sent } = await load({ writer: null, delayed: false, neverElects: true });
  try {
    const started = Date.now();
    await page.ready;
    expect(Date.now() - started).toBeGreaterThanOrEqual(WRITER_WAIT_MS - 50);
    expect(sent.length).toBeGreaterThan(0);
    expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello, edited");
    expect(page.view.editable).toBe(true);
  } finally {
    page.dispose();
  }
}, 20_000);
