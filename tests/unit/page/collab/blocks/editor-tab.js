// A page tab with a real ProseMirror EditorView (jsdom) on the real clay.live
// store and fast lane, bound by src/page/binding.js. It has the surface of the
// simulated tab (../text/tab.js), so the S1 rows and fuzz run on it, plus the
// editor itself for the block rows. Its text is block "p"; the page also has
// an empty block "q" after it, so p can be deleted.
import { createStore } from "../../../../../src/live/store.js";
import { createFastLane } from "../../../../../src/live/fast-lane.js";
import { createPageBinding, docFromRecord } from "../../../../../src/page/binding.js";
import { schema } from "../../../../../src/page/schema.js";
import { identityPlugin } from "../../../../../src/page/model.js";
import { flatten, marksOf } from "../../../../../src/page/inline.js";
import { history as pmHistory, state as pmState, view as pmView } from "../../../../../src/vendor/prosemirror.vendor.js";

const { TextSelection } = pmState;
// jsdom has no ClipboardEvent; EditorView.pasteHTML builds one.
globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.clipboardData = init.clipboardData ?? null;
  }
};
const ID = "p";
// Transaction times follow the simulated clock, so history groups as it would.
const T0 = 1_700_000_000_000;

export const initial = (c) => ({ blocks: { p: { t: "paragraph", pos: "M", c }, q: { t: "paragraph", pos: "V", c: "" } }, deleted: {} });
export const adapt = (value) => ({ ...value, t: value.t === "p" ? "paragraph" : value.t, pos: value.pos ?? "M" });

export function find(doc, id) {
  let found = null;
  doc.forEach((node, pos) => { if (!found && node.attrs.id === id) found = { node, pos }; });
  return found;
}

export function makeTab(sim, room, id, init, opts = {}) {
  const store = createStore({ name: "page", value: init });
  const entries = new Map([["page", { store }]]);
  const transport = room.transport(id, { person: opts.person ?? id });
  // The proposed server rule for `since`: the moves after that seq in the same
  // epoch; for another epoch (or a first read), the epoch's moves from 0.
  const wrapped = {
    ...transport,
    fetchState: async (cid, since) => {
      const state = await transport.fetchState(cid, since ? since.seq : 0);
      if (since && state && typeof state.epoch === "string" && state.epoch !== since.epoch) return room.state(cid, 0);
      return state;
    },
  };
  let binding = null;
  const lane = createFastLane({ transport: wrapped, entries, now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer, onWriter: () => binding?.writerChanged() });
  store.onLocal((ops) => lane.local("page", ops, store.mark));
  binding = createPageBinding({ schema, store, lane, me: id, setTimer: sim.setTimer, clearTimer: sim.clearTimer, quiet: opts.quiet ?? 500 });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const editor = new pmView.EditorView(el, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [pmHistory.history(), identityPlugin(), binding.plugin] }),
    dispatchTransaction: (tr) => binding.dispatch(tr.setTime(T0 + sim.now())),
  });
  binding.attach(editor);

  const block = () => find(editor.state.doc, ID);
  const flat = () => { const b = block(); return b ? flatten(b.node.content) : null; };
  let caret = 0;
  const caretNow = () => {
    const b = block();
    const head = editor.state.selection.head;
    if (b && head > b.pos && head < b.pos + b.node.nodeSize) caret = head - b.pos - 1;
    return caret;
  };
  const textNodes = (text, key) => (text ? [schema.text(text, marksOf(schema, key))] : []);

  const tab = {
    id, store, lane, binding, editor,
    get view() { const f = flat(); return f ? f.c : null; },
    get marks() { const f = flat(); return f ? f.m : null; },
    get r() { return binding.blocks.get(ID)?.r ?? null; },
    get repairs() { return binding.stats.repairs; },
    get heals() { return binding.stats.heals; },
    get caret() { return caretNow(); },
    set caret(q) {
      caret = q;
      const b = block();
      if (b) editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, b.pos + 1 + Math.min(q, b.node.content.size))));
    },
    replace(from, to, text, key = "") {
      const b = block();
      if (!b) return;
      const start = b.pos + 1;
      const tr = editor.state.tr.replaceWith(start + from, start + to, textNodes(text, key));
      tr.setSelection(TextSelection.create(tr.doc, start + from + text.length));
      editor.dispatch(tr);
    },
    type(text, key = "") { tab.replace(caretNow(), caretNow(), text, key); },
    // Typing at the selection, in whatever block it is.
    input(text, key = "") {
      const { from, to } = editor.state.selection;
      const tr = editor.state.tr.replaceWith(from, to, textNodes(text, key));
      tr.setSelection(TextSelection.create(tr.doc, from + text.length));
      editor.dispatch(tr);
    },
    format(from, to, key) {
      const b = block();
      if (!b) return;
      const start = b.pos + 1;
      const tr = editor.state.tr.removeMark(start + from, start + to, null);
      for (const mark of marksOf(schema, key)) tr.addMark(start + from, start + to, mark);
      editor.dispatch(tr);
    },
    remove() {
      const b = block();
      if (b) editor.dispatch(editor.state.tr.delete(b.pos, b.pos + b.node.nodeSize));
    },
    // Enter at `at`: the tail goes to a new block. Returns the tail's text.
    split(at) {
      const b = block();
      if (!b) return null;
      const tail = flat().c.slice(at);
      const tr = editor.state.tr.split(b.pos + 1 + at);
      editor.dispatch(tr);
      return tail;
    },
    undo() { return pmHistory.undo(editor.state, editor.dispatch); },
    compose(on) { editor.dom.dispatchEvent(new CompositionEvent(on ? "compositionstart" : "compositionend", { bubbles: true, data: "" })); },
    start() { lane.start(); room.open(id); },
    allNotices() { return binding.notices(); },
    // The page's blocks in order, as [id, flat text].
    blocks() {
      const out = [];
      editor.state.doc.forEach((node) => out.push([node.attrs.id, node.isTextblock ? flatten(node.content).c : node.type.name]));
      return out;
    },
  };
  return tab;
}

// After a run: every tab's editor shows exactly what a reload of the room's
// checkpoint shows, and every binding agrees with the room.
export function check({ room, tabs }) {
  const problems = [];
  const value = JSON.parse(JSON.stringify(room.stores.get("page").value));
  const reloaded = docFromRecord(schema, value);
  for (const t of tabs.values()) {
    if (!t.editor.state.doc.eq(reloaded)) problems.push(`${t.id}: the editor differs from a reload of the checkpoint: ${JSON.stringify(t.blocks())} vs ${JSON.stringify(reloadedBlocks(reloaded))}`);
    if (t.store.pending.length) problems.push(`${t.id}: ${t.store.pending.length} ops still pending`);
  }
  return problems;
}

// A reload: the room's value is checkpointed to the file and a new tab opens
// on it. It must show what every other tab shows, before and after it joins,
// and write nothing.
export async function reload({ sim, room, tabs }) {
  const file = JSON.parse(JSON.stringify(room.stores.get("page").value));
  room.land("page", room.seq);
  const seq = room.seq;
  const fresh = makeTab(sim, room, "reload", file);
  const opened = fresh.editor.state.doc;
  fresh.start();
  await sim.idle(3000);
  const problems = [];
  if (!fresh.editor.state.doc.eq(opened)) problems.push(`reload: the page changed when it joined: ${JSON.stringify(fresh.blocks())}`);
  for (const t of tabs.values()) if (!t.editor.state.doc.eq(fresh.editor.state.doc)) problems.push(`${t.id}: differs from a reload: ${JSON.stringify(t.blocks())} vs ${JSON.stringify(fresh.blocks())}`);
  if (room.seq !== seq || fresh.binding.stats.writes || fresh.store.pending.length) problems.push(`reload: the new tab wrote (${room.seq - seq} frames)`);
  fresh.binding.dispose();
  room.close("reload");
  return problems;
}

function reloadedBlocks(doc) {
  const out = [];
  doc.forEach((node) => out.push([node.attrs.id, node.isTextblock ? flatten(node.content).c : node.type.name]));
  return out;
}

export const engine = { name: "blocks", makeTab, initial, adapt, check, reload };
