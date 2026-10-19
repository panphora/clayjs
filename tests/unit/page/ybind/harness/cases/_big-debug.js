import { Sim, createRoom, makeTab, legacy } from '../compat.js';
import { rng } from '../rng.js';

const TOK = /w\d+|日\d+本|e\d+😀/gu;
const MARK = /⟦[abc]\d+⟧/gu;

function filler(n, R) {
  const out = [];
  let len = 0, i = 0;
  while (len < n) {
    const kind = R.int(3);
    const t = kind === 0 ? `w${i}` : kind === 1 ? `日${i}本` : `e${i}😀`;
    out.push(t);
    len += t.length + 1;
    i++;
  }
  return out.join(' ');
}

export async function runBig(seed, o = {}) {
  const cfg = { n: 12000, tabs: ['a', 'b', 'c'], span: 12000, per: 10, offline: 0, loss: 0, busy: 0, save: 0, ...o };
  const R = rng(seed * 104729);
  const text = filler(cfg.n, R);
  const initial = { blocks: { p: { t: 'paragraph', pos: 'B', c: text } }, deleted: {} };
  const sim = new Sim(seed);
  const refuse = new Map();
  const room = createRoom(sim, { page: initial }, {
    latency: () => 20 + sim.rand() * 100, answerLatency: () => 20 + sim.rand() * 100,
    refuse: (id) => (sim.now() < (refuse.get(id) ?? -1) ? { status: 503, body: { code: 'busy' }, retryAfter: 2 } : null),
  });
  const tabs = new Map(cfg.tabs.map((id) => [id, makeTab(sim, room, id, JSON.parse(JSON.stringify(initial)), { quiet: 500 })]));
  for (const t of tabs.values()) t.start();
  const typed = [], touched = new Set(), errors = [];
  let counter = 0, file = JSON.parse(JSON.stringify(room.stores.get('page').value));
  const losses = [];
  const plan = [];
  for (const id of cfg.tabs) for (let k = 0; k < cfg.per; k++) plan.push({ at: 800 + Math.floor(R.next() * cfg.span), tab: id, kind: R.next() < 0.6 ? 'type' : 'del', f: [R.next(), R.next()] });
  for (let k = 0; k < cfg.offline; k++) plan.push({ at: 1500 + Math.floor(R.next() * (cfg.span - 3000)), tab: R.pick(cfg.tabs), kind: 'offline', len: 800 + Math.floor(R.next() * 5000) });
  for (let k = 0; k < cfg.loss; k++) plan.push({ at: 2500 + Math.floor(R.next() * (cfg.span - 4000)), tab: null, kind: 'loss', fresh: R.next() < 0.7 });
  for (let k = 0; k < cfg.busy; k++) plan.push({ at: 1500 + Math.floor(R.next() * (cfg.span - 4000)), tab: R.pick(cfg.tabs), kind: 'busy', len: 1000 + Math.floor(R.next() * 4000) });
  for (let k = 0; k < cfg.save; k++) plan.push({ at: 1500 + Math.floor(R.next() * (cfg.span - 2000)), tab: R.pick(cfg.tabs), kind: 'save', answer: R.pick([80, 800, 3000]) });
  plan.sort((x, y) => x.at - y.at);
  const outside = (s, pos) => { for (const m of s.matchAll(MARK)) if (m.index < pos && pos < m.index + m[0].length) return m.index + m[0].length; return pos; };
  const exec = (a) => {
    const t = a.tab ? tabs.get(a.tab) : null;
    try {
      if (a.kind === 'offline') { if (room.clients.get(t.id)?.connected) { room.close(t.id); sim.after(a.len, () => { if (!room.clients.get(t.id)?.connected) room.open(t.id); }); } return; }
      if (a.kind === 'loss') { if (a.fresh) { file = JSON.parse(JSON.stringify(room.stores.get('page').value)); room.land('page', room.seq); } sim.after(5, () => { losses.push(sim.now()); room.restart({ page: file }); }); return; }
      if (a.kind === 'busy') { refuse.set(t.id, sim.now() + a.len); return; }
      if (a.kind === 'save') { t.save({ answer: a.answer }); return; }
      const view = t.view;
      if (view == null) return;
      if (a.kind === 'type') {
        let pos = Math.floor(a.f[0] * (view.length + 1));
        const sp = view.indexOf(' ', pos);
        pos = sp < 0 ? view.length : sp;
        if (pos === 0) pos = view.length;
        const m = `⟦${t.id}${counter++}⟧`;
        typed.push(m);
        t.replace(pos, pos, m);
      } else {
        const words = [];
        for (const w of view.matchAll(/\S+/gu)) words.push([w.index, w.index + w[0].length]);
        if (!words.length) return;
        const k = Math.floor(a.f[0] * words.length), m = Math.min(words.length - 1, k + Math.floor(a.f[1] * 12));
        let i = words[k][0], j = words[m][1];
        const mk = view.slice(i, j).search(/⟦/u);
        if (mk >= 0) j = i + mk;
        if (j <= i) return;
        for (const w of view.matchAll(TOK)) if (w.index < j && w.index + w[0].length > i) touched.add(w[0]);
        t.replace(i, j, '');
      }
    } catch (err) { errors.push(`at ${a.at} ${a.tab} ${a.kind}: ${err.stack?.split('\n').slice(0, 3).join(' | ')}`); }
  };
  for (const a of plan) sim.at(a.at, () => exec(a));
  let crashed = null;
  try { await sim.run(cfg.span + 20000); await sim.idle(8000); } catch (err) { crashed = err.stack?.split('\n').slice(0, 4).join(' | '); }
  const findings = [];
  if (crashed) findings.push({ cls: 'exception', detail: crashed });
  for (const e of errors) findings.push({ cls: 'exception', detail: e });
  if (!crashed) {
    const final = legacy(room).blocks.p?.c ?? '';
    const views = [...tabs.values()].map((t) => t.view);
    if (views.some((v) => v !== final)) { const tl = [...tabs.values()]; views.forEach((v, i) => { if (v !== final) { let p = 0; while (p < v.length && v[p] === final[p]) p++; let q = 0; while (q < v.length - p && q < final.length - p && v[v.length - 1 - q] === final[final.length - 1 - q]) q++; console.log('DIFF tab', tl[i].id, 'at', p, 'tabHas', JSON.stringify(v.slice(Math.max(0, p - 20), v.length - q + 20).slice(0, 300)), 'roomHas', JSON.stringify(final.slice(Math.max(0, p - 20), final.length - q + 20).slice(0, 300))); } }); console.log('PLAN', JSON.stringify(plan.filter((a) => !['type', 'del'].includes(a.kind)))); } if (views.some((v) => v !== final)) findings.push({ cls: 'diverged', detail: JSON.stringify(views.map((v) => v === final ? 'same' : (v ?? 'null').length)) });
    const notices = [...tabs.values()].flatMap((t) => t.allNotices().map((n) => ({ ...n, tab: t.id })));
    const noticeText = JSON.stringify(notices);
    const seen = new Map();
    for (const m of final.matchAll(MARK)) seen.set(m[0], (seen.get(m[0]) ?? 0) + 1);
    for (const m of typed) {
      const n = seen.get(m) ?? 0;
      if (n === 0 && !noticeText.includes(m)) findings.push({ cls: 'silent-loss', detail: `marker ${m}` });
      if (n > 1) findings.push({ cls: 'duplicate', detail: `marker ${m} x${n}` });
    }
    const toks = [...final.replace(MARK, '').matchAll(TOK)].map((m) => m[0]);
    const idOf = (t) => +t.match(/\d+/)[0];
    const count = new Map();
    for (const t of toks) count.set(t, (count.get(t) ?? 0) + 1);
    for (const [t, n] of count) if (n > 1 && losses.length < 2) findings.push({ cls: 'duplicate', detail: `token ${t} x${n}` });
    for (let i = 1; i < toks.length; i++) if (idOf(toks[i]) < idOf(toks[i - 1])) { findings.push({ cls: 'order', detail: `${toks[i - 1]} before ${toks[i]}` }); break; }
    const orig = new Set([...text.matchAll(TOK)].map((m) => m[0]));
    for (const t of orig) if (!touched.has(t) && !count.has(t) && !noticeText.includes(t)) { findings.push({ cls: 'silent-loss', detail: `untouched token ${t}` }); }
    const stray = final.replace(MARK, '').replace(TOK, '').replace(/ /g, '');
    if (stray.length > 400) findings.push({ cls: 'stray', detail: `${stray.length} leftover chars` });
  }
  const noticeKinds = [...tabs.values()].flatMap((t) => t.allNotices().map((n) => n.kind));
  for (const t of tabs.values()) { try { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } catch {} }
  return { findings, noticeKinds };
}
