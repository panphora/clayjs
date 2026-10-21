/**
 * @jest-environment node
 */
import {
  createRooms,
  PersistentReservationError,
  PageConversionError,
  documentEtag,
  inspectPage,
  pageBaseline,
  serializeLive,
  stampOf,
  LIVE_LIMITS,
} from "../../../src/server/rooms/index.js";

const counts = { accepted: 0, refused: 0, duplicates: 0, checked: 0, written: 0, rekeyed: 0, released: 0 };

const tag = (name, value, { ephemeral = false, at = null } = {}) =>
  `<script type="application/json" merge="${name}" clay="live${ephemeral ? " ephemeral" : ""}"${at ? ` live-at="${at}"` : ""}>${typeof value === "string" ? value : JSON.stringify(value)}</script>`;
const doc = (...parts) => `<!doctype html><html><body>${parts.join("")}</body></html>`;
const DOC = doc(tag("game", { score: 0 }), tag("lobby", { cursors: {} }, { ephemeral: true }));
const BIG = doc(tag("game", { score: 1000 }), tag("lobby", { cursors: {} }, { ephemeral: true }));

const clock = () => {
  const state = { now: 1_000_000, epoch: 0 };
  return { state, rooms: (options = {}) => createRooms({ now: () => state.now, newEpoch: () => `e${++state.epoch}`, ...options }) };
};

const fakeWriter = () => {
  const calls = [];
  return {
    calls,
    write: (bytes) => {
      calls.push(bytes);
      return true;
    },
  };
};

const refusal = (run) => {
  try {
    run();
  } catch (err) {
    expect(err).toBeInstanceOf(PersistentReservationError);
    counts.refused += 1;
    return err.code;
  }
  throw new Error("expected a PersistentReservationError");
};

const pageHold = (rooms, key, nodeId) => {
  const hybrid = doc(tag("page", { blocks: { b1: { text: "hi" } } }), tag("notes", { text: "" }));
  const yjs = doc(tag("page", { v: 1, y: { root: "abc" } }));
  rooms.open(key, hybrid, { nodeId });
  return rooms.reservePage(key, {
    nodeId,
    header: `v1; source=room; base=${pageBaseline(inspectPage(hybrid).tags)}; epoch=${rooms.get(key).epoch}`,
    currentHtml: hybrid,
    html: yjs,
    ifMatch: documentEtag(hybrid),
  });
};

test("holds one room by key, then refuses the same key or the same node", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  rooms.open("/b.html", DOC, { nodeId: "n1" });

  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });
  expect(Object.isFrozen(token)).toBe(true);
  expect(Object.keys(token)).toEqual([]);
  expect(rooms.used()).toBe(50);

  expect(refusal(() => rooms.holdPersistent("/a.html", { nodeId: "n1" }))).toBe("checkpointing");
  expect(refusal(() => rooms.holdPersistent("/b.html", { nodeId: "n1" }))).toBe("checkpointing");
  expect(refusal(() => rooms.holdPersistent("/missing.html", { nodeId: "n1" }))).toBe("room-changed");
  expect(refusal(() => rooms.holdPersistent("/a.html", { nodeId: "n2" }))).toBe("room-changed");
  expect(refusal(() => rooms.holdPersistent("/a.html", {}))).toBe("room-changed");

  const next = doc(tag("game", { score: 1 }), tag("lobby", { cursors: {} }, { ephemeral: true }));
  expect(rooms.checkPersistent(token, { html: next })).toEqual({ html: next });
  counts.checked += 1;
  expect(rooms.releasePersistent(token)).toBe(true);
  counts.released += 1;
  expect(room.stores.get("game").value).toEqual({ score: 0 });
});

test("a page reservation and a persistent hold exclude each other both ways", () => {
  const first = clock();
  const pageRooms = first.rooms();
  const pageToken = pageHold(pageRooms, "/p.html", "n1");
  expect(refusal(() => pageRooms.holdPersistent("/p.html", { nodeId: "n1" }))).toBe("checkpointing");
  expect(pageRooms.pageReserved("/p.html")).toBe(true);

  const second = clock();
  const holdRooms = second.rooms();
  const room = holdRooms.open("/p.html", DOC, { nodeId: "n1" });
  holdRooms.holdPersistent("/p.html", { nodeId: "n1" });
  const hybrid = doc(tag("page", { blocks: { b1: { text: "hi" } } }), tag("notes", { text: "" }));
  let thrown = null;
  try {
    holdRooms.reservePage("/p.html", {
      nodeId: "n1",
      header: `v1; source=room; base=${pageBaseline(inspectPage(hybrid).tags)}; epoch=${room.epoch}`,
      currentHtml: hybrid,
      html: doc(tag("page", { v: 1, y: { root: "abc" } })),
      ifMatch: documentEtag(hybrid),
    });
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(PageConversionError);
  expect(thrown.reason).toBe("page-converting");
  expect(holdRooms.pageReserved("/p.html")).toBe(false);
  counts.refused += 1;
  expect(pageToken).toBeTruthy();
});

test("every frame is refused while held and the same frames land after release", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  const increment = (n) => ({ name: "game", n, ops: [{ op: "add", path: ["score"], n: 1 }] });

  expect(rooms.apply(room, "A", increment(1)).seq).toBe(1);
  counts.accepted += 1;
  const used = rooms.used();
  const receipts = room.lastN.size;
  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });

  expect(rooms.apply(room, "A", increment(2))).toEqual({ error: "checkpointing" });
  expect(rooms.apply(room, "A", { name: "lobby", n: 1, ops: [{ op: "set", path: ["cursors", "a"], value: 1 }] }))
    .toEqual({ error: "checkpointing" });
  expect(rooms.apply(room, "A", increment(1))).toEqual({ error: "checkpointing" });
  counts.refused += 3;
  expect(refusal(() => rooms.fileWritten("/a.html", DOC))).toBe("checkpointing");

  expect(room.seq).toBe(1);
  expect(room.stores.get("game").value).toEqual({ score: 1 });
  expect(room.stores.get("lobby").value).toEqual({ cursors: {} });
  expect(room.lastN.size).toBe(receipts);
  expect(rooms.used()).toBe(used);

  expect(rooms.releasePersistent(token)).toBe(true);
  counts.released += 1;
  expect(rooms.apply(room, "A", increment(2)).seq).toBe(2);
  counts.accepted += 1;
  expect(room.stores.get("game").value).toEqual({ score: 2 });
  expect(rooms.apply(room, "A", increment(1)).duplicate).toBe(true);
  counts.duplicates += 1;
  expect(room.stores.get("game").value).toEqual({ score: 2 });
});

test("touch and leave changes survive the held write", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  rooms.apply(room, "A", { name: "game", n: 1, ops: [{ op: "add", path: ["score"], n: 1 }] });
  counts.accepted += 1;

  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });
  expect(rooms.checkPersistent(token, { html: BIG })).toEqual({ html: BIG });
  counts.checked += 1;

  rooms.touch(room, "B");
  expect(rooms.leave(room, "A", ["B"])).toEqual({ writerChanged: true, writer: "B" });
  expect(rooms.leave(room, "C", [])).toEqual({ writerChanged: false, writer: "B" });
  const emptySince = room.emptySince;
  expect(emptySince).toBe(c.state.now);
  c.state.now += 5;

  expect(rooms.writtenPersistent(token, { html: BIG }).valueChanged).toBe(true);
  counts.written += 1;
  expect(room.writer).toBe("B");
  expect(room.seen.has("B")).toBe(true);
  expect(room.emptySince).toBe(emptySince);
  expect(room.stores.get("game").value).toEqual({ score: 1001 });
});

test("a checked capture reconciles the later increment exactly once", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", doc(tag("game", { count: 0 })), { nodeId: "n1" });
  const increment = (n) => ({ name: "game", n, ops: [{ op: "add", path: ["count"], n: 1 }] });
  rooms.apply(room, "A", increment(1));
  rooms.apply(room, "A", increment(2));
  counts.accepted += 2;
  expect(room.stores.get("game").value).toEqual({ count: 2 });

  const capture = doc(tag("game", { count: 1 }, { at: stampOf(room.epoch, 1, serializeLive({ count: 1 })) }));
  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });
  const used = rooms.used();
  expect(rooms.checkPersistent(token, { html: capture })).toEqual({ html: capture });
  counts.checked += 1;
  expect(rooms.used()).toBe(used);

  const epoch = room.epoch;
  const result = rooms.writtenPersistent(token, { html: capture });
  counts.written += 1;
  expect(result.valueChanged).toBe(false);
  expect(result.landed).toEqual(["game"]);
  expect(room.stores.get("game").value).toEqual({ count: 2 });
  expect(room.stores.get("game").last).toBe(2);
  expect(room.stores.get("game").landed).toBe(1);
  expect(room.stores.get("game").log.filter((entry) => entry.seq === 2)).toHaveLength(1);
  expect(room.seq).toBe(2);
  expect(room.epoch).toBe(epoch);
  expect(room.pageTransition).toBeUndefined();
  expect(rooms.used()).toBe(used);
  expect(rooms.releasePersistent(token)).toBe(true);
});

test("a checked candidate is bound by value, not by the caller's object", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });

  const options = { html: doc(tag("game", { score: 7 }), tag("lobby", { cursors: {} }, { ephemeral: true })) };
  const bound = options.html;
  const checked = rooms.checkPersistent(token, options);
  counts.checked += 1;
  expect(checked).toEqual({ html: bound });
  expect(Object.isFrozen(checked)).toBe(true);

  options.html = doc(tag("game", { score: 0 }), tag("lobby", { cursors: {} }, { ephemeral: true }));
  expect(refusal(() => rooms.writtenPersistent(token, { html: options.html }))).toBe("not-prepared");
  expect(room.stores.get("game").value).toEqual({ score: 0 });

  expect(rooms.writtenPersistent(token, { html: bound }).valueChanged).toBe(true);
  counts.written += 1;
  expect(room.stores.get("game").value).toEqual({ score: 7 });
});

test("a missing, duplicate, malformed, oversized or wrong-type tag is refused before the writer runs", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });
  const writer = fakeWriter();
  const used = rooms.used();
  const attempt = (html) => {
    try {
      rooms.checkPersistent(token, { html });
    } catch (err) {
      expect(err).toBeInstanceOf(PersistentReservationError);
      counts.refused += 1;
      return err.code;
    }
    writer.write(html);
    counts.checked += 1;
    return null;
  };

  expect(attempt(doc(tag("lobby", { cursors: {} }, { ephemeral: true })))).toBe("invalid-target");
  expect(attempt(doc(tag("game", { score: 1 }), tag("game", { score: 2 }), tag("lobby", { cursors: {} }, { ephemeral: true })))).toBe("invalid-target");
  expect(attempt(doc(tag("game", "{not json"), tag("lobby", { cursors: {} }, { ephemeral: true })))).toBe("invalid-target");
  expect(attempt(doc(tag("game", [1, 2]), tag("lobby", { cursors: {} }, { ephemeral: true })))).toBe("invalid-target");
  expect(attempt(doc(tag("game", { score: 1 }), tag("notes", { text: "" }), tag("lobby", { cursors: {} }, { ephemeral: true })))).toBe("invalid-target");
  expect(attempt(doc(tag("game", { score: 1 }, { ephemeral: true }), tag("lobby", { cursors: {} }, { ephemeral: true })))).toBe("invalid-target");
  expect(attempt(doc(tag("game", { score: "y".repeat(LIVE_LIMITS.storeBytes + 1) }), tag("lobby", { cursors: {} }, { ephemeral: true })))).toBe("budget");

  expect(writer.calls).toEqual([]);
  expect(rooms.used()).toBe(used);
  expect(room.stores.get("game").value).toEqual({ score: 0 });
  expect(room.seq).toBe(0);

  expect(attempt(BIG)).toBeNull();
  expect(writer.calls).toEqual([BIG]);
});

test("a checked Yjs page keeps its stored generation", () => {
  const c = clock();
  const rooms = c.rooms();
  const initial = doc(tag("page", { v: 1, g: 0, y: { seed: "opaque" } }));
  const room = rooms.open("/page.html", initial, { nodeId: "np" });
  const token = rooms.holdPersistent("/page.html", { nodeId: "np" });
  const used = rooms.used();

  expect(refusal(() => rooms.checkPersistent(token, {
    html: doc(tag("page", { v: 1, g: 1, y: { seed: "opaque" } })),
  }))).toBe("invalid-target");
  expect(room.stores.get("page").value.g).toBe(0);
  expect(rooms.used()).toBe(used);
  expect(rooms.checkPersistent(token, { html: initial })).toEqual({ html: initial });
  counts.checked += 1;
  expect(rooms.releasePersistent(token)).toBe(true);
  counts.released += 1;
});

test("a candidate that fits the room but not liveBytes is refused, and release restores admission", () => {
  const c = clock();
  const rooms = c.rooms({ liveBytes: 66 });
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  expect(rooms.used()).toBe(25);

  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });
  expect(refusal(() => rooms.checkPersistent(token, { html: BIG }))).toBe("budget");
  expect(rooms.used()).toBe(25);
  expect(room.stores.get("game").value).toEqual({ score: 0 });

  expect(rooms.releasePersistent(token)).toBe(true);
  counts.released += 1;
  expect(rooms.apply(room, "A", { name: "game", n: 1, ops: [{ op: "set", path: ["score"], value: 1 }] }).seq).toBe(1);
  counts.accepted += 1;
  expect(rooms.used()).toBe(66);
});

test("the preclaim and refund move used by exactly the projected bytes", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  expect(rooms.used()).toBe(25);

  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });
  expect(rooms.used()).toBe(25);
  expect(rooms.checkPersistent(token, { html: BIG })).toEqual({ html: BIG });
  counts.checked += 1;
  expect(rooms.used()).toBe(72);

  expect(rooms.writtenPersistent(token, { html: BIG }).valueChanged).toBe(true);
  counts.written += 1;
  expect(rooms.used()).toBe(72);
  expect(room.stores.get("game").bytes).toBe(14);
  expect(room.stores.get("game").logBytes).toBe(44);

  expect(rooms.releasePersistent(token)).toBe(true);
  counts.released += 1;
  expect(rooms.used()).toBe(72);
});

test("a failed disk write followed by release publishes nothing and refunds everything", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });
  const writer = fakeWriter();

  expect(rooms.checkPersistent(token, { html: BIG })).toEqual({ html: BIG });
  counts.checked += 1;
  expect(rooms.used()).toBe(72);

  expect(writer.calls).toEqual([]);
  expect(rooms.releasePersistent(token)).toBe(true);
  counts.released += 1;
  expect(rooms.used()).toBe(25);
  expect(room.stores.get("game").value).toEqual({ score: 0 });
  expect(room.seq).toBe(0);
  expect(room.stores.get("game").logBytes).toBe(0);
});

test("written twice returns one result, release twice returns true then false", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });
  rooms.checkPersistent(token, { html: BIG });
  counts.checked += 1;

  const result = rooms.writtenPersistent(token, { html: BIG });
  counts.written += 1;
  expect(result.valueChanged).toBe(true);
  expect(rooms.writtenPersistent(token, { html: BIG })).toBe(result);
  expect(room.seq).toBe(1);
  expect(rooms.used()).toBe(72);

  expect(rooms.releasePersistent(token)).toBe(true);
  counts.released += 1;
  expect(rooms.releasePersistent(token)).toBe(false);
  expect(refusal(() => rooms.writtenPersistent(token, { html: BIG }))).toBe("invalid-reservation");

  const plain = c.rooms();
  const untouched = plain.open("/b.html", DOC, { nodeId: "n2" });
  const unchanged = plain.holdPersistent("/b.html", { nodeId: "n2" });
  expect(plain.checkPersistent(unchanged, { html: DOC })).toEqual({ html: DOC });
  counts.checked += 1;
  expect(plain.writtenPersistent(unchanged, { html: DOC })).toBeNull();
  counts.written += 1;
  expect(plain.writtenPersistent(unchanged, { html: DOC })).toBeNull();
  expect(untouched.seq).toBe(0);
  expect(untouched.stores.get("game").value).toEqual({ score: 0 });
  expect(plain.used()).toBe(25);
  expect(plain.releasePersistent(unchanged)).toBe(true);
});

test("drop, sweep, reset and open cannot take a held room, and the drop waits for release", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });
  const replacement = doc(tag("game", { score: 9 }));

  rooms.drop("/a.html");
  counts.refused += 1;
  expect(rooms.get("/a.html")).toBe(room);
  expect(rooms.reset("/a.html", replacement, { nodeId: "n1" })).toBeNull();
  expect(rooms.open("/a.html", replacement, { nodeId: "n1" })).toBe(room);

  rooms.leave(room, "A", []);
  c.state.now += LIVE_LIMITS.retainMs;
  rooms.sweep();
  expect(rooms.get("/a.html")).toBe(room);
  expect(rooms.used()).toBe(25);

  expect(rooms.releasePersistent(token)).toBe(true);
  counts.released += 1;
  expect(rooms.get("/a.html")).toBeNull();
  expect(rooms.size()).toBe(0);
  expect(rooms.used()).toBe(0);
});

test("two sequential rekeys keep both rooms' identity, receipts and values", () => {
  const c = clock();
  const rooms = c.rooms();
  const a = rooms.open("/folder/a.html", DOC, { nodeId: "na" });
  const b = rooms.open("/folder/b.html", DOC, { nodeId: "nb" });
  rooms.apply(a, "A", { name: "game", n: 1, ops: [{ op: "add", path: ["score"], n: 1 }] });
  rooms.apply(b, "B", { name: "game", n: 1, ops: [{ op: "set", path: ["score"], value: 4 }] });
  counts.accepted += 2;
  const tokenA = rooms.holdPersistent("/folder/a.html", { nodeId: "na" });
  const tokenB = rooms.holdPersistent("/folder/b.html", { nodeId: "nb" });

  expect(refusal(() => rooms.rekeyPersistent(tokenA, "/folder/a.html"))).toBe("invalid-target");
  expect(refusal(() => rooms.rekeyPersistent(tokenA, ""))).toBe("invalid-target");
  expect(refusal(() => rooms.rekeyPersistent(tokenA, "/folder/b.html"))).toBe("destination-exists");
  const currentHtml = doc(tag("notes", { text: "" }));
  const pageToken = rooms.reservePageInitial("/reserved.html", {
    nodeId: "page-node",
    currentHtml,
    html: doc(tag("page", { v: 1, g: 0, y: { seed: "opaque" } })),
    ifMatch: documentEtag(currentHtml),
  });
  expect(refusal(() => rooms.rekeyPersistent(tokenA, "/reserved.html"))).toBe("destination-exists");
  expect(rooms.releasePage(pageToken)).toBe(true);
  expect(a.key).toBe("/folder/a.html");

  rooms.rekeyPersistent(tokenA, "/moved/a.html");
  rooms.rekeyPersistent(tokenB, "/moved/b.html");
  counts.rekeyed += 2;

  expect(rooms.get("/folder/a.html")).toBeNull();
  expect(rooms.get("/folder/b.html")).toBeNull();
  expect(rooms.get("/moved/a.html")).toBe(a);
  expect(rooms.get("/moved/b.html")).toBe(b);
  expect(a.key).toBe("/moved/a.html");
  expect(b.key).toBe("/moved/b.html");
  expect(a.nodeId).toBe("na");
  expect(b.nodeId).toBe("nb");
  expect(a.epoch).toBe("e1");
  expect(a.seq).toBe(1);
  expect(b.seq).toBe(1);
  expect(a.stores.get("game").value).toEqual({ score: 1 });
  expect(b.stores.get("game").value).toEqual({ score: 4 });
  expect(a.lastN.size).toBe(1);
  expect(b.lastN.size).toBe(1);
  expect(a.writer).toBe("A");
  expect(b.writer).toBe("B");

  const next = doc(tag("game", { score: 5 }), tag("lobby", { cursors: {} }, { ephemeral: true }));
  expect(rooms.checkPersistent(tokenA, { html: next })).toEqual({ html: next });
  counts.checked += 1;
  expect(rooms.writtenPersistent(tokenA, { html: next }).valueChanged).toBe(true);
  counts.written += 1;
  expect(rooms.releasePersistent(tokenA)).toBe(true);
  expect(rooms.releasePersistent(tokenB)).toBe(true);
});

test("an occupant moved aside rekeys in rename order, and a failed second rename only moves the occupant", () => {
  const c = clock();
  const rooms = c.rooms();
  const a = rooms.open("/f/a.html", DOC, { nodeId: "na" });
  const b = rooms.open("/f/b.html", DOC, { nodeId: "nb" });
  const tokenA = rooms.holdPersistent("/f/a.html", { nodeId: "na" });
  const tokenB = rooms.holdPersistent("/f/b.html", { nodeId: "nb" });

  rooms.rekeyPersistent(tokenB, "/f/c.html");
  counts.rekeyed += 1;
  expect(rooms.get("/f/b.html")).toBeNull();
  expect(rooms.get("/f/c.html")).toBe(b);

  rooms.rekeyPersistent(tokenA, "/f/b.html");
  counts.rekeyed += 1;
  expect(rooms.get("/f/b.html")).toBe(a);
  expect(a.key).toBe("/f/b.html");
  expect(b.key).toBe("/f/c.html");
  expect(a.nodeId).toBe("na");
  expect(b.nodeId).toBe("nb");
  expect(rooms.releasePersistent(tokenA)).toBe(true);
  expect(rooms.releasePersistent(tokenB)).toBe(true);

  const failed = clock();
  const rooms2 = failed.rooms();
  const a2 = rooms2.open("/f/a.html", DOC, { nodeId: "na" });
  const b2 = rooms2.open("/f/b.html", DOC, { nodeId: "nb" });
  const tokenA2 = rooms2.holdPersistent("/f/a.html", { nodeId: "na" });
  const tokenB2 = rooms2.holdPersistent("/f/b.html", { nodeId: "nb" });
  rooms2.checkPersistent(tokenA2, { html: BIG });
  rooms2.checkPersistent(tokenB2, { html: BIG });
  rooms2.rekeyPersistent(tokenB2, "/f/c.html");
  counts.rekeyed += 1;
  expect(rooms2.releasePersistent(tokenA2)).toBe(true);
  expect(rooms2.releasePersistent(tokenB2)).toBe(true);
  counts.released += 2;
  expect(rooms2.get("/f/a.html")).toBe(a2);
  expect(rooms2.get("/f/b.html")).toBeNull();
  expect(rooms2.get("/f/c.html")).toBe(b2);
  expect(a2.stores.get("game").value).toEqual({ score: 0 });
  expect(b2.stores.get("game").value).toEqual({ score: 0 });
});

test("rekey clears an old budget refusal at its destination", () => {
  const c = clock();
  const rooms = c.rooms({ liveBytes: 50 });
  const room = rooms.open("/source.html", DOC, { nodeId: "n1" });
  expect(rooms.open("/target.html", doc(tag("game", { blob: "x".repeat(50) })))).toBeNull();
  expect(rooms.mayFit("/target.html")).toBe(false);

  const token = rooms.holdPersistent("/source.html", { nodeId: "n1" });
  rooms.rekeyPersistent(token, "/target.html");
  counts.rekeyed += 1;
  expect(rooms.get("/target.html")).toBe(room);
  expect(rooms.mayFit("/target.html")).toBe(true);
  expect(rooms.releasePersistent(token)).toBe(true);
  counts.released += 1;
});

test("forged, foreign and released tokens are invalid reservations", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });

  const forged = Object.freeze({});
  expect(refusal(() => rooms.checkPersistent(forged, { html: BIG }))).toBe("invalid-reservation");
  expect(refusal(() => rooms.writtenPersistent(forged, { html: BIG }))).toBe("invalid-reservation");
  expect(refusal(() => rooms.rekeyPersistent(forged, "/b.html"))).toBe("invalid-reservation");
  expect(refusal(() => rooms.releasePersistent(forged))).toBe("invalid-reservation");

  const foreign = clock();
  const foreignRooms = foreign.rooms();
  foreignRooms.open("/a.html", DOC, { nodeId: "n1" });
  const foreignToken = foreignRooms.holdPersistent("/a.html", { nodeId: "n1" });
  expect(refusal(() => rooms.checkPersistent(foreignToken, { html: BIG }))).toBe("invalid-reservation");
  expect(refusal(() => rooms.releasePersistent(foreignToken))).toBe("invalid-reservation");

  expect(rooms.releasePersistent(token)).toBe(true);
  counts.released += 1;
  expect(rooms.releasePersistent(token)).toBe(false);
  expect(refusal(() => rooms.checkPersistent(token, { html: BIG }))).toBe("invalid-reservation");
  expect(refusal(() => rooms.writtenPersistent(token, { html: BIG }))).toBe("invalid-reservation");
  expect(refusal(() => rooms.rekeyPersistent(token, "/b.html"))).toBe("invalid-reservation");
  expect(room.stores.get("game").value).toEqual({ score: 0 });
  expect(room.key).toBe("/a.html");
});

test("requireClean holds only a landed room and an unheld fileWritten keeps its parity", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = rooms.open("/a.html", DOC, { nodeId: "n1" });
  rooms.apply(room, "A", { name: "game", n: 1, ops: [{ op: "add", path: ["score"], n: 1 }] });
  counts.accepted += 1;
  expect(refusal(() => rooms.holdPersistent("/a.html", { nodeId: "n1", requireClean: true }))).toBe("unlanded");

  const capture = doc(tag("game", { score: 1 }, { at: stampOf(room.epoch, 1, serializeLive({ score: 1 })) }));
  expect(rooms.fileWritten("/a.html", capture).landed).toEqual(["game"]);
  expect(room.stores.get("game").landed).toBe(room.stores.get("game").last);

  rooms.apply(room, "A", { name: "lobby", n: 1, ops: [{ op: "set", path: ["cursors", "a"], value: 1 }] });
  counts.accepted += 1;
  const token = rooms.holdPersistent("/a.html", { nodeId: "n1", requireClean: true });
  expect(Object.isFrozen(token)).toBe(true);
  expect(rooms.releasePersistent(token)).toBe(true);

  expect(rooms.fileWritten("/nowhere.html", capture)).toBeNull();
  const outside = doc(tag("game", { score: 8 }), tag("lobby", { cursors: {} }, { ephemeral: true }));
  const saved = rooms.fileWritten("/a.html", outside);
  expect(saved.valueChanged).toBe(true);
  expect(saved.landed).toEqual(["game"]);
  expect(saved.room).toBe(room);
  expect(room.stores.get("game").value).toEqual({ score: 8 });
  expect(room.stores.get("game").landed).toBe(room.seq);
});

afterAll(() => {
  process.stdout.write(`persistent-reservation counts ${JSON.stringify(counts)}\n`);
  expect(counts.accepted).toBeGreaterThan(0);
  expect(counts.refused).toBeGreaterThan(0);
  expect(counts.checked).toBeGreaterThan(0);
  expect(counts.written).toBeGreaterThan(0);
  expect(counts.rekeyed).toBeGreaterThan(0);
  expect(counts.released).toBeGreaterThan(0);
});
