import { state as pmState, history } from "../../../src/vendor/prosemirror.vendor.js";
import { schema } from "../../../src/page/schema.js";
import { docFromBlocks, blockMap, identityPlugin, changedBlocks } from "../../../src/page/model.js";
import { structurePlugin } from "../../../src/page/blocks.js";
import { packMarks } from "../../../src/page/inline.js";
import { diffOps } from "../../../src/live/ops.js";
import { RECORD } from "./fixtures/all-kinds.js";
import { blocksOfValues, project, renderModel, revOf, parseModel, canon } from "../../../src/page/projection.js";
import { planAdoption, adoptionTransaction, classifyFile } from "../../../src/page/adopt.js";

/**
 * A hand-edited saved article becomes ONE ProseMirror transaction that touches
 * only the blocks the edit changed: deleted blocks go, new ones arrive, edited
 * ones are spliced and moved ones re-inserted, and one undo takes it all back.
 */

const base = blocksOfValues([RECORD]);
const fallbackOf = (id) => base[id]?.artifact?.fallbackHtml ?? "";
const renderFile = (blocks) => {
  const model = project(blocks);
  return `<!DOCTYPE html><html><body><article class="page" clay="freeze" data-page="1" data-rev="${revOf(model)}">\n${renderModel(model, { fallbackOf })}\n</article></body></html>`;
};
const stateOf = (blocks) => pmState.EditorState.create({ doc: docFromBlocks(schema, blocks), plugins: [history.history(), structurePlugin(), identityPlugin()] });
const packed = (doc) => Object.fromEntries(Object.entries(blockMap(doc)).map(([id, b]) => [id, packMarks(b)]));

function handEdit(edit, blocks = base) {
  const doc = new DOMParser().parseFromString(renderFile(blocks), "text/html");
  edit(doc);
  const bytes = "<!DOCTYPE html>" + doc.documentElement.outerHTML;
  return new DOMParser().parseFromString(bytes, "text/html").querySelector("article");
}

function adopt(article, st, baseBlocks = base) {
  const seed = article.getAttribute("data-rev") + "|" + article.textContent.length;
  const known = new Map(project(baseBlocks).map((i) => [i.id, i]));
  const parsed = parseModel(article, { seed, known });
  const untouched = revOf(parsed) === article.getAttribute("data-rev");
  const plan = untouched ? null : planAdoption(baseBlocks, parsed);
  const tr = adoptionTransaction(st, plan);
  const next = tr ? st.apply(tr) : st;
  const ch = changedBlocks(st.doc, next.doc);
  const ops = diffOps({ blocks: packed(st.doc) }, { blocks: packed(next.doc) });
  return { untouched, plan, next, changed: [...new Set([...Object.keys(ch.before), ...Object.keys(ch.after)])].sort(), ops, parsed };
}

const st0 = stateOf(base);

// The doc's own blocks project the same as the store record (runs vs per-unit, defaults).
test("project(blockMap(doc)) == project(record)", () => {
  expect(canon(project(blockMap(st0.doc)))).toEqual(canon(project(base)));
});

test("untouched file: rev matches, zero ops", () => {
  const r = adopt(handEdit(() => {}), st0);
  expect(r.untouched).toBe(true);
  expect(r.ops.length).toBe(0);
});

test("untouched file, wrong data-rev: adoption runs and finds nothing", () => {
  const r = adopt(handEdit((d) => d.querySelector("article").setAttribute("data-rev", "x")), st0);
  expect(r.untouched).toBe(false);
  expect(r.plan).toBe(null);
  expect(r.ops.length).toBe(0);
});

test("edit one word: only p1 changes", () => {
  const r = adopt(handEdit((d) => { const p = d.querySelector('[data-id="p1"]'); p.firstChild.data = p.firstChild.data.replace("62%", "64%"); }), st0);
  expect(canon(r.changed)).toEqual(canon(["p1"]));
});

test("edit one word: marks elsewhere in p1 kept", () => {
  const r = adopt(handEdit((d) => { const p = d.querySelector('[data-id="p1"]'); p.firstChild.data = p.firstChild.data.replace("62%", "64%"); }), st0);
  expect(JSON.stringify(blockMap(r.next.doc).p1.m).includes("bi")).toBe(true);
});

test("new paragraph: one block created, nothing else", () => {
  const r = adopt(handEdit((d) => { const p = d.createElement("p"); p.textContent = "Written by an agent"; d.querySelector('[data-id="h2"]').after(p); }), st0);
  const added = r.changed.filter((id) => !base[id]);
  expect(r.changed.length).toBe(1);
  expect(added.length).toBe(1);
});

test("new paragraph lands after h2", () => {
  const r = adopt(handEdit((d) => { const p = d.createElement("p"); p.textContent = "Written by an agent"; d.querySelector('[data-id="h2"]').after(p); }), st0);
  const added = r.changed.filter((id) => !base[id]);
  const doc = blockMap(r.next.doc);
  const order = Object.keys(doc).sort((a, b) => (doc[a].pos < doc[b].pos ? -1 : 1));
  expect(order[order.indexOf("h2") + 1]).toBe(added[0]);
});

test("delete: only 'after' changes, and it is gone", () => {
  const r = adopt(handEdit((d) => d.querySelector('[data-id="after"]').remove()), st0);
  expect(canon(r.changed)).toEqual(canon(["after"]));
  expect(!blockMap(r.next.doc).after).toBe(true);
});

test("move one block: only its pos rewritten", () => {
  const r = adopt(handEdit((d) => d.querySelector('[data-id="h2"]').before(d.querySelector('[data-id="after"]'))), st0);
  expect(canon(r.changed)).toEqual(canon(["after"]));
});

test("uncheck: only c1, owner and due kept", () => {
  const r = adopt(handEdit((d) => d.querySelector('[data-id="c1"] input').removeAttribute("checked")), st0);
  const c1 = blockMap(r.next.doc).c1;
  expect(canon(r.changed)).toEqual(canon(["c1"]));
  expect(!c1.checked).toBe(true);
  expect(c1.owner).toBe("Maya");
  expect(c1.due).toBe("2026-10-26");
});

test("table cell: only tbl, row and col pos kept", () => {
  const r = adopt(handEdit((d) => { d.querySelector('[data-id="r2"] td:nth-child(2)').textContent = "44"; }), st0);
  const t = blockMap(r.next.doc).tbl;
  expect(canon(r.changed)).toEqual(canon(["tbl"]));
  expect(t.rows.r2.cells.c2).toBe("44");
  expect(t.rows.r2.pos).toBe("2");
  expect(t.cols.c2.pos).toBe("2");
  expect(t.cols.c2.kind).toBe("number");
});

test("duplicated data-id: original keeps id and text, copy is new", () => {
  const r = adopt(handEdit((d) => { const p = d.querySelector('[data-id="p2"]'); const copy = p.cloneNode(true); copy.textContent = "A changed copy"; p.after(copy); }), st0);
  const doc = blockMap(r.next.doc);
  expect(r.changed.length).toBe(1);
  expect(!base[r.changed[0]]).toBe(true);
  expect(doc.p2.c.startsWith("Line one")).toBe(true);
});

test("hand <b>: one block, strong mark on 'top'", () => {
  const r = adopt(handEdit((d) => { const p = d.querySelector('[data-id="after"]'); p.innerHTML = "Back at the <b>top</b>"; }), st0);
  expect(canon(r.changed)).toEqual(canon(["after"]));
  expect(JSON.stringify(blockMap(r.next.doc).after.m).includes('"b"')).toBe(true);
});

test("peer edits since the save survive, hand edit applied", () => {
  const peer = { ...base, l5: { ...base.l5, c: "Second bullet, edited by Maya" }, nw: { t: "paragraph", pos: "3V", c: "Maya's new block" } };
  const stPeer = stateOf(peer);
  const r = adopt(handEdit((d) => { d.querySelector('[data-id="h"]').textContent = "Relay launch review (final)"; }), stPeer);
  const doc = blockMap(r.next.doc);
  expect(canon(r.changed)).toEqual(canon(["h"]));
  expect(doc.l5.c.includes("Maya")).toBe(true);
  expect(!!doc.nw).toBe(true);
  expect(doc.h.c.endsWith("(final)")).toBe(true);
});

test("agent list items: two created with indent 0 and 1", () => {
  const r = adopt(handEdit((d) => { const li = d.querySelector('[data-id="l5"]'); li.insertAdjacentHTML("afterend", "<li>Third bullet<ul><li>Its child</li></ul></li>"); }), st0);
  const doc = blockMap(r.next.doc);
  const added = r.changed.filter((id) => !base[id]).map((id) => doc[id]);
  expect(added.length).toBe(2);
  expect(r.changed.length).toBe(2);
  expect(added.some((b) => b.c === "Its child" && b.indent === 1)).toBe(true);
});

test("same file adopted twice: second adoption is a no-op", () => {
  const art = handEdit((d) => { const p = d.createElement("p"); p.textContent = "Once"; d.querySelector('[data-id="h2"]').after(p); d.querySelector('[data-id="after"]').remove(); });
  const r1 = adopt(art, st0);
  const r2 = adopt(art, r1.next);
  expect(r2.ops.length).toBe(0);
  expect(r1.ops.length > 0).toBe(true);
});

test("one undo step reverts the whole adoption", () => {
  const r = adopt(handEdit((d) => { d.querySelector('[data-id="h"]').textContent = "X"; d.querySelector('[data-id="after"]').remove(); }), st0);
  let undone = null;
  history.undo(r.next, (tr) => { undone = r.next.apply(tr); });
  expect(!!undone).toBe(true);
  expect(canon(project(blockMap(undone.doc)))).toEqual(canon(project(base)));
});

test("paragraph moved out of the toggle: parent cleared, one block", () => {
  const r = adopt(handEdit((d) => { d.querySelector('[data-id="after"]').before(d.querySelector('[data-id="tb1"]')); }), st0);
  const doc = blockMap(r.next.doc);
  expect(canon(r.changed)).toEqual(canon(["tb1"]));
  expect(!doc.tb1.parent).toBe(true);
});

test("classify: untouched", () => {
  const tags = [RECORD];
  expect(classifyFile(handEdit(() => {}), tags).kind).toBe("untouched");
});

test("classify: article edited, tags not -> adopt", () => {
  const tags = [RECORD];
  expect(classifyFile(handEdit((d) => { d.querySelector('[data-id="h"]').textContent = "Y"; }), tags).kind).toBe("adopt");
});

test("classify: article and tags both edited -> not adopted", () => {
  const tags = [RECORD];
  const moved = JSON.parse(JSON.stringify(RECORD)); moved.blocks.h.c = "Edited in the JSON too";
  expect(classifyFile(handEdit((d) => { d.querySelector('[data-id="h"]').textContent = "Y"; }), [moved]).kind).toBe("unbased");
});

test("classify: peer snapshot (stale article, newer tags, article untouched) -> untouched", () => {
  const tags = [RECORD];
  const moved = JSON.parse(JSON.stringify(RECORD)); moved.blocks.h.c = "Edited in the JSON too";
  expect(classifyFile(handEdit(() => {}), [moved]).kind).toBe("untouched");
});

test("classify: no data-rev (hand-authored page) -> adopt", () => {
  const tags = [RECORD];
  const noRev = handEdit((d) => d.querySelector("article").removeAttribute("data-rev"));
  expect(classifyFile(noRev, tags).kind).toBe("adopt");
});

test("classify: a page written as plain HTML adopts with the same ids every time", () => {
  const fresh = handEdit((d) => { d.querySelector("article").removeAttribute("data-rev"); d.querySelector("article").innerHTML = "<h1>Hand-written page</h1><p>From an agent</p>"; });
  const c1 = classifyFile(fresh, [{ blocks: {}, deleted: {} }]);
  const c2 = classifyFile(fresh, [{ blocks: {}, deleted: {} }]);
  expect(c1.kind).toBe("adopt");
  expect(c1.parsed.length).toBe(2);
  expect(c1.parsed.map((i) => i.id)).toEqual(c2.parsed.map((i) => i.id));
});
