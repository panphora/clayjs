import { transform } from "../../vendor/prosemirror.vendor.js";
import { schema } from "../schema.js";
import { LOCAL, attrKeys, defaultOf, mintId } from "./layout.js";
import { tokensOf, tokenIndex, yAfter } from "./tokens.js";
import { CHUNK_CHARS, insertTokens, applyRegion, markRange } from "./writer.js";

const { AddMarkStep, RemoveMarkStep, AttrStep, Mapping } = transform;

const tableRange = (doc, from, to) => {
  const start = doc.resolve(from), end = doc.resolve(to);
  return [
    start.depth && start.node(1).type.name === "table" ? start.before(1) : from,
    end.depth && end.node(1).type.name === "table" ? end.after(1) : to,
  ];
};

export function localGroup(pd, transactions, w, stats, um = null) {
  const steps = [], docs = [], maps = [];
  for (const tr of transactions) tr.steps.forEach((s, i) => { steps.push(s); docs.push(tr.docs[i]); maps.push(s.getMap()); });
  if (!steps.length) return;
  const d0 = docs[0], dm = transactions[transactions.length - 1].doc;
  const alias = new Map();
  const implicit = [];
  { let tok = 0; w.visible.forEach((s) => { if (s.implicit) implicit.push({ tok, id: s.id, t: s.t }); tok += s.len; }); }
  implicit.sort((a, b) => b.tok - a.tok);
  for (const m of implicit) { m.alias = mintId(pd); alias.set(m.id, m.alias); }
  const holes = alias.size ? w.holes.map((h) => ({ at: h.at + implicit.filter((m) => m.tok < h.at).length, len: h.len })) : w.holes;
  const ia = tokenIndex(d0, alias, w.visible), ib = tokenIndex(dm, new Map(), w.visible);
  const bt = tokensOf(d0, alias, w.visible), at = tokensOf(dm, new Map(), w.visible);
  const regions = [];
  const markSteps = [];
  steps.forEach((step, i) => {
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) { markSteps.push({ i, step }); return; }
    const back = new Mapping(maps.slice(0, i)).invert();
    const fwd = new Mapping(maps.slice(i + 1));
    const ranges = [];
    if (step instanceof AttrStep) ranges.push([step.pos, step.pos + 1, step.pos, step.pos + 1]);
    else step.getMap().forEach((os, oe, ns, ne) => ranges.push([os, oe, ns, ne]));
    for (const [os, oe, ns, ne] of ranges) {
      const [oa, ob] = tableRange(d0, back.map(os, -1), back.map(oe, 1));
      const [na, nb] = tableRange(dm, fwd.map(ns, -1), fwd.map(ne, 1));
      regions.push({ oa, ob, na, nb });
    }
  });
  regions.sort((x, y) => x.oa - y.oa || x.na - y.na);
  const merged = [];
  for (const r of regions) {
    const last = merged[merged.length - 1];
    if (last && (r.oa <= last.ob || r.na <= last.nb)) { last.ob = Math.max(last.ob, r.ob); last.nb = Math.max(last.nb, r.nb); }
    else merged.push({ ...r });
  }
  const span = merged.reduce((n, r) => n + (ib[r.nb] - ib[r.na]), 0);
  const chunked = span > CHUNK_CHARS;
  const tx = chunked ? (fn) => pd.ydoc.transact(fn, LOCAL) : (fn) => fn();
  const ctx = { pd, holes, bt, tx };
  const sig = (toks) => toks.filter((t) => t.k === "b").map((t) => `${t.id}|${t.t}|${JSON.stringify(t.attrs)}`).join("\n");
  const structural = markSteps.length > 0 || sig(bt) !== sig(at);
  const write = () => {
    for (const m of implicit) {
      insertTokens(pd, yAfter(w.holes, m.tok), [{ k: "b", id: m.alias, t: m.t, attrs: Object.fromEntries(attrKeys(schema.nodes[m.t]).map((kk) => [kk, defaultOf(schema.nodes[m.t], kk)])) }], tx);
    }
    for (let q = merged.length - 1; q >= 0; q--) {
      const r = merged[q];
      const ta = ia[r.oa], tb = ia[r.ob];
      applyRegion(ctx, ta, bt.slice(ta, tb), at.slice(ib[r.na], ib[r.nb]));
    }
    for (const { i, step } of markSteps) {
      const fwd = new Mapping(maps.slice(i + 1));
      const from = ib[fwd.map(step.from, 1)], to = ib[fwd.map(step.to, -1)];
      if (to <= from) continue;
      const name = step.mark.type.name;
      const val = step instanceof AddMarkStep ? (step.mark.attrs && Object.keys(step.mark.attrs).length ? { ...step.mark.attrs } : true) : null;
      tx(() => markRange({ pd, holes: ctx.holes }, from, to, name, val, at));
    }
  };
  if (structural) um?.stopCapturing();
  if (chunked) write();
  else pd.ydoc.transact(write, LOCAL);
  if (structural) um?.stopCapturing();
  stats.groups++;
  stats.lastGroup = { chunked, structural, span };
}
