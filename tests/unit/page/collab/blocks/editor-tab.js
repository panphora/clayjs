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
  let binding = null;
  // What the live plugin keeps for a save (plugins/live.js): where the store
  // left the room, and the file-mode save on the wire, which holds the lane.
  let leftAt = null;
  let saving = null;
  const held = () => !!saving && saving.mode === "file" && store.pendingEntries().some((e) => e.id <= saving.mark);
  const lane = createFastLane({ transport, entries, now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer, onWriter: () => binding?.writerChanged(), onLeave: (_name, at) => { leftAt = at; }, held });
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
    // A save of the page, as the live plugin makes it: the capture (in fast
    // mode the room's value at the lane's position; out of the room the store's
    // value, stamped where it left, with live-by), the host's merge `answer / 2`
    // ms later (room.fileWritten, which sends the room's state on the stream),
    // and the answer after `answer` ms (confirmSaved). Returns the capture.
    save({ answer = 80, by = true } = {}) {
      const mode = store.handle.status.mode;
      const fastMode = mode === "fast";
      const value = JSON.parse(JSON.stringify(fastMode ? store.authoritative : store.value));
      const at = fastMode ? { epoch: lane.status.epoch, seq: lane.status.seq } : leftAt;
      const n = lane.framed?.("page") ?? 0;
      const stamp = { at, by: !fastMode && by && leftAt && n > 0 ? { client: id, n } : null };
      const mark = store.mark;
      if (!fastMode) saving = { mark, mode };
      const capture = { mode, value, mark, ...stamp };
      sim.after(answer / 2, () => room.fileWritten("page", value, at, stamp.by));
      sim.after(answer, () => {
        if (saving && saving.mark === mark) saving = null;
        if (fastMode) return;
        if (store.handle.status.mode === "fast") {
          store.rebase(store.authoritative, { source: "state", through: mark });
          lane.release("page");
          lane.refresh();
        } else store.confirm(mark);
      });
      return capture;
    },
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
    for (const B of t.binding.blocks.values()) {
      const lost = B.unechoed.filter((u) => u.value && u.value.w && u.seq !== null).length;
      if (lost) problems.push(`${t.id}: ${lost} landed writes to ${B.id} never came back`);
    }
  }
  // A tab writes marks as runs (inline.js), never one key per unit.
  for (const [id, b] of Object.entries(value.blocks ?? {})) {
    const perUnit = (m) => Array.isArray(m) && m.length > 0 && !Array.isArray(m[0]);
    if (b && b.w && tabs.has(b.w.a) && (perUnit(b.m) || (b.w.s ?? []).some((sp) => Array.isArray(sp) && perUnit(sp[4])))) problems.push(`${id}: the record holds marks one key per unit`);
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
