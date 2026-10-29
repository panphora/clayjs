/**
 * Scenario: a compacting room with no room left.
 *
 * The room's value in these tests is a stand-in: a store holds this tab's frames until
 * the room confirms them, and the "room" is a page value the store's local ops are
 * copied into. A refusal is delivered the way the lane delivers one, and the pending
 * ops of that frame are dropped the way the lane drops them. What the binding must do
 * with a room that will not take more input: ask for one checkpoint of what the room
 * did admit, tell the page, and never report a leave as made while this tab's edits
 * are still waiting in the provider's outbox.
 */

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { createYPageBinding, seedValue } from "../../../../src/page/ybind/index.js";

const BLOCKS = () => [{ id: "p", text: "hello" }];
const COMPACTION = { v: 1, loose: 32, activeBytes: 1024 };
const clone = (value) => JSON.parse(JSON.stringify(value));
const textOf = (ydoc) => ydoc.getText("flow").toString();

let pendingSources;
beforeEach(() => { pendingSources = []; });

const register = (def) => {
  pendingSources.push(def);
  return { changed() {}, dispose() {} };
};
const livePending = () => pendingSources[pendingSources.length - 1].isPending();

const open = ({ requestCheckpoint = null, requestExitCheckpoint = null, onStopped = () => {} } = {}) => {
  const value = seedValue(BLOCKS());
  const store = createStore({ name: "page", value: clone(value) });
  const ydoc = new Y.Doc();
  ydoc.clientID = 5;
  const room = { value: clone(value) };
  const ops = [];
  store.onLocal((batch) => {
    for (const op of batch) {
      ops.push(op);
      if (op.path.length !== 2 || op.path[0] !== "y") continue;
      if (op.op === "set") room.value.y[op.path[1]] = op.value;
      else if (op.op === "del") delete room.value.y[op.path[1]];
    }
  });
  const timers = { setTimer: () => 1, clearTimer: () => {} };
  const binding = createYPageBinding({
    store,
    ydoc,
    ...timers,
    requestCheckpoint,
    requestExitCheckpoint,
    onStopped,
    registerUnsavedState: register,
  });
  const rebaseRoom = (extra = {}) => {
    store.setMode("fast");
    return store.rebase(clone(room.value), { source: "state", room: { compaction: COMPACTION }, ...extra });
  };
  const enter = () => rebaseRoom();
  const ack = () => rebaseRoom({ confirmed: store.pending.length });
  const refuse = (code) => {
    store.deliver({ phase: "refused", code });
    store.rebase(clone(room.value), { source: "state", cause: "refused", drop: [0, Number.MAX_SAFE_INTEGER] });
  };
  const type = (text) => { ydoc.getText("flow").insert(0, text); };
  return { store, ydoc, binding, room, ops, enter, ack, refuse, type };
};
const after = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const keys = (store) => Object.keys(store.value.y).sort();

test("a flush waits for the outbox's frames before it reports ok", async () => {
  const checkpoints = [];
  const h = open({ requestCheckpoint: (options) => { checkpoints.push(options); return Promise.resolve({ ok: true }); } });
  h.enter();
  h.type("a");
  expect(h.store.pending).toHaveLength(1);
  expect(h.binding.provider.pending).toBe(false);

  let settled = null;
  const flushed = h.binding.flush({ timeoutMs: 10_000 }).then((result) => { settled = result; return result; });
  await after();
  expect(settled).toBe(null);
  expect(checkpoints).toHaveLength(0);

  h.ack();
  await expect(flushed).resolves.toEqual({ ok: true });
  expect(checkpoints).toHaveLength(1);
  expect(checkpoints[0].timeoutMs).toBeGreaterThan(0);
  expect(h.store.pending).toHaveLength(0);
});

test("an exit flush with an unadmitted outbox reports not ok", async () => {
  const h = open();
  h.enter();
  h.type("a");
  h.type("b");
  h.refuse("page-full");

  expect(h.store.pending).toHaveLength(0);
  expect(h.binding.provider.pending).toBe(true);
  expect(livePending()).toBe(true);

  await expect(h.binding.flush({ permit: { id: "exit" }, timeoutMs: 0 })).resolves.toEqual({ ok: false, code: "timeout" });
  expect(textOf(h.ydoc)).toBe("bahello");
});

test.each(["page-full", "compaction-failed"])("a %s refusal asks for one checkpoint and then stops the page", async (code) => {
  const checkpoints = [];
  const stopped = [];
  const h = open({
    requestCheckpoint: (options) => { checkpoints.push(options); return Promise.resolve({ ok: true }); },
    onStopped: (reason) => stopped.push(reason),
  });
  h.enter();
  h.type("a");

  h.store.deliver({ phase: "refused", code });
  await after();
  expect(stopped).toEqual([code]);
  expect(checkpoints).toEqual([{ timeoutMs: 10_000 }]);
  expect(h.binding.provider.stopped).toBe(code);
  expect(textOf(h.ydoc)).toBe("ahello");
});

test("a full page checkpoints what the room admitted before it locks the page", async () => {
  const order = [];
  let settle;
  const checkpoint = new Promise((resolve) => { settle = resolve; });
  const h = open({
    requestCheckpoint: () => { order.push("checkpoint"); return checkpoint; },
    onStopped: (reason) => order.push(`stopped:${reason}`),
  });
  h.enter();
  h.type("a");

  h.store.deliver({ phase: "refused", code: "page-full" });
  await after();
  // The checkpoint of what the room did admit is on its way, and the page is not
  // locked yet: a save it holds would otherwise cover nothing of this tab's work.
  expect(order).toEqual(["checkpoint"]);

  settle({ ok: true });
  await after();
  expect(order).toEqual(["checkpoint", "stopped:page-full"]);
  expect(h.binding.provider.stopped).toBe("page-full");
});

test("a refusal that is not about capacity neither checkpoints nor stops the page", async () => {
  const checkpoints = [];
  const stopped = [];
  const h = open({
    requestCheckpoint: (options) => { checkpoints.push(options); return Promise.resolve({ ok: true }); },
    onStopped: (reason) => stopped.push(reason),
  });
  h.enter();
  h.type("a");
  h.store.deliver({ phase: "refused", code: "page-immutable" });
  await after();
  expect(stopped).toEqual([]);
  expect(checkpoints).toEqual([]);
  expect(h.binding.provider.stopped).toBe(null);
});

test("a blocked page keeps every character typed and writes no further frame", () => {
  const h = open();
  h.enter();
  for (const text of ["a", "b", "c"]) h.type(text);
  expect(Object.keys(h.store.value.y).filter((key) => key[0] === "u")).toHaveLength(1);
  expect(h.binding.provider.pending).toBe(true);

  h.refuse("page-full");
  const afterRefusal = keys(h.store);
  const value = clone(h.store.value);

  h.type("d");
  h.type("e");
  expect(keys(h.store)).toEqual(afterRefusal);
  expect(h.store.value).toEqual(value);
  expect(h.store.pending).toHaveLength(0);
  expect(Object.keys(h.store.value.y).some((key) => key.includes("."))).toBe(false);
  expect(h.ops.every((op) => op.op === "set" && op.path.length === 2 && op.path[0] === "y")).toBe(true);
  expect(textOf(h.ydoc)).toBe("edcbahello");
  expect(livePending()).toBe(true);
});
