import { jest } from "@jest/globals";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { createFastLane } from "../../../../src/live/fast-lane.js";
import { createYProvider, dec, enc } from "../../../../src/page/ybind/provider.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { seedValue } from "../../../../src/page/ybind/seed.js";

/**
 * The real local tab lane carrying the Yjs page value: three tabs over one
 * page converge on the same text with nothing pending, and when the sequencer
 * leaves another tab takes over and keeps converging.
 */

const KEY = "clay-live:/lab.html";
let channels;
let locks;

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

function fakeLocks() {
  const queue = [];
  let held = false;
  async function grant() {
    if (held || !queue.length) return;
    held = true;
    const { callback, resolve } = queue.shift();
    const result = await callback({ name: KEY });
    held = false;
    resolve(result);
    grant();
  }
  return {
    request(name, callback) {
      return new Promise((resolve) => {
        queue.push({ callback, resolve });
        Promise.resolve().then(grant);
      });
    },
  };
}

let localTransport;
let tabs;

beforeAll(async () => {
  global.BroadcastChannel = FakeChannel;
  ({ localTransport } = await import("../../../../src/live/local-lane.js"));
});

beforeEach(() => {
  jest.useFakeTimers();
  channels = [];
  locks = fakeLocks();
  tabs = [];
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
});

afterEach(() => {
  for (const t of tabs) t.lane.stop();
  tabs = [];
  jest.useRealTimers();
});

const initial = seedValue([{ id: "p", text: "hello" }, { id: "q", text: "world" }]);

function tab(client) {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(initial)) });
  const entries = new Map([["page", { store }]]);
  const seed = () => new Map([["page", { value: store.authoritative, ephemeral: false, text: JSON.stringify(initial) }]]);
  const transport = localTransport({ seed, key: KEY });
  const lane = createFastLane({ transport, entries });
  store.onLocal((ops) => lane.local("page", ops, store.mark));
  const ydoc = new Y.Doc();
  ydoc.clientID = client;
  for (const k of Object.keys(initial.y).sort()) Y.applyUpdateV2(ydoc, dec(initial.y[k]), NET);
  const provider = createYProvider({ store, ydoc });
  lane.start();
  const t = { store, lane, ydoc, provider, transport, flow: ydoc.getText("flow"), channel: channels.at(-1) };
  tabs.push(t);
  return t;
}

const settle = (ms = 3000) => jest.advanceTimersByTimeAsync(ms);
const text = (t) => t.flow.toString().replace(/[^\x20-\x7e\ufffc]/g, "");

function crash(t) {
  t.channel.closed = true;
  t.channel.postMessage = () => {};
  t.lane.stop();
}

test("three tabs over one page converge on the same text", async () => {
  const a = tab(11);
  await settle();
  const b = tab(12);
  const c = tab(13);
  await settle();
  expect(a.transport.isSequencer).toBe(true);
  expect(b.store.handle.status.mode).toBe("fast");

  a.flow.insert(3, "AAA");
  b.flow.insert(9, "BBB");
  c.flow.insert(1, "C");
  b.flow.insert(4, "bb");
  await settle();

  expect(text(a)).toBe("CheAAAlbblowoBBBrld");
  expect(text(b)).toBe(text(a));
  expect(text(c)).toBe(text(a));
  expect(a.store.pending.length).toBe(0);
  expect(b.store.pending.length).toBe(0);
  expect(c.store.pending.length).toBe(0);
});

test("when the sequencer leaves, another tab takes over and edits converge", async () => {
  const a = tab(11);
  await settle();
  const b = tab(12);
  const c = tab(13);
  await settle();
  a.flow.insert(3, "AAA");
  b.flow.insert(9, "BBB");
  c.flow.insert(1, "C");
  b.flow.insert(4, "bb");
  await settle();

  crash(a);
  await settle(5000);
  b.flow.insert(2, "Z");
  c.flow.insert(5, "Y");
  await settle();

  expect(b.transport.isSequencer).toBe(true);
  expect(text(b)).toBe(text(c));
  expect(text(b)).toContain("Z");
  expect(text(b)).toContain("Y");
  expect(b.store.pending.length).toBe(0);
  expect(c.store.pending.length).toBe(0);
});
