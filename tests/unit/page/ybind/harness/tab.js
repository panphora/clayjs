import * as Y from "../../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../../src/live/store.js";
import { createFastLane } from "../../../../../src/live/fast-lane.js";
import { serializeLive, textHash } from "../../../../../src/live/ops.js";
import { schema } from "../../../../../src/page/schema.js";
import { identityPlugin } from "../../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, createPageDoc, docOf, walk, bareShape, docFromValue, seedValue } from "../../../../../src/page/ybind/index.js";
export { seedValue };

globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };

let tabCounter = 100;
export function makeYTab(sim, room, id, init, opts = {}) {
  const store = createStore({ name: "page", value: init });
  const entries = new Map([["page", { store }]]);
  const transport = room.transport(id, { person: opts.person ?? id });
  let leftAt = null, saving = null;
  const held = () => !!saving && saving.mode === "file" && store.pendingEntries().some((e) => e.id <= saving.mark);
  const lane = createFastLane({ transport, entries, now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer, onLeave: (_n, at) => { leftAt = at; }, held });
  store.onLocal((ops) => lane.local("page", ops, store.mark));
  const ydoc = new Y.Doc();
  ydoc.clientID = opts.clientID ?? (10000 + tabCounter++);
  const notices = [];
  const binding = createYPageBinding({ store, ydoc, setTimer: sim.setTimer, clearTimer: sim.clearTimer, compact: opts.compact, captureTimeout: 0, onNotice: (n) => notices.push(n) });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const editor = new pmView.EditorView(el, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(editor);
  const tab = {
    id, store, lane, editor, provider: binding.provider, pd: binding.pd, ydoc, bridge: binding.bridge, stats: binding.stats, binding,
    input(text) {
      const { from, to } = editor.state.selection;
      const tr = editor.state.tr.replaceWith(from, to, text ? schema.text(text) : []);
      tr.setSelection(pmState.TextSelection.create(tr.doc, from + text.length));
      editor.dispatch(tr);
    },
    start() { lane.start(); room.open(id); },
    save({ answer = 80, by = true } = {}) {
      const mode = store.handle.status.mode;
      const fastMode = mode === "fast";
      const value = JSON.parse(JSON.stringify(fastMode ? store.authoritative : store.value));
      const where = fastMode ? { epoch: lane.status.epoch, seq: lane.status.seq } : leftAt && !leftAt.disk ? leftAt : null;
      const at = where ? { epoch: where.epoch, seq: where.seq, hash: textHash(serializeLive(value)) } : null;
      const n = lane.framed?.("page") ?? 0;
      const stamp = { at, by: !fastMode && by && at && n > 0 ? { client: id, n } : null };
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
        } else {
          store.confirm(mark);
          if (leftAt) leftAt = { disk: true };
        }
      });
      return capture;
    },
    allNotices() { const rec = []; binding.subscribeRecovery((snap) => { if (snap.recoverable.length || snap.notices.length) rec.push(snap); })(); return [...notices, ...rec]; },
    blocks() {
      const out = [];
      editor.state.doc.forEach((node) => out.push([node.attrs.id, node.isTextblock ? node.textContent : node.type.name]));
      return out;
    },
  };
  return tab;
}

export function docOfValue(value) {
  const pd = createPageDoc(docFromValue(value));
  return docOf(pd, walk(pd));
}

export function check({ room, tabs }) {
  const problems = [];
  const value = JSON.parse(JSON.stringify(room.stores.get("page").value));
  const reloaded = docOfValue(value);
  const bare = bareShape;
  for (const t of tabs.values()) {
    if (bare(t.editor.state.doc) !== bare(reloaded)) problems.push(`${t.id}: the editor differs from a reload of the checkpoint: ${JSON.stringify(t.blocks())} vs ${bare(reloaded)}`);
    if (t.store.pending.length) problems.push(`${t.id}: ${t.store.pending.length} ops still pending`);
    if (t.stats.mismatch) problems.push(`${t.id}: bridge mismatch ${JSON.stringify(t.stats.first).slice(0, 400)}`);
  }
  return problems;
}

export async function reload({ sim, room, tabs }) {
  const file = JSON.parse(JSON.stringify(room.stores.get("page").value));
  room.land("page", room.seq);
  const seq = room.seq;
  const fresh = makeYTab(sim, room, "reload", file);
  const opened = fresh.editor.state.doc;
  fresh.start();
  await sim.idle(3000);
  const problems = [];
  const bare = bareShape;
  if (bare(fresh.editor.state.doc) !== bare(opened)) problems.push(`reload: the page changed when it joined: ${JSON.stringify(fresh.blocks())}`);
  for (const t of tabs.values()) if (bare(t.editor.state.doc) !== bare(fresh.editor.state.doc)) problems.push(`${t.id}: differs from a reload: ${JSON.stringify(t.blocks())} vs ${JSON.stringify(fresh.blocks())}`);
  if (room.seq !== seq || fresh.store.pending.length) problems.push(`reload: the new tab wrote (${room.seq - seq} frames)`);
  fresh.binding.dispose();
  room.close("reload");
  return problems;
}
