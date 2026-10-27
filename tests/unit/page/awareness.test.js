globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../src/live/store.js";
import { identityPlugin } from "../../../src/page/model.js";
import { state, view, history } from "../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, enc, migrateHybridValues, NET } from "../../../src/page/ybind/index.js";
import { PresenceStore } from "../../../src/sync/presence-store.js";
import { createPageAwareness, installPageAwareness, decorationsFor, colorOf } from "../../../src/page/awareness.js";
import { decodeSelection } from "../../../src/page/ybind/awareness.js";
import { RECORD } from "./fixtures/all-kinds.js";

/**
 * Other people's carets on the page (Document 10 Step 6).
 *
 * A peer's published selection is drawn where that text is after every accepted
 * edit, from a stable block id and a guarded relative position; a caret this tab
 * cannot place is not drawn at all. Nothing a caret does reaches the document:
 * the saved value, a reader's bytes, the dirty flags, the undo history and the
 * Yjs update count stay exactly as they were.
 */

const seed = () => seedValue([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
const EPOCH = "id:doc-1";

let opened;
let frames;
beforeEach(() => {
  opened = [];
  frames = [];
});
afterEach(() => {
  for (const one of opened.splice(0)) {
    one.awareness?.dispose();
    one.view.destroy();
    one.binding.dispose();
    one.binding.ydoc.destroy();
  }
});
const pump = () => {
  while (frames.length) frames.shift()();
};
const tab = (initial = seed(), { epoch = EPOCH, capabilities = true } = {}) => {
  const store = createStore({ name: "page", value: initial });
  const binding = createYPageBinding({ store });
  const editor = new view.EditorView(document.body.appendChild(document.createElement("div")), {
    state: state.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(editor);
  const presence = new PresenceStore();
  if (capabilities) presence.setCapabilities({ supported: true, pageAwareness: true });
  const composing = { value: false };
  const awareness = createPageAwareness({
    binding,
    view: editor,
    store: presence,
    epoch,
    composing: () => composing.value,
    frame: (fn) => { frames.push(fn); return frames.length; },
    cancel: () => {},
  });
  const one = { store, binding, view: editor, presence, awareness, initial, composing };
  opened.push(one);
  return one;
};
const posOf = (one, id, offset = 0) => {
  let found = null;
  one.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) found = pos + 1 + offset; });
  if (found === null) throw new Error(`Missing ${id}`);
  return found;
};
const caretIn = (one, id, offset) => one.view.dispatch(one.view.state.tr.setSelection(state.TextSelection.create(one.view.state.doc, posOf(one, id, offset))));
const selectIn = (one, id, from, to) => one.view.dispatch(one.view.state.tr.setSelection(state.TextSelection.create(one.view.state.doc, posOf(one, id, from), posOf(one, id, to))));
const exchange = (...tabs) => {
  const updates = tabs.map((one) => Y.encodeStateAsUpdateV2(one.binding.ydoc));
  for (const one of tabs) for (const update of updates) Y.applyUpdateV2(one.binding.ydoc, update, NET);
};
const people = (sessions, name = "Ada Lovelace") => ({
  people: [{ id: "p_ada", name, you: false, canEdit: true, sessions: sessions.map((editing, i) => ({ id: `s${i + 1}`, you: false, n: i + 1, editing })) }],
  anonymous: 0,
});
const show = (one, sessions) => {
  one.presence.receive(people(sessions));
  pump();
};
const showTarget = (viewer, sender) => show(viewer, [sender.presence.target]);
const place = (one, selection) => decodeSelection({ ...one.binding.awareness.map(), doc: one.view.state.doc }, selection);
const carets = (one) => [...one.view.dom.querySelectorAll(".page-remote-caret")];
const names = (one) => carets(one).map((el) => el.textContent);
const ranges = (one) => [...one.view.dom.querySelectorAll(".page-remote-selection")].map((el) => el.textContent);
const cells = (one) => [...one.view.dom.querySelectorAll(".page-remote-cell")];

test("a peer's caret is drawn where their text is, with their name", () => {
  const a = tab(), b = tab();
  caretIn(a, "q", 2);
  showTarget(b, a);
  expect(carets(b)).toHaveLength(1);
  expect(names(b)).toEqual(["Ada Lovelace"]);
  expect(a.presence.target).toMatchObject({ kind: "page", v: 1, epoch: EPOCH, generation: 0 });
  expect(a.presence.target.selection.kind).toBe("text");
});

test("a peer's range is drawn as an inline selection and a caret", () => {
  const a = tab(), b = tab();
  selectIn(a, "q", 1, 4);
  showTarget(b, a);
  expect(ranges(b)).toEqual(["rav"]);
  expect(carets(b)).toHaveLength(1);
});

test("the caret follows the same text after every accepted edit", () => {
  const a = tab(), b = tab();
  caretIn(a, "q", 2);
  const steps = [
    () => a.view.dispatch(a.view.state.tr.insertText("X", posOf(a, "q", 0))),
    () => a.view.dispatch(a.view.state.tr.insertText("Y", posOf(a, "q", 6))),
    () => { caretIn(a, "p", 3); a.view.dispatch(a.view.state.tr.split(posOf(a, "p", 3))); },
    () => {
      let at = null;
      a.view.state.doc.forEach((node, pos) => { if (node.attrs.id === "r") at = pos; });
      a.view.dispatch(a.view.state.tr.delete(at, at + a.view.state.doc.child(a.view.state.doc.childCount - 1).nodeSize));
    },
  ];
  for (const step of steps) {
    step();
    exchange(a, b);
    showTarget(b, a);
    const target = a.presence.target.selection;
    const spot = place(b, target);
    expect(spot).not.toBeNull();
    // The same logical text on both sides: the block the caret names is where it is.
    const before = place(a, target);
    const same = (one, decoded) => {
      const { $from } = state.TextSelection.create(one.view.state.doc, decoded.from, decoded.to);
      return { id: $from.parent.attrs.id, offset: $from.parentOffset, text: one.view.state.doc.textBetween(decoded.from, decoded.to) };
    };
    expect(same(b, spot)).toEqual(same(a, before));
    expect(carets(b)).toHaveLength(1);
  }
});

test("a caret this tab cannot place is not drawn instead of jumping", () => {
  const a = tab(), b = tab();
  caretIn(a, "q", 2);
  showTarget(b, a);
  expect(carets(b)).toHaveLength(1);
  show(b, [{ kind: "text", anchor: { block: "q", rel: "%%%not-base64%%%" }, head: { block: "q", rel: "%%%not-base64%%%" } }]);
  expect(carets(b)).toHaveLength(0);
  show(b, [{ kind: "text", anchor: { block: "gone", rel: "AAEMQQ==" }, head: { block: "gone", rel: "AAEMQQ==" } }]);
  expect(carets(b)).toHaveLength(0);
});

test("an edit that hides the peer's block takes the caret away", () => {
  const a = tab(), b = tab();
  caretIn(a, "q", 2);
  const target = a.presence.target;
  show(b, [target]);
  expect(carets(b)).toHaveLength(1);
  let at = null;
  a.view.state.doc.forEach((node, pos) => { if (node.attrs.id === "q") at = pos; });
  a.view.dispatch(a.view.state.tr.delete(at, at + 7));
  exchange(a, b);
  show(b, [target]);
  expect(carets(b)).toHaveLength(0);
});

test("a target from another epoch or generation is not drawn", () => {
  const a = tab(), b = tab();
  caretIn(a, "q", 2);
  const target = a.presence.target;
  show(b, [{ ...target, epoch: "id:another-document" }]);
  expect(carets(b)).toHaveLength(0);
  show(b, [{ ...target, generation: 7 }]);
  expect(carets(b)).toHaveLength(0);
  show(b, [target]);
  expect(carets(b)).toHaveLength(1);
});

test("two sessions by one person draw two carets", () => {
  const a = tab(), b = tab();
  caretIn(a, "q", 1);
  const first = a.presence.target;
  caretIn(a, "r", 2);
  const second = a.presence.target;
  show(b, [first, second]);
  expect(carets(b)).toHaveLength(2);
  expect(names(b)).toEqual(["Ada Lovelace", "Ada Lovelace"]);
  expect(new Set(carets(b).map((el) => el.style.getPropertyValue("--page-remote-color"))).size).toBe(1);
});

test("a person's colour comes from the fixed palette, never from the frame", () => {
  const a = tab(), b = tab();
  caretIn(a, "q", 1);
  b.presence.receive({
    people: [{ id: "p_eve", name: "<img src=x onerror=alert(1)>", you: false, sessions: [{ id: "s1", you: false, n: 1, editing: a.presence.target }] }],
    anonymous: 0,
  });
  pump();
  expect(carets(b)).toHaveLength(1);
  expect(carets(b)[0].style.getPropertyValue("--page-remote-color")).toBe(colorOf("p_eve"));
  expect(carets(b)[0].querySelector("img")).toBeNull();
  expect(names(b)).toEqual(["<img src=x onerror=alert(1)>"]);
});

test("a caret in a table cell draws the cell, never a character position", () => {
  const a = tab(migrateHybridValues([{ blocks: JSON.parse(JSON.stringify(RECORD.blocks)) }]));
  const b = tab(migrateHybridValues([{ blocks: JSON.parse(JSON.stringify(RECORD.blocks)) }]));
  let at = null;
  a.view.state.doc.forEach((node, pos) => {
    if (node.attrs.id !== "tbl") return;
    node.forEach((row, rowAt) => row.forEach((c, cellAt) => {
      if (row.attrs.id === "r2" && c.attrs.col === "c2" && at === null) at = pos + 2 + rowAt + cellAt + 2;
    }));
  });
  a.view.dispatch(a.view.state.tr.setSelection(state.TextSelection.create(a.view.state.doc, at)));
  expect(a.presence.target.selection).toEqual({ kind: "cell", block: "tbl", row: "r2", col: "c2" });
  showTarget(b, a);
  expect(cells(b)).toHaveLength(1);
  const spot = place(b, a.presence.target.selection);
  expect(b.view.state.doc.textBetween(spot.from + 1, spot.to - 1)).toBe("41");
  expect(carets(b)).toHaveLength(1);
  expect(ranges(b)).toHaveLength(0);
});

test("composing clears what this tab publishes and defers the peer's carets", () => {
  const a = tab(), b = tab();
  caretIn(a, "q", 2);
  showTarget(b, a);
  expect(carets(b)).toHaveLength(1);
  b.composing.value = true;
  caretIn(b, "p", 1);
  expect(b.presence.target).toBeNull();
  caretIn(a, "r", 1);
  showTarget(b, a);
  expect(carets(b)).toHaveLength(1);
  b.composing.value = false;
  b.view.dom.dispatchEvent(new Event("compositionend"));
  pump();
  expect(carets(b)).toHaveLength(1);
  expect(b.presence.target).not.toBeNull();
});

test("leaving the editor, pagehide and disposal clear the caret this tab published", () => {
  const a = tab();
  caretIn(a, "q", 2);
  expect(a.presence.target).not.toBeNull();
  a.view.dom.dispatchEvent(new Event("blur"));
  expect(a.presence.target).toBeNull();
  a.view.dom.dispatchEvent(new Event("focus"));
  expect(a.presence.target).not.toBeNull();
  document.dispatchEvent(new Event("pagehide"));
  expect(a.presence.target).toBeNull();
  a.view.dom.dispatchEvent(new Event("focus"));
  expect(a.presence.target).not.toBeNull();
  a.awareness.dispose();
  expect(a.presence.target).toBeNull();
  expect(carets(a)).toHaveLength(0);
});

test("a disposed editor draws nothing and publishes nobody", () => {
  const a = tab(), b = tab();
  caretIn(a, "q", 2);
  showTarget(b, a);
  expect(carets(b)).toHaveLength(1);
  b.awareness.dispose();
  pump();
  expect(carets(b)).toHaveLength(0);
  expect(b.presence.target).toBeNull();
  caretIn(a, "r", 1);
  showTarget(b, a);
  expect(carets(b)).toHaveLength(0);
});

test("presence-only activity leaves the document, the save, the undo history and Yjs alone", () => {
  const a = tab(), b = tab();
  const savedBefore = JSON.stringify(b.store.value);
  const downloadBefore = enc(Y.encodeStateAsUpdateV2(b.binding.ydoc));
  let updates = 0;
  b.binding.ydoc.on("updateV2", () => { updates++; });
  const depth = history.undoDepth(b.view.state);
  const doc = b.view.state.doc;
  caretIn(a, "q", 2);
  for (let i = 0; i < 5; i++) {
    caretIn(a, "q", i);
    caretIn(a, "r", i);
    showTarget(b, a);
  }
  selectIn(b, "p", 1, 3);
  caretIn(b, "q", 1);
  pump();
  expect(JSON.stringify(b.store.value)).toBe(savedBefore);
  expect(enc(Y.encodeStateAsUpdateV2(b.binding.ydoc))).toBe(downloadBefore);
  expect(b.store.pending.length).toBe(0);
  expect(history.undoDepth(b.view.state)).toBe(depth);
  expect(updates).toBe(0);
  expect(b.view.state.doc).toBe(doc);
  expect(b.binding.stats.mismatch).toBe(0);
  expect(carets(b)).toHaveLength(1);
});

test("a page target is only published where the host announced page awareness", () => {
  const quiet = tab(seed(), { capabilities: false });
  caretIn(quiet, "q", 2);
  expect(quiet.presence.target).toBeNull();
});

test("install decides from what the host announced, and the scope is the epoch", async () => {
  const one = tab(seed(), { capabilities: false });
  one.awareness.dispose();
  one.awareness = null;
  const meta = {
    spec: 1,
    extensions: ["presence", "page-awareness-v1"],
    document: { awareness: { transport: "broadcast", scope: "id:doc-9", label: "This computer" } },
  };
  const handle = await installPageAwareness({ binding: one.binding, view: one.view, store: one.presence, meta });
  one.awareness = handle;
  expect(handle).not.toBeNull();
  expect(handle.epoch).toBe("id:doc-9");
  expect(one.presence.getSnapshot().pageAwareness).toBe(true);
  caretIn(one, "q", 1);
  expect(one.presence.target).toMatchObject({ kind: "page", epoch: "id:doc-9" });
  expect(await installPageAwareness({ binding: one.binding, view: one.view, store: one.presence, meta: { spec: 1, extensions: ["presence"], document: null } })).toBeNull();
});

test("decorationsFor is pure: the same snapshot and document give the same decorations", () => {
  const a = tab(), b = tab();
  caretIn(a, "q", 2);
  const snapshot = new PresenceStore();
  snapshot.setCapabilities({ supported: true, pageAwareness: true });
  snapshot.receive(people([a.presence.target]));
  const first = decorationsFor({ binding: b.binding, doc: b.view.state.doc, snapshot: snapshot.getSnapshot(), epoch: EPOCH });
  const second = decorationsFor({ binding: b.binding, doc: b.view.state.doc, snapshot: snapshot.getSnapshot(), epoch: EPOCH });
  const shape = (set) => set.find().map((d) => [d.from, d.to, d.type.attrs?.class ?? d.type.spec?.class ?? "widget"]);
  expect(shape(first)).toEqual(shape(second));
  expect(shape(first).some(([, , kind]) => kind === "widget" || kind === "page-remote-selection")).toBe(true);
  expect(first.find().length).toBeGreaterThan(0);
});
