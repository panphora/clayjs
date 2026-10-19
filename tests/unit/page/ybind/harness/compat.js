import { Sim, createRoom as baseRoom, LIMITS } from "../../collab/room-double.js";
import { flatten, marksOf } from "./flat.js";
import { schema } from "../../../../../src/page/schema.js";
import { state as pmState } from "../../../../../src/vendor/prosemirror.vendor.js";
import { makeYTab, seedValue, docOfValue, check as yCheck, reload as yReload } from "./tab.js";

export { Sim, LIMITS };
const { TextSelection } = pmState;
const ordered = (record) => Object.entries(record.blocks).filter(([id]) => !record.deleted?.[id]).sort((a, b) => (a[1].pos < b[1].pos ? -1 : 1));
const toY = (init) => (init && init.y ? init : seedValue(ordered(init).map(([id, b]) => ({ id, text: b.c }))));

export const initial = (c) => ({ blocks: { p: { t: "paragraph", pos: "M", c }, q: { t: "paragraph", pos: "V", c: "" } }, deleted: {} });

export function createRoom(sim, stores, opts) {
  return globalThis.__room = baseRoom(sim, Object.fromEntries(Object.entries(stores).map(([k, v]) => [k, k === "page" ? toY(v) : v])), opts);
}

export function legacy(room) {
  const value = room.stores.get("page").value;
  const doc = docOfValue(value);
  const blocks = {};
  let i = 0;
  doc.forEach((n) => { blocks[n.attrs.id] = { t: n.type.name, pos: String.fromCharCode(66 + 2 * i++), c: n.isTextblock ? n.textContent : "" }; });
  return { blocks, deleted: {} };
}

export function find(doc, id) {
  let found = null;
  doc.forEach((node, pos) => { if (!found && node.attrs.id === id) found = { node, pos }; });
  return found;
}

const ID = "p";
export function makeTab(sim, room, id, init, opts = {}) {
  const tab = makeYTab(sim, room, id, toY(init), opts);
  const editor = tab.editor;
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
  Object.defineProperties(tab, {
    view: { get() { const f = flat(); return f ? f.c : null; } },
    marks: { get() { const f = flat(); return f ? f.m : null; } },
    r: { get() { return null; } },
    repairs: { get() { return 0; } },
    heals: { get() { return 0; } },
    caret: {
      get() { return caretNow(); },
      set(q) {
        caret = q;
        const b = block();
        if (b) editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, b.pos + 1 + Math.min(q, b.node.content.size))));
      },
    },
  });
  Object.assign(tab, {
    replace(from, to, text, key = "") {
      const b = block();
      if (!b) return;
      const start = b.pos + 1;
      const tr = editor.state.tr.replaceWith(start + from, start + to, textNodes(text, key));
      tr.setSelection(TextSelection.create(tr.doc, start + from + text.length));
      editor.dispatch(tr);
    },
    type(text, key = "") { tab.replace(caretNow(), caretNow(), text, key); },
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
    remove() { const b = block(); if (b) editor.dispatch(editor.state.tr.delete(b.pos, b.pos + b.node.nodeSize)); },
    split(at) {
      const b = block();
      if (!b) return null;
      const tail = flat().c.slice(at);
      editor.dispatch(editor.state.tr.split(b.pos + 1 + at));
      return tail;
    },
    undo() { return tab.bridge.undo(); },
    compose() {},
  });
  return tab;
}

export const engine = { name: "yjs", makeTab, initial, check: yCheck, reload: yReload };
