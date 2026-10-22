/**
 * @jest-environment jsdom
 */
import { mergePageModels } from "../../../src/page/merge.js";
import * as P from "../../../src/page/projection.js";
import { HyperMorph } from "../../../src/vendor/hyper-morph.vendor.js";
import { RECORD } from "./fixtures/all-kinds.js";

const clean = P.fragmentCleaner(document);
const base = P.blocksOfValues([RECORD]);
const fallbackOf = (id) => base[id]?.artifact?.fallbackHtml ?? "";
const articleOf = (model, rev) => {
  const a = document.createElement("article");
  a.setAttribute("data-page", "");
  if (rev) a.setAttribute("data-rev", rev);
  a.innerHTML = P.renderModel(model, { fallbackOf, clean });
  return a;
};
const Bmodel = P.project(base);
const Brev = P.revOf(Bmodel);
const Bart = articleOf(Bmodel, Brev);
const edit = (fn) => { const a = Bart.cloneNode(true); fn(a); return a; };
const q = (a, s) => a.querySelector(s);
const known = new Map(Bmodel.map((i) => [i.id, i]));
const parse = (a) => P.parseModel(a, { seed: Brev, known });
const B = parse(Bart);
const byId = (items) => new Map(items.map((x) => [x.id, x]));
const eq = (x, y) => P.canon(x) === P.canon(y);

const mergeModels = (l, c, r) => mergePageModels(l, c, r, { doc: document, merge3: HyperMorph.merge3, mergeJson: HyperMorph.mergeJson });
const merged = (cur, inc) => mergeModels(B, parse(edit(cur)), parse(edit(inc)));

test("different blocks", () => {
  const res = merged(
    (a) => { q(a, '[data-id="after"]').textContent = "Back at the top, tab"; },
    (a) => { q(a, '[data-id="h"]').textContent = "Outside heading"; },
  );
  const m = byId(res.items);
  expect(m.get("after").c === "Back at the top, tab" && m.get("h").c === "Outside heading").toBe(true);
});

test("same paragraph different words", () => {
  const res = merged(
    (a) => { q(a, '[data-id="after"]').textContent = "Back at the very top"; },
    (a) => { q(a, '[data-id="after"]').textContent = "Back at the top now"; },
  );
  expect(byId(res.items).get("after").c === "Back at the very top now").toBe(true);
});

test("same words conflict", () => {
  const res = merged(
    (a) => { q(a, '[data-id="after"]').textContent = "Back at the bottom"; },
    (a) => { q(a, '[data-id="after"]').textContent = "Back at the side"; },
  );
  expect(byId(res.items).get("after").c === "Back at the side").toBe(true);
  const text = res.conflicts.filter((k) => k.kind === "text" && k.id === "after");
  expect(text.length).toBe(1);
});

test("marks: tab bolds, outside edits word", () => {
  const res = merged(
    (a) => { const p = q(a, '[data-id="after"]'); p.innerHTML = "<strong>Back</strong> at the top"; },
    (a) => { q(a, '[data-id="after"]').textContent = "Back at the summit"; },
  );
  const x = byId(res.items).get("after");
  expect(x.c === "Back at the summit" && JSON.stringify(x.m ?? []).includes('"b"')).toBe(true);
});

test("table: outside edits cell, tab adds row", () => {
  const res = merged(
    (a) => {
      const tb = q(a, 'table[data-id="tbl"] tbody') || q(a, 'table[data-id="tbl"]');
      const tr = a.ownerDocument.createElement("tr");
      tr.setAttribute("data-id", "r3");
      tr.innerHTML = "<td>Oct 5</td><td>60</td><td>new</td>";
      tb.appendChild(tr);
    },
    (a) => { q(a, 'tr[data-id="r1"] td:nth-child(2)').textContent = "59"; },
  );
  const t = byId(res.items).get("tbl");
  const r1 = t.rows.find((r) => r.id === "r1");
  expect(r1.cells.c2 === "59" && t.rows.some((r) => r.id === "r3")).toBe(true);
});

test("table: outside inserts column in middle, tab edits last cell", () => {
  const res = merged(
    (a) => { q(a, 'tr[data-id="r2"] td:nth-child(3)').textContent = "invite fixed"; },
    (a) => {
      const th = a.ownerDocument.createElement("th");
      th.setAttribute("data-col", "c4");
      th.textContent = "Owner";
      q(a, 'th[data-col="c1"]').after(th);
      for (const tr of a.querySelectorAll('table[data-id="tbl"] tr[data-id]')) {
        const td = a.ownerDocument.createElement("td");
        td.textContent = tr.getAttribute("data-id") === "r1" ? "Ann" : "Bo";
        tr.children[0].after(td);
      }
    },
  );
  const t = byId(res.items).get("tbl");
  const r2 = t.rows.find((r) => r.id === "r2");
  expect(t.cols.length === 4 && r2.cells.c3 === "invite fixed" && r2.cells.c4 === "Bo" && r2.cells.c2 === "41").toBe(true);
});

test("board: outside moves card, tab renames it", () => {
  const res = merged(
    (a) => { q(a, 'li[data-id="a"]').textContent = "Sample inbox v2"; },
    (a) => { const li = q(a, 'li[data-id="a"]'); q(a, 'div[data-col="k2"] ul').appendChild(li); },
  );
  const b = byId(res.items).get("bd");
  const k = b.cards.find((x) => x.id === "a");
  expect(k.col === "k2" && k.title === "Sample inbox v2").toBe(true);
});

test("outside deletes block tab edited", () => {
  const res = merged(
    (a) => { q(a, '[data-id="after"]').textContent = "edited by tab"; },
    (a) => { q(a, '[data-id="after"]').remove(); },
  );
  expect(byId(res.items).get("after")?.c === "edited by tab").toBe(true);
  expect(res.conflicts.filter((k) => k.kind === "kept-edit" && k.id === "after").length).toBe(1);
});

test("list: outside indents l5 under l4, tab edits l5", () => {
  const res = merged(
    (a) => { q(a, '[data-id="l5"]').firstChild.textContent = "Second bullet edited"; },
    (a) => {
      const l5 = q(a, '[data-id="l5"]');
      const ul = a.ownerDocument.createElement("ul");
      ul.appendChild(l5);
      q(a, '[data-id="l4"]').appendChild(ul);
    },
  );
  const x = byId(res.items).get("l5");
  expect(!!x && x.c === "Second bullet edited" && (x.indent ?? 0) === 3).toBe(true);
});

test("tool state disjoint keys", () => {
  const res = merged(
    (a) => { const s = q(a, 'section[data-id="tool"] script'); const v = JSON.parse(s.textContent); v.state.m = 2; s.textContent = JSON.stringify(v); },
    (a) => { const s = q(a, 'section[data-id="tool"] script'); const v = JSON.parse(s.textContent); v.state.n = 5; s.textContent = JSON.stringify(v); },
  );
  const t = byId(res.items).get("tool");
  expect(t.state.n === 5 && t.state.m === 2).toBe(true);
});

test("checklist: outside checks c2, tab edits c2 text", () => {
  const res = merged(
    (a) => { const li = q(a, '[data-id="c2"]'); li.lastChild.textContent = "Invite copy final"; },
    (a) => { const li = q(a, '[data-id="c2"]'); const cb = li.querySelector("input"); if (cb) cb.setAttribute("checked", ""); },
  );
  const x = byId(res.items).get("c2");
  expect(x.c === "Invite copy final" && x.checked === true).toBe(true);
});

test("outside moves h2 after 'after', tab edits h2", () => {
  const res = merged(
    (a) => { q(a, '[data-id="h2"]').textContent = "What changed (tab)"; },
    (a) => { const h2 = q(a, '[data-id="h2"]'); q(a, '[data-id="after"]').after(h2); },
  );
  const m = byId(res.items);
  expect(res.items.findIndex((x) => x.id === "h2") > res.items.findIndex((x) => x.id === "after") && m.get("h2").c === "What changed (tab)").toBe(true);
});

test("both insert after h2", () => {
  const res = merged(
    (a) => { const p = a.ownerDocument.createElement("p"); p.setAttribute("data-id", "b-tabnew"); p.textContent = "tab new"; q(a, '[data-id="h2"]').after(p); },
    (a) => { const p = a.ownerDocument.createElement("p"); p.textContent = "outside new"; q(a, '[data-id="h2"]').after(p); },
  );
  const k = res.items.findIndex((x) => x.id === "h2");
  expect(res.items.slice(k + 1, k + 3).map((x) => x.c).sort().join("|") === "outside new|tab new").toBe(true);
});

test("outside moves tb1 out of toggle, tab edits", () => {
  const res = merged(
    (a) => { q(a, '[data-id="tb1"]').textContent = "Inside the toggle (tab)"; },
    (a) => { const p = q(a, '[data-id="tb1"]'); q(a, '[data-id="tg"]').after(p); },
  );
  const x = byId(res.items).get("tb1");
  expect((x.parent ?? null) === null && x.c === "Inside the toggle (tab)").toBe(true);
});

test("outside deletes toggle, tab edits child", () => {
  const res = merged(
    (a) => { q(a, '[data-id="tb3"]').textContent = "Two deep (tab)"; },
    (a) => { q(a, '[data-id="tg"]').remove(); },
  );
  const m = byId(res.items);
  const x = m.get("tb3");
  expect(!!x && (x.parent == null || m.has(x.parent))).toBe(true);
});

test("a code block both sides changed keeps its newlines", () => {
  const l = [{ id: "code", t: "code_block", c: "a\n  b" }];
  const cur = [{ id: "code", t: "code_block", c: "a\n  b\n  c" }];
  const inc = [{ id: "code", t: "code_block", c: "x\n  b" }];
  const res = mergeModels(l, cur, inc);
  expect(res.items.map((x) => x.id)).toEqual(["code"]);
  expect(res.items[0].c).toBe("x\n  b");
  const text = res.conflicts.filter((k) => k.kind === "text" && k.id === "code");
  expect(text).toHaveLength(1);
  expect(text[0].local).toBe("a\n  b\n  c");
  expect(text[0].remote).toBe("x\n  b");
});

test("an incoming model whose blocks lost their data-ids keeps them", () => {
  const l = [
    { id: "h", t: "heading", c: "Title" },
    { id: "a", t: "paragraph", c: "Hello world" },
    { id: "b", t: "paragraph", c: "Second block" },
  ];
  const cur = [
    { id: "h", t: "heading", c: "Title" },
    { id: "a", t: "paragraph", c: "Hello world" },
    { id: "b", t: "paragraph", c: "Second block, revised" },
  ];
  const inc = [
    { id: "x1", t: "heading", c: "Title" },
    { id: "x2", t: "paragraph", c: "Hello outside world" },
    { id: "x3", t: "paragraph", c: "Second block" },
  ];
  const res = mergeModels(l, cur, inc);
  expect(res.items.map((x) => x.c)).toEqual(["Title", "Hello outside world", "Second block, revised"]);
  expect(res.conflicts.filter((k) => k.kind === "kept-edit")).toEqual([]);
  expect(inc.map((x) => x.id)).toEqual(["x1", "x2", "x3"]);
});

test("properties of the three-way merge", () => {
  const C = parse(edit((a) => {
    q(a, '[data-id="after"]').textContent = "Back at the very top";
    q(a, 'tr[data-id="r2"] td:nth-child(3)').textContent = "invite fixed";
  }));
  const I = parse(edit((a) => {
    q(a, '[data-id="after"]').textContent = "Back at the top now";
    q(a, '[data-id="h"]').textContent = "Outside";
    q(a, '[data-id="l3"]').remove();
  }));
  const M = mergeModels(B, C, I).items;
  expect(eq(mergeModels(B, B, B).items, B)).toBe(true);
  expect(eq(mergeModels(B, C, B).items, C)).toBe(true);
  expect(eq(mergeModels(B, B, I).items, I)).toBe(true);
  expect(eq(mergeModels(B, M, I).items, M)).toBe(true);
  expect(eq(mergeModels(B, C, I).items, M)).toBe(true);
  const art = document.createElement("article");
  art.innerHTML = P.renderModel(M, { clean: P.fragmentCleaner(document), fallbackOf: () => "" });
  const round = P.parseModel(art, { seed: Brev, known: new Map(M.map((x) => [x.id, x])) });
  expect(eq(round, M)).toBe(true);
  expect(M.find((x) => x.id === "after").c).toBe("Back at the very top now");
  expect(M.find((x) => x.id === "h").c).toBe("Outside");
  expect(!M.some((x) => x.id === "l3")).toBe(true);
});

test("20,000 paragraph page merges under 3000 ms", () => {
  const n = 20000;
  const text = (i) => `Paragraph ${i} with some ordinary words in it, enough to look like real prose for a block editor page.`;
  const items = (f) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, t: "paragraph", c: f(i) }));
  const l = items(text);
  const c = items((i) => (i === 7 ? text(i) + " tab" : text(i)));
  const i = items((x) => (x === n - 3 ? "outside " + text(x) : x === 7 ? text(x).replace("some", "many") : text(x)));
  const t0 = Date.now();
  const r = mergeModels(l, c, i);
  const ms = Date.now() - t0;
  expect(ms).toBeLessThan(3000);
  expect(r.items[7].c).toBe("Paragraph 7 with many ordinary words in it, enough to look like real prose for a block editor page. tab");
});

test("a toggle and its child that lost their data-ids keep their nesting", () => {
  const base = [
    { id: "toggle", t: "toggle", c: "Details" },
    { id: "child", t: "paragraph", parent: "toggle", c: "Nested text" },
    { id: "after", t: "paragraph", c: "After" },
  ];
  const incoming = [
    { id: "b-1", t: "toggle", c: "Details" },
    { id: "b-2", t: "paragraph", parent: "b-1", c: "Nested text" },
    { id: "b-3", t: "paragraph", c: "After" },
  ];
  const { items, conflicts } = mergeModels(base, base, incoming);
  expect(items).toEqual(base);
  expect(conflicts).toEqual([]);
});

test("toggles moved into each other from both sides make no parent cycle", () => {
  const base = [
    { id: "t1", t: "toggle", c: "One" },
    { id: "t2", t: "toggle", c: "Two" },
  ];
  const current = [
    { id: "t2", t: "toggle", c: "Two" },
    { id: "t1", t: "toggle", c: "One", parent: "t2" },
  ];
  const incoming = [
    { id: "t1", t: "toggle", c: "One" },
    { id: "t2", t: "toggle", c: "Two", parent: "t1" },
  ];
  const { items } = mergeModels(base, current, incoming);
  const parent = new Map(items.map((x) => [x.id, x.parent ?? null]));
  for (const x of items) {
    const seen = new Set([x.id]);
    for (let p = parent.get(x.id); p; p = parent.get(p)) {
      expect(seen.has(p)).toBe(false);
      seen.add(p);
    }
  }
  expect(items.filter((x) => x.parent).length).toBe(1);
});
