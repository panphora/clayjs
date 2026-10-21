import { Sim, createRoom, LIMITS } from '../../collab/room-double.js';
import { makeYTab, check, reload, seedValue, docOfValue } from './tab.js';
import { commands, state as pmState, model as pmModel } from '../../../../../src/vendor/prosemirror.vendor.js';
import { schema } from '../../../../../src/page/schema.js';
import { REMOTE } from '../../../../../src/page/model.js';
import { rng } from './rng.js';
import { PRESETS } from './presets.js';

const { TextSelection } = pmState;
const clone = (v) => JSON.parse(JSON.stringify(v));

export const DEFAULT = {
  tabs: ['a', 'b', 'c'],
  actions: 28,
  span: 14000,
  kinds: { type: 8, del: 4, enter: 2, join: 2, undo: 2, redo: 1, paste: 2, format: 1, pastecross: 1, delcross: 1 },
  chaos: { offline: 0, loss: 0, busy: 0, save: 0, savewhileout: 0 },
  blocks: 3,
  blockChars: 36,
};

export function genPlan(seed, cfg = DEFAULT) {
  const R = rng(seed);
  const plan = [];
  const kinds = Object.entries(cfg.kinds).flatMap(([k, w]) => Array(w).fill(k));
  for (let i = 0; i < cfg.actions * cfg.tabs.length; i++) {
    plan.push({ at: 700 + Math.floor(R.next() * cfg.span), tab: R.pick(cfg.tabs), kind: R.pick(kinds), f: [R.next(), R.next(), R.next()], n: 1 + R.int(3) });
  }
  const c = cfg.chaos;
  for (let i = 0; i < c.offline; i++) { const at = 1500 + Math.floor(R.next() * (cfg.span - 3000)); plan.push({ at, tab: R.pick(cfg.tabs), kind: 'offline', len: 800 + Math.floor(R.next() * 6000), f: [R.next(), 0, 0], n: 1 }); }
  for (let i = 0; i < c.loss; i++) {
    const at = 2500 + Math.floor(R.next() * (cfg.span - 4000));
    const age = c.fileAge ?? 0;
    if (age) plan.push({ at: at - age, tab: null, kind: 'checkpoint', f: [0, 0, 0], n: 1 });
    plan.push({ at, tab: null, kind: 'loss', f: [R.next(), 0, 0], n: 1, gap: c.gap !== undefined ? c.gap : R.pick([null, null, 250, 400, 1000]), fresh: !age });
  }
  for (let i = 0; i < c.busy; i++) plan.push({ at: 1500 + Math.floor(R.next() * (cfg.span - 4000)), tab: R.pick(cfg.tabs), kind: 'busy', len: 1000 + Math.floor(R.next() * 4000), f: [R.next(), 0, 0], n: 1 });
  for (let i = 0; i < c.save; i++) plan.push({ at: 1500 + Math.floor(R.next() * (cfg.span - 2000)), tab: R.pick(cfg.tabs), kind: 'save', f: [R.next(), 0, 0], n: 1, answer: R.pick([80, 800, 3000]) });
  for (let i = 0; i < (c.leave ?? 0); i++) plan.push({ at: 3000 + Math.floor(R.next() * (cfg.span - 4000)), tab: R.pick(cfg.tabs), kind: 'leave', f: [R.next(), 0, 0], n: 1 });
  plan.sort((x, y) => x.at - y.at);
  if ((c.leave ?? 0) > 0) {
    const leaves = plan.filter((a) => a.kind === 'leave');
    const keep = plan.filter((a) => !leaves.some((l) => l !== a && l.tab === a.tab && (a.at > l.at - 2500)) || a.kind === 'leave');
    plan.length = 0;
    plan.push(...keep);
  }
  if (cfg.avoidStruct) {
    const STRUCT = ['enter', 'join', 'delcross', 'pastecross'];
    const keep = plan.filter((a) => !STRUCT.includes(a.kind) || !plan.some((b) => b !== a && b.tab !== a.tab && Math.abs(b.at - a.at) < 1200 && !['loss', 'checkpoint'].includes(b.kind)));
    plan.length = 0;
    plan.push(...keep);
  }
  if (cfg.avoidLoss) {
    const out = plan.filter((a) => a.kind !== 'loss' || !plan.some((b) => (b.kind === 'offline' || b.kind === 'busy') && a.at > b.at - 200 && a.at < b.at + b.len + 3000));
    plan.length = 0;
    plan.push(...out);
  }
  if (cfg.avoid) {
    const out = [];
    for (const a of plan) {
      const windows = plan.filter((b) => b.kind === 'busy' && b.tab === a.tab);
      const hit = windows.some((w) => {
        const firstSave = plan.filter((x) => x.kind === 'save' && x.tab === w.tab && x.at > w.at && x.at < w.at + w.len + 3000)[0];
        return firstSave && a.at > firstSave.at && a.at < w.at + w.len + 3000 && ['del', 'undo', 'redo', 'paste', 'delcross', 'pastecross', 'type'].includes(a.kind);
      });
      if (!hit) out.push(a);
    }
    return out;
  }
  return plan;
}

const alphabet = (k) => String.fromCharCode(0x4e00 + k);

function textOf(doc) {
  const out = [];
  doc.forEach((node) => out.push(node.isTextblock ? node.textContent : ''));
  return out;
}
const uniq = (s) => [...s].filter((ch) => ch.charCodeAt(0) >= 0x4e00 && ch.charCodeAt(0) < 0x9fff);

export async function runPlan(plan, cfg = DEFAULT, { seed = 1, quiet = false } = {}) {
  const sim = new Sim(seed);
  let nextChar = 0;
  const fresh = (n) => { let s = ''; for (let i = 0; i < n; i++) s += alphabet(nextChar++); return s; };
  const words = (chars) => { let s = '', k = 0; while (k < chars) { const w = 1 + (k % 3); s += (s ? ' ' : '') + fresh(w); k += w; } return s; };
  const order = ['p', 'q', 'r', 's', 't'].slice(0, cfg.blocks);
  const seedBlocks = order.map((id) => ({ id, text: words(cfg.blockChars) }));
  const initial = seedValue(seedBlocks);
  const initChars = new Set(uniq(seedBlocks.map((b) => b.text).join('')));
  const refuse = { until: new Map() };
  const room = createRoom(sim, { page: initial }, {
    latency: () => 20 + sim.rand() * 100, answerLatency: () => 20 + sim.rand() * 100,
    refuse: (clientId) => (sim.now() < (refuse.until.get(clientId) ?? -1) ? { status: 503, body: { code: 'busy' }, retryAfter: 2 } : null),
  });
  const tabs = new Map();
  for (const id of cfg.tabs) tabs.set(id, makeYTab(sim, room, id, clone(initial), { compact: cfg.compact }));

  const ev = new Map();
  const undoCaps = new WeakMap();
  const undone = new Set();
  const log = (c, kind, tab) => { (ev.get(c) ?? ev.set(c, []).get(c)).push({ kind, tab, t: sim.now() }); };
  for (const t of tabs.values()) {
    const view = t.editor;
    const orig = view.props.dispatchTransaction;
    view.setProps({ dispatchTransaction: (tr) => {
      const remote = tr.getMeta(REMOTE) && !tr.getMeta('yundo');
      const before = remote ? null : new Set(uniq(textOf(view.state.doc).join('')));
      orig(tr);
      if (remote) return;
      const after = new Set(uniq(textOf(view.state.doc).join('')));
      for (const c of before) if (!after.has(c)) log(c, 'del', t.id);
      for (const c of after) if (!before.has(c)) log(c, 'ins', t.id);
    } });
  }
  for (const c of initChars) ev.set(c, [{ kind: 'init', tab: null, t: 0 }]);

  for (const t of tabs.values()) t.start();
  const errors = [];
  const losses = [];
  const marks = [];
  const bolded = new Set();
  const gone = new Set();
  let file = clone(initial);
  const exec = (a) => {
    try {
      const t = a.tab ? tabs.get(a.tab) : null;
      if (a.kind === 'checkpoint') { marks.push(sim.now()); file = clone(room.stores.get('page').value); room.land('page', room.seq); return; }
      if (a.kind === 'loss') {
        marks.push(sim.now(), sim.now() + (a.gap ?? 0));
        if (a.fresh) { file = clone(room.stores.get('page').value); room.land('page', room.seq); }
        cfg.debug?.('loss', { sim, room, tabs, file });
        sim.after(5, () => { losses.push(sim.now()); room.restart({ page: file }); });
        if (a.gap) sim.after(5 + a.gap, () => { losses.push(sim.now()); room.restart({ page: file }); });
        return;
      }
      if (a.kind === 'leave') { if (t && tabs.size > 1) { room.close(t.id); try { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } catch {} tabs.delete(t.id); gone.add(t.id); } return; }
      if (a.kind === 'offline') { if (t && room.clients.get(t.id)?.connected) { room.close(t.id); sim.after(a.len, () => { if (!gone.has(t.id) && !room.clients.get(t.id)?.connected) room.open(t.id); }); } return; }
      if (a.kind === 'busy') { room.refuseUntil = sim.now() + a.len; refuse.until.set(t.id, sim.now() + a.len); return; }
      if (a.kind === 'save') { t.save({ answer: a.answer }); return; }
      if (!t) return;
      const prevItem = t.bridge.um.undoStack.at(-1);
      act(t, a);
      if (a.kind !== 'undo' && a.kind !== 'redo') {
        const item = t.bridge.um.undoStack.at(-1);
        if (item && item !== prevItem) {
          const chars = [];
          for (const [c, es] of ev) if (es.some((e) => e.kind === 'ins' && e.tab === t.id && e.t === a.at)) chars.push(c);
          if (chars.length) undoCaps.set(item, chars);
        }
      }
    } catch (err) { errors.push(`at ${a.at} ${a.tab} ${a.kind}: ${err.stack?.split('\n').slice(0, 3).join(' | ')}`); }
  };

  function sel(t, from, to = from) { t.editor.dispatch(t.editor.state.tr.setSelection(TextSelection.create(t.editor.state.doc, from, to))); }
  function pick(t, f1, f2) {
    const doc = t.editor.state.doc;
    const list = [];
    doc.forEach((node, pos) => { if (node.isTextblock) list.push({ node, pos, len: node.content.size }); });
    if (!list.length) return null;
    const b = list[Math.floor(f1 * list.length)];
    return { ...b, off: Math.floor(f2 * (b.len + 1)), list };
  }
  function act(t, a) {
    const view = t.editor;
    const run = (cmd) => cmd(view.state, view.dispatch);
    if (a.kind === 'type') {
      const p = pick(t, a.f[0], a.f[1]); if (!p) return;
      sel(t, p.pos + 1 + p.off); t.input(words(a.n + 1).slice(0, 4));
    } else if (a.kind === 'del') {
      const p = pick(t, a.f[0], a.f[1]); if (!p || !p.len) return;
      const len = Math.min(p.len - Math.min(p.off, p.len - 1), 1 + Math.floor(a.f[2] * 6));
      const from = p.pos + 1 + Math.min(p.off, p.len - 1);
      sel(t, from, from + len); run(commands.deleteSelection);
    } else if (a.kind === 'delcross') {
      const p = pick(t, a.f[0], a.f[1]); if (!p || p.list.length < 2) return;
      const i = p.list.indexOf(p.list.find((x) => x.pos === p.pos)), q = p.list[Math.min(p.list.length - 1, i + 1 + (a.n % 2))];
      const from = p.pos + 1 + Math.min(p.off, p.len), to = q.pos + 1 + Math.min(q.len, Math.floor(a.f[2] * (q.len + 1)));
      if (to > from) { sel(t, from, to); run(commands.deleteSelection); }
    } else if (a.kind === 'enter') {
      const p = pick(t, a.f[0], a.f[1]); if (!p) return;
      sel(t, p.pos + 1 + p.off); run(commands.splitBlock);
    } else if (a.kind === 'move') {
      const blocks = [];
      view.state.doc.forEach((node, pos) => blocks.push({ node, pos }));
      if (blocks.length < 2) return;
      const from = blocks[Math.floor(a.f[0] * blocks.length)];
      const tr = view.state.tr;
      tr.delete(from.pos, from.pos + from.node.nodeSize);
      const stops = [0];
      tr.doc.forEach((node, pos) => stops.push(pos + node.nodeSize));
      tr.insert(stops[Math.floor(a.f[1] * stops.length)], from.node);
      view.dispatch(tr);
    } else if (a.kind === 'delblock') {
      const blocks = [];
      view.state.doc.forEach((node, pos) => blocks.push({ node, pos }));
      if (blocks.length < 2) return;
      const b = blocks[Math.floor(a.f[0] * blocks.length)];
      view.dispatch(view.state.tr.delete(b.pos, b.pos + b.node.nodeSize));
    } else if (a.kind === 'attr') {
      const p = pick(t, a.f[0], a.f[1]); if (!p) return;
      const node = view.state.doc.nodeAt(p.pos);
      const tr = view.state.tr;
      const choice = a.n % 3;
      if (choice === 0) tr.setNodeMarkup(p.pos, schema.nodes.heading, { ...node.attrs, level: 1 + Math.floor(a.f[2] * 3) });
      else if (choice === 1) tr.setNodeMarkup(p.pos, schema.nodes.list_item, { ...node.attrs, kind: ['bullet', 'number', 'todo'][Math.floor(a.f[2] * 3)], indent: Math.floor(a.f[1] * 3) });
      else if (node.type.name === 'list_item') tr.setNodeAttribute(p.pos, 'checked', !node.attrs.checked);
      else if (node.type.name === 'heading') tr.setNodeAttribute(p.pos, 'level', 1 + Math.floor(a.f[2] * 3));
      else tr.setNodeMarkup(p.pos, schema.nodes.paragraph, { ...node.attrs });
      view.dispatch(tr);
    } else if (a.kind === 'join') {
      const p = pick(t, a.f[0], a.f[1]); if (!p || p.list.indexOf(p.list.find((x) => x.pos === p.pos)) === 0) return;
      sel(t, p.pos + 1); run(commands.joinBackward);
    } else if (a.kind === 'undo') {
      const stack = [...t.bridge.um.undoStack];
      if (t.bridge.undo()) {
        const item = stack[t.bridge.um.undoStack.length];
        const chars = item ? (undoCaps.get(item) ?? []) : [];
        const top = t.bridge.um.redoStack.at(-1);
        if (top && chars.length) undoCaps.set(top, chars);
        for (const c of chars) undone.add(c);
      }
    } else if (a.kind === 'redo') {
      const stack = [...t.bridge.um.redoStack];
      if (t.bridge.redo()) {
        const item = stack[t.bridge.um.redoStack.length];
        const chars = item ? (undoCaps.get(item) ?? []) : [];
        const top = t.bridge.um.undoStack.at(-1);
        if (top && chars.length) undoCaps.set(top, chars);
        for (const c of chars) undone.delete(c);
      }
    }
    else if (a.kind === 'paste') {
      const p = pick(t, a.f[0], a.f[1]); if (!p) return;
      const to = p.pos + 1 + Math.min(p.len, p.off + Math.floor(a.f[2] * 4));
      sel(t, p.pos + 1 + p.off, to); view.dispatch(view.state.tr.replaceSelection(new pmModel.Slice(pmModel.Fragment.from(schema.text(`${fresh(2)} ${fresh(2)}`)), 0, 0)));
    } else if (a.kind === 'pastecross') {
      const p = pick(t, a.f[0], a.f[1]); if (!p) return;
      sel(t, p.pos + 1 + p.off); view.dispatch(view.state.tr.replaceSelection(new pmModel.Slice(pmModel.Fragment.from([schema.nodes.paragraph.create({ id: 'n' + (nextChar++) + t.id }, schema.text(fresh(2))), schema.nodes.paragraph.create({ id: 'n' + (nextChar++) + t.id }, schema.text(`${fresh(2)} ${fresh(1)}`))]), 1, 1)));
    } else if (a.kind === 'format') {
      const p = pick(t, a.f[0], a.f[1]); if (!p || !p.len) return;
      const from = p.pos + 1 + Math.min(p.off, p.len - 1), to = Math.min(p.pos + 1 + p.len, from + 1 + Math.floor(a.f[2] * 8));
      for (const ch of uniq(view.state.doc.textBetween(from, to, ''))) if (initChars.has(ch)) bolded.add(ch);
      view.dispatch(view.state.tr.addMark(from, to, view.state.schema.marks.strong.create()));
    }
  }
  for (const a of plan) sim.at(a.at, () => { exec(a); cfg.trace?.(a, { sim, room, tabs }); });

  let crashed = null;
  try {
    await sim.run((cfg.span ?? 14000) + 20000);
    await sim.idle(6000);
  } catch (err) { crashed = err.stack?.split('\n').slice(0, 4).join(' | '); }

  cfg.debug?.('end', { sim, room, tabs });
  const findings = [];
  if (crashed) findings.push({ cls: 'exception', detail: crashed });
  for (const e of errors) findings.push({ cls: 'exception', detail: e });
  if (crashed) return { findings, plan };
  const problems = check({ room, tabs });
  problems.push(...(await reload({ sim, room, tabs })));
  const value = clone(room.stores.get('page').value);
  const finalBlocks = [];
  docOfValue(value).forEach((n) => finalBlocks.push(n.isTextblock ? n.textContent : ''));
  const finalText = finalBlocks.join('\n');
  const views = [...tabs.values()].map((t) => t.blocks().map(([, c]) => c));
  const roomViews = JSON.stringify(finalBlocks);
  const disagree = views.some((v) => JSON.stringify(v) !== roomViews);
  const mism = problems.filter((x) => x.includes('bridge mismatch'));
  const real = problems.filter((x) => !x.includes('bridge mismatch'));
  if (disagree || real.length) findings.push({ cls: 'diverged', detail: JSON.stringify({ room: finalBlocks, views, problems: real }) });
  if (mism.length) findings.push({ cls: 'mismatch', detail: JSON.stringify({ problems: mism }) });
  const notices = [...tabs.values()].flatMap((t) => t.allNotices().map((n) => ({ ...n, tab: t.id })));
  const noticeText = JSON.stringify(notices);
  const count = new Map();
  for (const c of uniq(finalText)) count.set(c, (count.get(c) ?? 0) + 1);
  const lossNear = (t) => losses.some((x) => Math.abs(x - t) < 2500) && losses.length >= 2;
  const doubled = losses.length >= 2 && losses.some((x, i) => i > 0 && x - losses[i - 1] < 1500);
  for (const [c, es] of ev) {
    const kinds = es.map((e) => e.kind);
    const ins = kinds.filter((k) => k === 'ins').length, del = kinds.filter((k) => k === 'del').length;
    const n = count.get(c) ?? 0;
    const inNotice = noticeText.includes(c);
    if (ins <= 1 && kinds[kinds.length - 1] !== 'del' && (ins === 1 || kinds[0] === 'init') && del === 0) {
      if (n === 0 && !inNotice && !undone.has(c)) findings.push({ cls: 'silent-loss', detail: `${c} U+${c.charCodeAt(0).toString(16)} typed/initial by ${es[0].tab} at ${es[0].t}` });
    }
    const removedBy = new Set(notices.filter((x) => x.kind === 'removed').map((x) => x.tab));
    const extraIns = kinds[0] === 'init' ? ins : Math.max(0, ins - 1);
    if (n > 1 + extraIns && !doubled) findings.push({ cls: 'duplicate', detail: `${c} x${n}` });
    if (del >= 1 && extraIns === 0 && kinds[kinds.length - 1] === 'del' && n > 0 && !es.some((e) => e.kind === 'del' && removedBy.has(e.tab)) && (!es.some((e) => marks.some((m) => Math.abs(e.t - m) < 450)))) findings.push({ cls: 'undead', detail: `${c} deleted by ${es.filter((e) => e.kind === 'del').map((e) => e.tab + '@' + e.t)} still present x${n}` });
  }
  for (const n of notices) {
    if (n.kind === 'heal' || n.kind === 'refused') {
      const named = uniq(n.lost ?? '');
      const present = named.filter((c) => (count.get(c) ?? 0) >= 1);
      if (named.length && present.length === named.length && !doubled && !n.block) findings.push({ cls: 'false-notice', detail: `${n.kind} ${JSON.stringify(n.lost)} by ${n.tab} is in the final text` });
    }
  }
  let marksChecked = 0;
  if (cfg.marksCheck) {
    for (const t of tabs.values()) {
      const boldOf = new Map();
      t.editor.state.doc.descendants((node) => {
        if (!node.isText) return;
        const bold = node.marks.some((m) => m.type.name === 'strong');
        for (const ch of uniq(node.text)) boldOf.set(ch, [...(boldOf.get(ch) ?? []), bold]);
      });
      for (const ch of initChars) {
        const list = boldOf.get(ch);
        if (!list || list.length !== 1) continue;
        const want = bolded.has(ch);
        marksChecked++;
        if (list[0] !== want) findings.push({ cls: want ? 'format-lost' : 'format-spurious', detail: `${ch} on ${t.id}` });
      }
    }
  }
  for (const t of tabs.values()) { try { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } catch {} }
  return { findings, plan, final: finalBlocks, notices, losses, ev };
}

export async function shrink(plan, cfg, seed, cls) {
  let cur = plan;
  const bad = async (p) => { const out = await runPlan(p, cfg, { seed, quiet: true }); return out.findings.some((f) => f.cls === cls); };
  let n = 2;
  while (cur.length >= 2) {
    const size = Math.ceil(cur.length / n);
    let reduced = false;
    for (let i = 0; i < cur.length; i += size) {
      const trial = cur.slice(0, i).concat(cur.slice(i + size));
      if (trial.length && (await bad(trial))) { cur = trial; n = Math.max(n - 1, 2); reduced = true; break; }
    }
    if (!reduced) { if (n >= cur.length) break; n = Math.min(cur.length, n * 2); }
  }
  return cur;
}



export async function runPreset({ preset, seeds = 30, from = 1 }) {
  const cfg = { ...DEFAULT, ...(PRESETS[preset] ?? {}) };
  const summary = new Map();
  const seedsWith = new Map();
  const lines = [];
  for (let s = from; s < from + seeds; s++) {
    const plan = genPlan(s * 7919, cfg);
    const out = await runPlan(plan, cfg, { seed: s });
    for (const c of new Set(out.findings.map((f) => f.cls))) seedsWith.set(c, (seedsWith.get(c) ?? 0) + 1);
    for (const f of out.findings) summary.set(f.cls, (summary.get(f.cls) ?? 0) + 1);
    if (out.findings.length) lines.push(`seed ${s}: ${[...new Set(out.findings.map((f) => f.cls))].join(',')} ${out.findings.slice(0, 2).map((f) => f.detail.slice(0, 160)).join(' || ')}`);
  }
  return { preset, seeds, from, summary: Object.fromEntries(summary), seedsWith: Object.fromEntries(seedsWith), lines };
}
