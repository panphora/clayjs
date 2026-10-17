// The block rows: edits across blocks (split, join, paste, a delete across
// blocks), fields beside typing, moves, undo, on real EditorViews bound by
// src/page/binding.js against the room double. Each row states the page's
// text blocks in order and its notices, as the S1 rows do (../text/rows.js).
//   node --import ./tests/unit/page/collab/env-dom.js tests/unit/page/collab/blocks/rows.js [id ...]
import { Sim, createRoom, LIMITS as ROOM_LIMITS } from "../room-double.js";
import { makeTab, check, find, reload } from "./editor-tab.js";
import { flatten } from "../../../../../src/page/inline.js";
import { commands, state as pmState } from "../../../../../src/vendor/prosemirror.vendor.js";

const { NodeSelection, TextSelection } = pmState;
const clone = (v) => JSON.parse(JSON.stringify(v));

// The page: [id, text] or [id, text, { t, ...attrs }], in order.
function record(list) {
  const blocks = {};
  list.forEach(([id, c, extra], i) => { blocks[id] = { t: "paragraph", pos: String.fromCharCode(66 + 2 * i), ...extra, c }; });
  return { blocks, deleted: {} };
}

// Script actions, each at a simulated ms, on one tab:
//   { type, where, cps }        type at where (cps 0: one write), then at the caret
//   { split: where }            Enter
//   { join: id }                Backspace at the start of block id
//   { del: [from, to] }         select across blocks and delete
//   { paste: html, where }      paste over where ([from, to] or one place)
//   { attrs: { block, set } }   change a block's attrs (a checkbox, a heading level)
//   { setType: { block, type, attrs } }
//   { move: { block, before } } move a block before another (null: to the end)
//   { copy: { block, before } } paste a copy of a block, as ProseMirror pastes
//                               an internal slice (ids and all)
//   { drag: { block, before, copy } } drop a dragged block, as ProseMirror's
//                               drop handler does: a move unless copy
//   { remove: id }              delete a block whole
//   { undo: true }
// where: { block, at } with block an id or "@n" (the nth block of that tab's
// page), at a number, "end", { after: text } or { before: text }.
export const BLOCK_ROWS = [
  { id: "split-then-type", source: "binding: Enter, then a peer types in the new block", page: [["p", "The quick brown fox jumps over the lazy dog."], ["q", ""]], script: [
    { at: 1000, tab: "a", split: { block: "p", at: { after: "brown" } } },
    { at: 2000, tab: "b", type: " again", where: { block: "@1", at: "end" } },
  ], expect: { texts: ["The quick brown", " fox jumps over the lazy dog. again", ""], notices: [] } },
  { id: "split-race", source: "binding: Enter while a peer types in the tail (row 4 with real blocks)", policy: "text that lands in the tail after the split collapses to the cut point, in the first half; the tail keeps what it had when the split was made", page: [["p", "The quick brown fox jumps over the lazy dog."], ["q", ""]], script: [
    { at: 1000, tab: "b", type: "red ", where: { block: "p", at: { before: "jumps" } }, cps: 6 },
    { at: 1300, tab: "a", split: { block: "p", at: { after: "brown" } } },
  ], expect: { texts: ["The quick brownd ", " fox rejumps over the lazy dog.", ""], notices: [] } },
  { id: "enter-at-start", source: "binding: Enter at the start of a block a peer is typing in", policy: "the empty block is the new one; the text and the peer's typing stay in the block they were in", page: [["p", "First."], ["q", "Second line."]], script: [
    { at: 1000, tab: "b", type: " again", where: { block: "q", at: "end" }, cps: 8 },
    { at: 1100, tab: "a", split: { block: "q", at: 0 } },
  ], expect: { texts: ["First.", "", "Second line. again"], notices: [], check: ({ value }) => (value.blocks.q?.c === "Second line. again" ? null : `q is ${JSON.stringify(value.blocks.q)}`) } },
  { id: "two-splits", source: "binding: two tabs press Enter in two blocks at once", page: [["p", "One two three."], ["q", "Four five six."]], script: [
    { at: 1000, tab: "a", split: { block: "p", at: { after: "two" } } },
    { at: 1000, tab: "b", split: { block: "q", at: { after: "Four" } } },
  ], expect: { texts: ["One two", " three.", "Four", " five six."], notices: [] } },
  { id: "join-race", source: "binding: Backspace joins a block a peer is typing in", policy: "what the joining tab saw moves into the first block; typing that reached the joined block after the join is kept in a removed notice, with Restore; the typist's caret goes to the end of the first block and the rest of the word lands there", page: [["p", "First line."], ["q", "Second line."]], script: [
    { at: 1000, tab: "b", type: " again", where: { block: "q", at: "end" }, cps: 6 },
    { at: 1300, tab: "a", join: "q" },
  ], expect: { texts: ["First line.Second line. aain"], notices: [{ kind: "removed", tab: "b", includes: "Second line. ag" }, { kind: "removed", includes: "Second line. ag" }] } },
  { id: "multi-delete", source: "binding: a delete across three blocks while a peer types in the first", page: [["p", "Alpha one two."], ["q", "Beta three."], ["r", "Gamma four five."]], script: [
    { at: 1000, tab: "a", del: [{ block: "p", at: { after: "Alpha" } }, { block: "r", at: { after: "Gamma" } }] },
    { at: 1000, tab: "b", type: "Hey ", where: { block: "p", at: 0 }, cps: 0 },
  ], expect: { texts: ["Hey Alpha four five."], notices: [] } },
  { id: "multi-delete-inside", source: "binding: a delete across blocks while a peer types inside the deleted range", policy: "typing inside a block a peer deleted is kept in a removed notice, with Restore; the caret goes to the block before it", page: [["p", "Alpha one two."], ["q", "Beta three."], ["r", "Gamma four five."]], script: [
    { at: 1000, tab: "b", type: " six", where: { block: "q", at: "end" }, cps: 8 },
    { at: 1200, tab: "a", del: [{ block: "p", at: { after: "Alpha" } }, { block: "r", at: { after: "Gamma" } }] },
  ], expect: { texts: ["Alpha four five.x"], notices: [{ kind: "removed", tab: "b", includes: "Beta three. si" }, { kind: "removed", includes: "Beta three. si" }] } },
  { id: "paste-across", source: "binding: paste two paragraphs over a selection across two blocks while a peer types", page: [["p", "Hello world."], ["q", "Second."]], script: [
    { at: 1000, tab: "a", paste: "<p>one</p><p>two</p>", where: [{ block: "p", at: { after: "Hello " } }, { block: "q", at: { after: "Sec" } }] },
    { at: 1000, tab: "b", type: "Oh ", where: { block: "p", at: 0 }, cps: 0 },
  ], expect: { texts: ["Oh Hello one", "twoond."], notices: [] } },
  { id: "paste-blocks", source: "binding: paste three paragraphs at the end of a block", page: [["p", "Start."], ["q", "End."]], script: [
    { at: 1000, tab: "a", paste: "<p>x1</p><p>x2</p><p>x3</p>", where: { block: "p", at: "end" } },
    { at: 1000, tab: "b", type: " more", where: { block: "q", at: "end" }, cps: 0 },
  ], expect: { texts: ["Start.x1", "x2", "x3", "End. more"], notices: [] } },
  { id: "fields-typing", source: "binding: a checkbox toggled while a peer types in the item (w.f)", page: [["li", "Ship the beta", { t: "list_item", kind: "check" }]], script: [
    { at: 1000, tab: "a", attrs: { block: "li", set: { checked: true } } },
    { at: 1000, tab: "b", type: " today", where: { block: "li", at: "end" }, cps: 8 },
  ], expect: { texts: ["Ship the beta today"], notices: [], check: ({ value }) => (value.blocks.li.checked === true ? null : `checked ${value.blocks.li.checked}`) } },
  { id: "settype-typing", source: "binding: a paragraph made a heading while a peer types in it (w.f)", page: [["p", "Launch notes"], ["q", ""]], script: [
    { at: 1000, tab: "a", setType: { block: "p", type: "heading", attrs: { level: 1 } } },
    { at: 1000, tab: "b", type: " for Friday", where: { block: "p", at: "end" }, cps: 8 },
  ], expect: { texts: ["Launch notes for Friday", ""], notices: [], check: ({ value }) => (value.blocks.p.t === "heading" && value.blocks.p.level === 1 ? null : `type ${value.blocks.p.t} ${value.blocks.p.level}`) } },
  { id: "move-typing", source: "binding: a block dragged to the top while a peer types in it (w.f)", page: [["p", "Alpha."], ["q", "Beta."], ["r", "Gamma."]], script: [
    { at: 1000, tab: "a", move: { block: "r", before: "p" } },
    { at: 1000, tab: "b", type: " again", where: { block: "r", at: "end" }, cps: 8 },
  ], expect: { texts: ["Gamma. again", "Alpha.", "Beta."], notices: [] } },
  { id: "paste-copy", source: "binding: paste a copy of a block beside it while a peer types in the original", policy: "the copy is a new block; the original keeps its id, and the peer's typing stays in it", page: [["p", "Alpha."], ["q", "Beta."]], script: [
    { at: 1000, tab: "b", type: " again", where: { block: "q", at: "end" }, cps: 8 },
    { at: 900, tab: "a", copy: { block: "q", before: "q" } },
  ], expect: { texts: ["Alpha.", "Beta.", "Beta. again"], notices: [], check: ({ value }) => (value.blocks.q?.c === "Beta. again" ? null : `q is ${JSON.stringify(value.blocks.q)}`) } },
  { id: "drag-move", source: "binding: drag a block to the top while a peer types in it, through ProseMirror's drop path", policy: "a move keeps the block's id; no notice", page: [["p", "Alpha."], ["q", "Beta."], ["r", "Gamma."]], script: [
    { at: 1000, tab: "b", type: " again", where: { block: "r", at: "end" }, cps: 8 },
    { at: 1100, tab: "a", drag: { block: "r", before: "p" } },
  ], expect: { texts: ["Gamma. again", "Alpha.", "Beta."], notices: [], check: ({ value }) => (value.blocks.r && !value.deleted.r ? null : "r lost its id") } },
  { id: "drag-copy", source: "binding: drag a copy of a block (Alt) while a peer types in the original", page: [["p", "Alpha."], ["q", "Beta."]], script: [
    { at: 1000, tab: "b", type: " again", where: { block: "q", at: "end" }, cps: 8 },
    { at: 900, tab: "a", drag: { block: "q", before: "p", copy: true } },
  ], expect: { texts: ["Beta.", "Alpha.", "Beta. again"], notices: [] } },
  { id: "undo-own-only", source: "binding: undo through ProseMirror history reverts only this tab's change, in another block too", page: [["p", "We ship Friday."], ["q", "Notes."]], script: [
    { at: 1000, tab: "a", type: "early ", where: { block: "p", at: { before: "Friday" } }, cps: 0 },
    { at: 1000, tab: "b", type: " Two", where: { block: "q", at: "end" }, cps: 0 },
    { at: 1000, tab: "b", type: ", together", where: { block: "p", at: { before: "." } }, cps: 0 },
    { at: 2000, tab: "a", undo: true },
  ], expect: { texts: ["We ship Friday, together.", "Notes. Two"], notices: [] } },
  { id: "undo-split", source: "binding: undo of an Enter joins the blocks again", page: [["p", "One two three."], ["q", "Four."]], script: [
    { at: 1000, tab: "a", split: { block: "p", at: { after: "two" } } },
    { at: 1000, tab: "b", type: "Zero ", where: { block: "p", at: 0 }, cps: 0 },
    { at: 2500, tab: "a", undo: true },
  ], expect: { texts: ["Zero One two three.", "Four."], notices: [] } },
  { id: "undo-remove", source: "binding: undo of a deleted block brings it back as a new block", policy: "the deleted id stays under its tombstone; the block comes back with a fresh id", page: [["p", "Keep."], ["q", "Bring me back."]], script: [
    { at: 1000, tab: "a", remove: "q" },
    { at: 2500, tab: "a", undo: true },
  ], expect: { texts: ["Keep.", "Bring me back."], notices: [], check: ({ value }) => (value.deleted.q && !value.blocks.q && Object.keys(value.blocks).length === 2 ? null : `record ${JSON.stringify(value)}`) } },
  { id: "delete-after-edit", source: "binding: a block this tab edited is deleted after its write landed", policy: "the tab that edited it gets a removed notice with the text it had, with Restore; the deleting tab gets none", page: [["p", "The quick brown fox."], ["q", "Second."]], script: [
    { at: 1000, tab: "b", type: " again", where: { block: "p", at: "end" }, cps: 0 },
    { at: 2000, tab: "a", remove: "p" },
  ], expect: { texts: ["Second."], notices: [{ kind: "removed", tab: "b", includes: "fox. again" }] } },
  { id: "offline-under-tombstone", source: "binding: a tab types offline in a block a peer deletes, then comes back", policy: "the offline tab's writes come as one removed notice per author, with everything it typed, with Restore", page: [["p", "Alpha."], ["q", "Beta."]], script: [
    { at: 900, offline: "b" },
    { at: 1000, tab: "b", type: " one two", where: { block: "q", at: "end" }, cps: 4 },
    { at: 1500, tab: "a", remove: "q" },
    { at: 4000, online: "b" },
  ], expect: { texts: ["Alpha."], notices: [{ kind: "removed", tab: "b", includes: "Beta. one two" }, { kind: "removed", tab: "a", includes: "Beta. one two" }] } },
  { id: "rejoin-no-moves", source: "binding: a tab rejoins after the room's log moved past it, then both type in a block", policy: "a rejoin with no moves joins the room's value; every replay knows each block through the stream's seq, so later writes are placed by the step mapper in every tab, never by a diff", roomLimits: { logEntries: 8 }, page: [["p", "Alpha."], ["q", "Beta."]], script: [
    { at: 900, offline: "b" },
    { at: 1000, tab: "a", type: " one two three four", where: { block: "q", at: "end" }, cps: 8 },
    { at: 5000, online: "b" },
    { at: 8000, tab: "a", type: " again", where: { block: "p", at: "end" }, cps: 0 },
    { at: 8000, tab: "b", type: "B ", where: { block: "p", at: 0 }, cps: 0 },
  ], expect: { texts: ["B Alpha. again", "Beta. one two three four"], notices: [], check: ({ tabs }) => {
    const fallback = [...tabs.values()].map((t) => t.binding.blocks.get("p").r.stats.fallback);
    return fallback.every((n) => n === 0) ? null : `placed by a diff: ${fallback}`;
  } } },
  { id: "loss-after-split", source: "binding: a room loss right after an Enter and typing in both halves", page: [["p", "The quick brown fox."], ["q", ""]], script: [
    { at: 1000, tab: "a", split: { block: "p", at: { after: "quick" } } },
    { at: 1500, checkpoint: true },
    { at: 2000, tab: "a", type: " red", where: { block: "p", at: "end" }, cps: 0 },
    { at: 2000, tab: "b", type: " jumps", where: { block: "@1", at: { before: "." } }, cps: 0 },
    { at: 2500, restart: true },
  ], expect: { texts: ["The quick red", " brown fox jumps.", ""], notices: [] } },
];

function resolve(tab, where) {
  const doc = tab.editor.state.doc;
  const found = typeof where.block === "string" && where.block.startsWith("@")
    ? (() => { let f = null, i = 0; const n = Number(where.block.slice(1)); doc.forEach((node, pos) => { if (i++ === n) f = { node, pos }; }); return f; })()
    : find(doc, where.block);
  if (!found) throw new Error(`${tab.id}: no block ${where.block}`);
  const c = flatten(found.node.content).c;
  const at = where.at;
  const off = typeof at === "number" ? at : at === "end" ? c.length : at.after !== undefined ? c.indexOf(at.after) + at.after.length : c.indexOf(at.before);
  return found.pos + 1 + off;
}

function select(tab, from, to = from) {
  const { editor } = tab;
  editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));
}

function act(a, t) {
  const { editor } = t;
  const run = (cmd) => cmd(editor.state, editor.dispatch);
  if (a.split) { select(t, resolve(t, a.split)); run(commands.splitBlock); }
  else if (a.join) { select(t, resolve(t, { block: a.join, at: 0 })); run(commands.joinBackward); }
  else if (a.del) { select(t, resolve(t, a.del[0]), resolve(t, a.del[1])); run(commands.deleteSelection); }
  else if (a.paste) { Array.isArray(a.where) ? select(t, resolve(t, a.where[0]), resolve(t, a.where[1])) : select(t, resolve(t, a.where)); editor.pasteHTML(a.paste); }
  else if (a.attrs) { const f = find(editor.state.doc, a.attrs.block); editor.dispatch(editor.state.tr.setNodeMarkup(f.pos, null, { ...f.node.attrs, ...a.attrs.set })); }
  else if (a.setType) { const f = find(editor.state.doc, a.setType.block); editor.dispatch(editor.state.tr.setNodeMarkup(f.pos, editor.state.schema.nodes[a.setType.type], { ...f.node.attrs, ...a.setType.attrs })); }
  else if (a.move) {
    const f = find(editor.state.doc, a.move.block);
    const tr = editor.state.tr.delete(f.pos, f.pos + f.node.nodeSize);
    const target = a.move.before ? find(tr.doc, a.move.before).pos : tr.doc.content.size;
    editor.dispatch(tr.insert(target, f.node));
  } else if (a.remove) { const f = find(editor.state.doc, a.remove); editor.dispatch(editor.state.tr.delete(f.pos, f.pos + f.node.nodeSize)); }
  else if (a.copy || a.drag) {
    // ProseMirror's paste and drop paths: the slice goes through transformPasted.
    const x = a.copy || a.drag;
    const f = find(editor.state.doc, x.block);
    let slice = editor.state.doc.slice(f.pos, f.pos + f.node.nodeSize);
    editor.someProp("transformPasted", (fn) => { slice = fn(slice, editor, false); });
    const target = x.before ? find(editor.state.doc, x.before).pos : editor.state.doc.content.size;
    const tr = editor.state.tr;
    if (a.drag && !x.copy) { tr.setSelection(NodeSelection.create(tr.doc, f.pos)); tr.deleteSelection(); }
    tr.replaceRange(tr.mapping.map(target), tr.mapping.map(target), slice);
    editor.dispatch(tr.setMeta("uiEvent", a.copy ? "paste" : "drop"));
  } else if (a.undo) t.undo();
}

export async function runBlockRow(row) {
  const saved = { ...ROOM_LIMITS };
  Object.assign(ROOM_LIMITS, row.roomLimits ?? {});
  try {
    return await runBlock(row);
  } finally {
    Object.assign(ROOM_LIMITS, saved);
  }
}

async function runBlock(row) {
  const sim = new Sim(row.seed ?? 1);
  const initial = record(row.page);
  const room = createRoom(sim, { page: initial }, { latency: () => 40, answerLatency: () => 40 });
  const tabs = new Map((row.tabs ?? ["a", "b"]).map((id) => [id, makeTab(sim, room, id, clone(initial))]));
  for (const t of tabs.values()) t.start();
  const problems = [];
  let file = clone(initial);
  for (const a of row.script) {
    const t = a.tab ? tabs.get(a.tab) : null;
    const step = () => {
      try {
        if (a.checkpoint) { file = clone(room.stores.get("page").value); room.land("page", room.seq); }
        else if (a.offline) room.close(a.offline);
        else if (a.online) room.open(a.online);
        else if (a.restart) room.restart({ page: file });
        else if (a.view) { const texts = tabs.get(a.view.tab).blocks().map(([, c]) => c); if (JSON.stringify(texts) !== JSON.stringify(a.view.texts)) problems.push(`at ${a.at} ${a.view.tab} shows ${JSON.stringify(texts)}`); }
        else if (a.type === undefined) act(a, t);
      } catch (err) { problems.push(`at ${a.at} ${a.tab}: ${err.message}`); }
    };
    if (a.type === undefined) { sim.at(a.at, step); continue; }
    const cps = a.cps ?? 8;
    if (!cps) { sim.at(a.at, () => { select(t, resolve(t, a.where)); t.input(a.type); }); continue; }
    [...a.type].forEach((ch, i) => sim.at(a.at + (i * 1000) / cps, () => { if (i === 0) select(t, resolve(t, a.where)); t.input(ch); }));
  }
  await sim.run(row.until ?? Math.max(...row.script.map((a) => a.at)) + 15000);
  await sim.idle(5000);

  const value = clone(room.stores.get("page").value);
  const live = Object.keys(value.blocks).filter((id) => !value.deleted?.[id]).sort((x, y) => {
    const px = value.blocks[x].pos ?? "", py = value.blocks[y].pos ?? "";
    return px !== py ? (px < py ? -1 : 1) : x < y ? -1 : 1;
  });
  const final = live.map((id) => value.blocks[id].c ?? value.blocks[id].t);
  const e = row.expect;
  if (typeof e.texts === "function" ? !e.texts(final) : JSON.stringify(final) !== JSON.stringify(e.texts)) problems.push(`texts ${JSON.stringify(final)}`);
  for (const id of Object.keys(value.deleted ?? {})) if (value.blocks[id]) problems.push(`the room still holds ${id} under its tombstone`);
  const notices = [...tabs.values()].flatMap((t) => t.allNotices().map((n) => ({ ...n, tab: t.id })));
  const match = (n, x) => n.kind === x.kind && (x.includes === undefined || (n.lost ?? "").includes(x.includes)) && (!x.tab || n.tab === x.tab);
  for (const x of e.notices) if (!notices.some((n) => match(n, x))) problems.push(`missing notice ${JSON.stringify(x)}`);
  for (const n of notices) if (!e.notices.some((x) => match(n, x))) problems.push(`unexpected notice ${n.tab} ${n.kind}: ${JSON.stringify(n.lost)}`);
  const removed = notices.filter((n) => n.kind === "removed").map((n) => `${n.tab} ${n.id} ${n.by ?? n.tab}`);
  if (new Set(removed).size !== removed.length) problems.push(`more than one removed notice for one block and author: ${removed.join(", ")}`);
  const extra = e.check?.({ value, tabs, notices, final });
  if (extra) problems.push(extra);
  problems.push(...check({ room, tabs }));
  problems.push(...(await reload({ sim, room, tabs })));
  return { id: row.id, source: row.source, policy: row.policy ?? null, pass: problems.length === 0, final, notices, problems, tabs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  let failed = 0;
  for (const row of BLOCK_ROWS.filter((x) => !only.length || only.includes(x.id))) {
    const out = await runBlockRow(row);
    if (!out.pass) failed++;
    const kinds = [...new Set(out.notices.map((n) => `${n.tab} ${n.kind}: ${JSON.stringify(n.lost)}`))];
    console.log(`${out.pass ? "pass" : "FAIL"}  ${row.id.padEnd(22)} ${JSON.stringify(out.final)}${kinds.length ? "\n      notices: " + kinds.join(" | ").slice(0, 400) : ""}${out.policy ? "\n      policy: " + out.policy : ""}${out.problems.length ? "\n      " + out.problems.join("\n      ") : ""}`);
  }
  console.log(`\n${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
