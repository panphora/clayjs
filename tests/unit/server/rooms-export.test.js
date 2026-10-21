/**
 * @jest-environment node
 */
import {
  createRooms,
  liveTags,
  inspectPage,
  pageBaseline,
  documentEtag,
  stampOf,
  serializeLive,
  PageConversionError,
  PageFormatError,
  PersistentReservationError,
  checkPageWriteAdmission,
  LIVE_LIMITS,
} from "../../../src/server/rooms/index.js";
import { PageConversionError as ConversionFromModule } from "../../../src/server/rooms/page-conversion.js";
import { PageFormatError as FormatFromModule } from "../../../src/server/rooms/page-write-guard.js";
import { PersistentReservationError as PersistentFromModule } from "../../../src/server/rooms/live-data-rooms.js";

const counts = { accepted: 0, refused: 0, duplicates: 0, pages: 0, drops: 0, resets: 0, sweeps: 0 };

const tag = (name, value, { ephemeral = false, at = null } = {}) =>
  `<script type="application/json" merge="${name}" clay="live${ephemeral ? " ephemeral" : ""}"${at ? ` live-at="${at}"` : ""}>${JSON.stringify(value)}</script>`;
const doc = (...parts) => `<!doctype html><html><body>${parts.join("")}</body></html>`;

const clock = () => {
  const state = { now: 1_000_000, epoch: 0 };
  return {
    state,
    now: () => state.now,
    newEpoch: () => `e${++state.epoch}`,
    rooms: (options = {}) => createRooms({ now: () => state.now, newEpoch: () => `e${++state.epoch}`, ...options }),
  };
};

const addScore = (n) => ({ name: "game", n, ops: [{ op: "add", path: ["score"], n: 1 }] });

test("classifies a document's persistent and ephemeral stores", () => {
  const c = clock();
  const rooms = c.rooms();
  const html = doc(tag("game", { score: 0 }), tag("lobby", { cursors: {} }, { ephemeral: true }));
  const room = rooms.open("/a.html", html, { nodeId: "n1" });

  expect(room.epoch).toBe("e1");
  expect(room.seq).toBe(0);
  expect([...room.stores.keys()]).toEqual(["game", "lobby"]);
  expect(room.stores.get("game").ephemeral).toBe(false);
  expect(room.stores.get("lobby").ephemeral).toBe(true);
  expect(room.stores.get("game").value).toEqual({ score: 0 });
  expect(room.stores.get("game").landed).toBe(0);
  expect(room.stores.get("game").last).toBe(0);
  expect(rooms.used()).toBeGreaterThan(0);
});

test("accepts one frame and answers its retry as a duplicate", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", doc(tag("game", { score: 0 })), { nodeId: "n1" });

  const first = rooms.apply(room, "A", addScore(1));
  expect(first.duplicate).toBeUndefined();
  expect(first.seq).toBe(1);
  expect(first.epoch).toBe("e1");
  expect(first.writer).toBe("A");
  expect(room.stores.get("game").value).toEqual({ score: 1 });
  counts.accepted += 1;

  const retry = rooms.apply(room, "A", addScore(1));
  expect(retry).toEqual({ duplicate: true, seq: 1, epoch: "e1" });
  expect(room.stores.get("game").value).toEqual({ score: 1 });
  expect(room.seq).toBe(1);
  counts.duplicates += 1;
});

test("refuses a store admission over the size limit and leaves state and accounting alone", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", doc(tag("game", { score: 0 })), { nodeId: "n1" });
  const used = rooms.used();

  const result = rooms.apply(room, "A", {
    name: "game",
    n: 1,
    ops: [{ op: "set", path: ["blob"], value: "x".repeat(LIVE_LIMITS.storeBytes + 1) }],
  });

  expect(result).toEqual({ error: "too-large" });
  expect(room.stores.get("game").value).toEqual({ score: 0 });
  expect(room.seq).toBe(0);
  expect(rooms.used()).toBe(used);
  counts.refused += 1;
});

test("refuses a hybrid page written as Yjs without a conversion header", () => {
  const hybrid = doc(tag("page", { blocks: { b1: { text: "hi" } } }));
  const yjs = doc(tag("page", { v: 1, y: { root: "abc" } }));
  expect(inspectPage(hybrid).kind).toBe("hybrid");
  expect(inspectPage(yjs).kind).toBe("yjs");

  let thrown = null;
  try {
    checkPageWriteAdmission({ currentHtml: hybrid, html: yjs, ifMatch: documentEtag(hybrid), room: null });
  } catch (err) {
    thrown = err;
  }

  expect(thrown).toBeInstanceOf(PageConversionError);
  expect(thrown.reason).toBe("implicit-conversion");
  counts.refused += 1;
});

test("a page reservation refuses page frames, commits once and releases once", () => {
  const c = clock();
  const rooms = c.rooms();
  const hybrid = doc(tag("page", { blocks: { b1: { text: "hi" } } }), tag("notes", { text: "" }));
  const yjs = doc(tag("page", { v: 1, y: { root: "abc" } }));
  const room = rooms.open("/p.html", hybrid, { nodeId: "n1" });

  const baseline = pageBaseline(inspectPage(hybrid).tags);
  const token = rooms.reservePage("/p.html", {
    nodeId: "n1",
    header: `v1; source=room; base=${baseline}; epoch=${room.epoch}`,
    currentHtml: hybrid,
    html: yjs,
    ifMatch: documentEtag(hybrid),
  });
  expect(rooms.pageReserved("/p.html")).toBe(true);
  counts.pages += 1;

  expect(rooms.apply(room, "A", { name: "page", n: 1, ops: [{ op: "set", path: ["y", "root"], value: "abc" }] }))
    .toEqual({ error: "page-converting" });
  counts.refused += 1;

  const first = rooms.commitPage(token);
  expect(first.valueChanged).toBe(true);
  expect(rooms.commitPage(token)).toBe(first);
  expect(room.pageTransition.format).toBe("yjs");
  expect(room.stores.get("page").value).toEqual({ v: 1, y: { root: "abc" } });
  expect(rooms.releasePage(token)).toBe(true);
  expect(rooms.releasePage(token)).toBe(false);
  expect(rooms.pageReserved("/p.html")).toBe(false);
});

test("an ordinary non-page frame still applies during a page-only reservation", () => {
  const c = clock();
  const rooms = c.rooms();
  const hybrid = doc(tag("page", { blocks: { b1: { text: "hi" } } }), tag("notes", { text: "" }));
  const yjs = doc(tag("page", { v: 1, y: { root: "abc" } }));
  const room = rooms.open("/p.html", hybrid, { nodeId: "n1" });

  rooms.reservePage("/p.html", {
    nodeId: "n1",
    header: `v1; source=room; base=${pageBaseline(inspectPage(hybrid).tags)}; epoch=${room.epoch}`,
    currentHtml: hybrid,
    html: yjs,
    ifMatch: documentEtag(hybrid),
  });

  const accepted = rooms.apply(room, "A", { name: "notes", n: 1, ops: [{ op: "set", path: ["text"], value: "hi" }] });
  expect(accepted.seq).toBe(1);
  expect(room.stores.get("notes").value).toEqual({ text: "hi" });
  counts.accepted += 1;
});

test("reconciles a stamped saved capture while a later operation exists", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", doc(tag("game", { score: 0 })), { nodeId: "n1" });

  rooms.apply(room, "A", addScore(1));
  counts.accepted += 1;
  const capture = doc(tag("game", { score: 1 }, { at: stampOf(room.epoch, 1, serializeLive({ score: 1 })) }));

  const first = rooms.fileWritten("/a.html", capture);
  expect(first.valueChanged).toBe(false);
  expect(first.landed).toEqual(["game"]);
  expect(room.stores.get("game").value).toEqual({ score: 1 });
  expect(room.stores.get("game").landed).toBe(1);

  rooms.apply(room, "A", addScore(2));
  counts.accepted += 1;
  expect(room.stores.get("game").value).toEqual({ score: 2 });

  const second = rooms.fileWritten("/a.html", capture);
  expect(second).toBeNull();
  expect(room.stores.get("game").value).toEqual({ score: 2 });
  expect(room.stores.get("game").last).toBe(2);
  expect(room.stores.get("game").landed).toBe(1);
  expect(room.stores.get("game").log.filter((entry) => entry.seq === 2)).toHaveLength(1);

  const newer = doc(tag("game", { score: 2 }, { at: stampOf(room.epoch, 2, serializeLive({ score: 2 })) }));
  const third = rooms.fileWritten("/a.html", newer);
  expect(third.valueChanged).toBe(false);
  expect(third.landed).toEqual(["game"]);
  expect(room.stores.get("game").landed).toBe(2);

  const state = rooms.state(room, "A");
  expect(state.stores.game.value).toEqual({ score: 2 });
  expect(state.stores.game.landed).toBe(2);
  expect(state.stores.game.last).toBe(2);
  expect(state.stores.game.seen).toEqual({ A: 2 });
  expect(state.seq).toBe(2);
});

test("drop, reset and sweep keep the room contract's epochs, state and accounting", () => {
  const c = clock();
  const rooms = c.rooms();
  const html = doc(tag("game", { score: 0 }));
  const room = rooms.open("/a.html", html, { nodeId: "n1" });
  const openUsed = rooms.used();
  expect(openUsed).toBeGreaterThan(0);

  rooms.drop("/a.html");
  counts.drops += 1;
  expect(rooms.get("/a.html")).toBeNull();
  expect(rooms.size()).toBe(0);
  expect(rooms.used()).toBe(0);

  const reopened = rooms.open("/a.html", html, { nodeId: "n1" });
  expect(reopened.epoch).toBe("e2");
  expect(rooms.used()).toBe(openUsed);

  const reset = rooms.reset("/a.html", doc(tag("game", { score: 9 })), { nodeId: "n1" });
  counts.resets += 1;
  expect(reset.epoch).toBe("e3");
  expect(reset.seq).toBe(0);
  expect(reset.stores.get("game").value).toEqual({ score: 9 });
  expect(rooms.used()).toBe(openUsed);

  rooms.leave(reset, "A", []);
  expect(reset.emptySince).toBe(c.state.now);
  c.state.now += LIVE_LIMITS.retainMs;
  rooms.sweep();
  counts.sweeps += 1;
  expect(rooms.get("/a.html")).toBeNull();
  expect(rooms.used()).toBe(0);
});

test("the typed errors are single exported classes", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/p.html", doc(tag("page", { blocks: {} })), { nodeId: "n1" });
  let thrown = null;
  try {
    rooms.reservePage("/p.html", {
      nodeId: "n1",
      header: "v1; source=file; base=not-a-baseline",
      currentHtml: doc(tag("page", { blocks: {} })),
      html: doc(tag("page", { v: 1, y: { root: "abc" } })),
      ifMatch: "nope",
    });
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(PageConversionError);
  expect(thrown).toBeInstanceOf(ConversionFromModule);
  expect(PageConversionError).toBe(ConversionFromModule);
  expect(PageFormatError).toBe(FormatFromModule);
  expect(PersistentReservationError).toBe(PersistentFromModule);
  expect(new PageFormatError()).toBeInstanceOf(Error);
  expect(new PersistentReservationError("budget")).toMatchObject({ name: "PersistentReservationError", code: "budget" });
  expect(room.stores.has("page")).toBe(true);
});

afterAll(() => {
  process.stdout.write(`rooms-export counts ${JSON.stringify(counts)}\n`);
  expect(counts.accepted).toBeGreaterThan(0);
  expect(counts.refused).toBeGreaterThan(0);
  expect(counts.duplicates).toBeGreaterThan(0);
});
