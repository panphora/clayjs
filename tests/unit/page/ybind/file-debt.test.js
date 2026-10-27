/**
 * Scenario: what this tab owes the file, and what proves it paid.
 *
 * The record is this tab's own Yjs input, merged, until accepted page bytes carry every
 * insertion and deletion in it. Peer traffic, a room acknowledgement and a compaction are
 * not this tab's input, and an older or malformed save proves nothing. Outside an exit the
 * record never holds anything; inside one it is the page that names what is still owed.
 */

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, enc, NET, docFromValue } from "../../../../src/page/ybind/index.js";
import { createPageFileDebt } from "../../../../src/page/ybind/file-debt.js";
import { acceptedPageState, articleOfPageState } from "../../../../src/page/save-projection.js";

const BLOCKS = () => [{ id: "p", text: "hello" }, { id: "q", text: "world" }];
const clone = (value) => JSON.parse(JSON.stringify(value));
const textOf = (value) => {
  const doc = docFromValue(value);
  const text = doc.getText("flow").toString();
  doc.destroy();
  return text;
};

let tabs, pendingSources, exitHeld, frame;
beforeEach(() => {
  tabs = [];
  pendingSources = [];
  exitHeld = false;
  frame = 0;
});
afterEach(() => {
  for (const tab of tabs) {
    tab.view?.destroy();
    tab.binding.dispose();
    tab.binding.ydoc.destroy();
  }
});

const register = (def) => {
  pendingSources.push(def);
  return { changed() {}, dispose() {} };
};
const livePending = () => pendingSources[pendingSources.length - 1].isPending();

const open = ({ value = seedValue(BLOCKS()), journal = null, compact = undefined, view = true, ...extra } = {}) => {
  const store = createStore({ name: "page", value: clone(value) });
  const binding = createYPageBinding({
    store,
    setTimer: () => 1,
    clearTimer: () => {},
    registerUnsavedState: register,
    exitClosed: () => exitHeld,
    journal,
    ...(compact ? { compact } : {}),
    ...extra,
  });
  const tab = { store, binding, pd: binding.pd, view: null };
  if (view) {
    tab.view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), {
      state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
      dispatchTransaction: (tr) => binding.dispatch(tr),
    });
    binding.attach(tab.view);
  }
  tabs.push(tab);
  return tab;
};
const type = (tab, text, pos = tab.view.state.doc.content.size - 1) => {
  tab.view.dispatch(tab.view.state.tr.insertText(text, pos));
};
const peer = (tab) => {
  const doc = new Y.Doc();
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(tab.binding.ydoc));
  return doc;
};
const deliver = (from, to) => {
  const key = `peer-${++frame}`;
  const value = enc(Y.encodeStateAsUpdateV2(from, Y.encodeStateVector(to.binding.ydoc)));
  const base = to.store.authoritative;
  to.store.rebase({ ...base, y: { ...base.y, [key]: value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", key], value }] } });
};
const peerTypes = (tab, text) => {
  const other = peer(tab);
  other.getText("flow").insert(0, text);
  Y.applyUpdateV2(tab.binding.ydoc, Y.encodeStateAsUpdateV2(other), NET);
  other.destroy();
};
const acknowledge = (tab) => {
  tab.store.rebase(clone(tab.store.value), { source: "remote", confirmed: tab.store.pending.length });
};
// The accepted bytes this tab would send now: one page state carrying its whole document.
const stateOf = (tab) => ({ v: 1, g: 0, y: { seed: enc(Y.encodeStateAsUpdateV2(tab.binding.ydoc)) } });
const acceptedHtml = (state) =>
  `<article data-page="1">${articleOfPageState(state)}</article><script type="application/json" merge="page" clay="live">${JSON.stringify(state)}</script>`;
const saving = (tab) => {
  const state = acceptedPageState(acceptedHtml(stateOf(tab)));
  expect(state).not.toBeNull();
  return tab.binding.acceptFile(state);
};

test("an own insert owes the file until accepted bytes carry it", () => {
  const tab = open();
  expect(tab.binding.filePending()).toBe(false);
  type(tab, "!");
  expect(tab.binding.filePending()).toBe(true);
  expect(saving(tab)).toBe(true);
  expect(tab.binding.filePending()).toBe(false);
  acknowledge(tab);
  expect(livePending()).toBe(false);
});

test("outside an exit the record never makes page:live pending", () => {
  const tab = open();
  type(tab, "!");
  acknowledge(tab);
  expect(tab.store.pending).toHaveLength(0);
  expect(tab.binding.filePending()).toBe(true);
  expect(livePending()).toBe(false);
  exitHeld = true;
  expect(livePending()).toBe(true);
});

test("a delete alone owes the file even though the state vector cannot see it", () => {
  const tab = open();
  const before = stateOf(tab);
  type(tab, "!");
  expect(saving(tab)).toBe(true);
  const after = stateOf(tab);
  tab.view.dispatch(tab.view.state.tr.delete(1, 2));
  expect(textOf(tab.store.value)).toBe("elloworld!");
  expect(tab.binding.filePending()).toBe(true);
  expect(tab.binding.acceptFile(acceptedPageState(acceptedHtml(after)))).toBe(false);
  expect(tab.binding.filePending()).toBe(true);
  expect(tab.binding.acceptFile(acceptedPageState(acceptedHtml(before)))).toBe(false);
  expect(tab.binding.filePending()).toBe(true);
  expect(saving(tab)).toBe(true);
  expect(tab.binding.filePending()).toBe(false);
});

test("undo and redo of this tab's own input are the same obligation", () => {
  const tab = open();
  type(tab, "!");
  expect(tab.binding.undo()).toBe(true);
  expect(textOf(tab.store.value)).toBe("helloworld");
  expect(tab.binding.filePending()).toBe(true);
  expect(saving(tab)).toBe(true);
  expect(tab.binding.redo()).toBe(true);
  expect(textOf(tab.store.value)).toBe("helloworld!");
  expect(tab.binding.filePending()).toBe(true);
  acknowledge(tab);
  expect(livePending()).toBe(false);
  expect(saving(tab)).toBe(true);
});

test("peer traffic owes nothing", () => {
  const tab = open();
  peerTypes(tab, "from-peer");
  expect(tab.binding.filePending()).toBe(false);
  exitHeld = true;
  expect(livePending()).toBe(false);
});

test("a compaction after peer traffic owes nothing", () => {
  const tab = open({ compact: { keys: 32, room: 4_000_000 } });
  type(tab, "own");
  expect(saving(tab)).toBe(true);
  acknowledge(tab);
  const other = peer(tab);
  for (let i = 0; i < 40; i++) {
    other.getText("flow").insert(0, "x");
    deliver(other, tab);
  }
  other.destroy();
  expect(tab.binding.provider.compact()).toBe(true);
  expect(tab.store.pending.length).toBeGreaterThan(0);
  expect(tab.binding.filePending()).toBe(false);
  acknowledge(tab);
  exitHeld = true;
  expect(livePending()).toBe(false);
});

test("a room acknowledgement with nothing pending still owes the file", () => {
  const tab = open();
  type(tab, "!");
  acknowledge(tab);
  expect(tab.store.pending).toHaveLength(0);
  expect(tab.binding.provider.reconcilePending).toBe(false);
  exitHeld = true;
  expect(livePending()).toBe(true);
  expect(saving(tab)).toBe(true);
});

test("a later edit before an older save answers keeps the obligation", () => {
  const tab = open();
  type(tab, "a");
  const older = acceptedPageState(acceptedHtml(stateOf(tab)));
  type(tab, "b");
  expect(tab.binding.acceptFile(older)).toBe(false);
  expect(tab.binding.filePending()).toBe(true);
  expect(saving(tab)).toBe(true);
  expect(tab.binding.filePending()).toBe(false);
});

test("an accepted article that disagrees with its tags proves nothing", () => {
  const tab = open();
  type(tab, "!");
  const state = stateOf(tab);
  const html = `<article data-page="1"><p>another article entirely</p></article><script type="application/json" merge="page" clay="live">${JSON.stringify(state)}</script>`;
  expect(acceptedPageState(html)).toBeNull();
  expect(tab.binding.filePending()).toBe(true);
  expect(saving(tab)).toBe(true);
});

test("missing and malformed accepted tags prove nothing", () => {
  const tab = open();
  type(tab, "!");
  expect(acceptedPageState(undefined)).toBeNull();
  expect(acceptedPageState("<article data-page=\"1\">no tag</article>")).toBeNull();
  expect(acceptedPageState("<article data-page=\"1\">x</article><script merge=\"page\" clay=\"live\">{oops")).toBeNull();
  expect(acceptedPageState("<article data-page=\"1\">x</article><script merge=\"page\" clay=\"live\">{\"v\":1}</script>")).toBeNull();
  // A decoding or coverage failure keeps the obligation.
  expect(tab.binding.acceptFile(null)).toBe(false);
  expect(tab.binding.acceptFile({ v: 1, g: 0, y: { seed: "not base64" } })).toBe(false);
  expect(tab.binding.acceptFile({ v: 1, g: 0, y: {} })).toBe(false);
  expect(tab.binding.filePending()).toBe(true);
  expect(saving(tab)).toBe(true);
});

test("an adopted session keeps what was typed before the first transition", () => {
  const tab = open();
  type(tab, "!");
  const adopted = clone(tab.store.value);
  tab.store.rebase(adopted, { source: "remote" });
  expect(tab.binding.filePending()).toBe(true);
  exitHeld = true;
  expect(livePending()).toBe(true);
  expect(saving(tab)).toBe(true);
  exitHeld = false;
  acknowledge(tab);
  expect(livePending()).toBe(false);
});

test("a refused exit keeps the obligation through the resume", () => {
  const tab = open();
  type(tab, "!");
  exitHeld = true;
  expect(livePending()).toBe(true);
  exitHeld = false;
  expect(tab.binding.filePending()).toBe(true);
  acknowledge(tab);
  expect(livePending()).toBe(false);
  type(tab, "?");
  exitHeld = true;
  expect(livePending()).toBe(true);
  expect(saving(tab)).toBe(true);
  acknowledge(tab);
  expect(livePending()).toBe(false);
});

test("a fresh binding owes nothing", () => {
  const tab = open();
  exitHeld = true;
  expect(tab.binding.filePending()).toBe(false);
  expect(livePending()).toBe(false);
});

test("a tracker on its own records the merged updates it is given", () => {
  const debt = createPageFileDebt();
  const doc = new Y.Doc();
  doc.getText("flow").insert(0, "hello");
  const first = Y.encodeStateAsUpdateV2(doc);
  doc.getText("flow").insert(5, " world");
  const second = Y.encodeStateAsUpdateV2(doc);
  debt.local(first);
  expect(debt.pending()).toBe(true);
  debt.local(second);
  expect(debt.pending()).toBe(true);
  expect(debt.accepted({ v: 1, g: 0, y: { seed: enc(first) } })).toBe(false);
  expect(debt.accepted({ v: 1, g: 0, y: { seed: enc(second) } })).toBe(true);
  expect(debt.pending()).toBe(false);
  doc.destroy();
});

test("the obligation holds with WebCrypto unavailable", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
  try {
    const tab = open();
    type(tab, "!");
    exitHeld = true;
    expect(livePending()).toBe(true);
    expect(saving(tab)).toBe(true);
    expect(tab.binding.filePending()).toBe(false);
    acknowledge(tab);
    expect(livePending()).toBe(false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else delete globalThis.crypto;
  }
});

const fakeJournal = (state) => {
  const journal = {
    state,
    calls: [],
    onChange: null,
    local(update) { this.calls.push(update); },
    dependency() {},
    acknowledged() {},
    close() {},
    channel: { flush: async () => {} },
    pending: () => state.pending,
    get failure() { return state.failure; },
  };
  return journal;
};

test("a failed journal alone never holds a leave, and never covers the input", () => {
  const state = { pending: 1, failure: "unavailable" };
  const journal = fakeJournal(state);
  const tab = open({ journal });
  exitHeld = true;
  expect(livePending()).toBe(false);
  state.pending = 2;
  expect(livePending()).toBe(true);
  state.pending = 1;
  exitHeld = false;
  type(tab, "!");
  expect(tab.binding.filePending()).toBe(true);
  exitHeld = true;
  expect(livePending()).toBe(true);
  expect(saving(tab)).toBe(true);
  expect(tab.binding.filePending()).toBe(false);
  acknowledge(tab);
  expect(livePending()).toBe(false);
});
