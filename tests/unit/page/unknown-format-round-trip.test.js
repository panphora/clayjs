/**
 * @jest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { state as pmState, view as pmView, history } from "../../../src/vendor/prosemirror.vendor.js";
import { HyperMorph } from "../../../src/vendor/hyper-morph.vendor.js";
import { schema } from "../../../src/page/schema.js";
import { blockMap, docFromBlocks, identityPlugin, nodeFromBlock } from "../../../src/page/model.js";
import { unflatten } from "../../../src/page/inline.js";
import { structurePlugin } from "../../../src/page/blocks.js";
import {
  DEFAULTS, MARKS, OPAQUE, VALUE, blocksOfValues, canon, fragmentCleaner,
  parseModel, project, renderModel, revOf, unitsOf,
} from "../../../src/page/projection.js";
import { adoptionTransaction, classifyFile, planAdoption } from "../../../src/page/adopt.js";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createPageDoc } from "../../../src/page/ybind/layout.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { yValueOf } from "../../../src/page/ybind/provider.js";
import { mergePageModels } from "../../../src/page/merge.js";
import { createStore } from "../../../src/live/store.js";
import { createYPageBinding } from "../../../src/page/ybind/index.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";

/**
 * A record holding content from a newer format keeps it through the saved
 * article: the projection, the bytes, re-adoption, a neighbouring edit, the
 * save and a merge. The envelope is the record; the visible text is only its
 * readable fallback.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(here, "../../fixtures/page/formats", `${name}.json`), "utf8"));

const QUOTE = fixture("unknown-block").record;
const MARKED = fixture("unknown-attrs").record;
const EXTRA = { t: "paragraph", pos: "7", c: "A known line", due: "2026-11-01", meta: { by: "Ada" } };
const PLAIN = { t: "paragraph", pos: "9", c: "Nothing unfamiliar here" };
const RECORD = { blocks: { a: MARKED, q: QUOTE, p: EXTRA, z: PLAIN }, deleted: {} };
const OPAQUE_IDS = ["a", "p", "q"];
// The editor keeps an unfamiliar block and its marks; an unfamiliar attribute of a
// known block stays in the live attribute map, so only the article path carries it.
const EDITOR_IDS = ["a", "q"];

const clean = fragmentCleaner(document);
const blocks = blocksOfValues([RECORD]);
const model = project(blocks);
const byId = (items) => new Map(items.map((item) => [item.id, item]));
const html = renderModel(model, { clean });
const articleOf = (inner, rev = revOf(model)) => {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body><article class="page" data-page="1" data-rev="${rev}">\n${inner}\n</article></body></html>`, "text/html");
  return doc.querySelector("article");
};
const article = articleOf(html);

// A reader of the newer format: the envelope decodes to the record it stands
// for, independently of this runtime's schema.
const b64decode = (text) => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0)));
const b64encode = (text) => {
  let bin = "";
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const envelopeOf = (value) => `data-clay-page-opaque="1" ${VALUE}="${b64encode(JSON.stringify(value))}"`;
const envelopeIn = (el) => JSON.parse(b64decode(el.getAttribute(VALUE)));

const throughBytes = () => {
  const page = `<!DOCTYPE html><html><body><article class="page" data-page="1" data-rev="${revOf(model)}">\n${html}\n</article></body></html>`;
  const first = new DOMParser().parseFromString(page, "text/html");
  const bytes = "<!DOCTYPE html>" + first.documentElement.outerHTML;
  return new DOMParser().parseFromString(bytes, "text/html").querySelector("article");
};

// The editor's document as the record keeps it: an opaque node stands for the
// record it carries, never for a block type of its own.
const savedBlocks = (doc) => {
  const out = {};
  for (const [id, b] of Object.entries(blockMap(doc))) {
    if (b.t !== "opaque_block") { out[id] = b; continue; }
    const { t, ...fields } = b.raw;
    out[id] = { t, pos: b.pos, ...fields, ...(b.c ? { c: b.c } : {}), ...(b.m ? { m: b.m } : {}) };
  }
  return out;
};
const nodeOfRecord = (id, record) => {
  const { t, pos, c, m, ...raw } = record;
  if (Object.hasOwn(DEFAULTS, t)) return nodeFromBlock(schema, id, record);
  const content = typeof c === "string" && c ? unflatten(schema, c, unitsOf(m, c.length), schema.nodes.opaque_block) : null;
  return schema.nodes.opaque_block.create({ id, pos, raw: { t, ...raw } }, content);
};
const stateOf = (records) => pmState.EditorState.create({
  doc: schema.nodes.doc.create(null, Object.entries(records).map(([id, record]) => nodeOfRecord(id, record))),
  plugins: [history.history(), structurePlugin(), identityPlugin()],
});
const find = (doc, id) => {
  let found = null;
  doc.forEach((node, pos) => { if (!found && node.attrs.id === id) found = { node, pos }; });
  return found;
};
const types = (doc) => { const out = []; doc.forEach((node) => out.push(node.type.name)); return out; };

test("an unfamiliar block keeps its whole record in an inert envelope, and its text stays readable", () => {
  const el = article.querySelector(':scope > [data-id="q"]');
  expect(el.tagName).toBe("DIV");
  expect(el.getAttribute(OPAQUE)).toBe("1");
  expect(el.textContent).toBe(QUOTE.c);
  expect(envelopeIn(el)).toEqual({ t: "callout_future", c: QUOTE.c, m: QUOTE.m, unknown: QUOTE.unknown });
  expect(el.getAttribute("data-type")).toBeNull();
});

test("a known block's unfamiliar attribute rides in the envelope, and known bytes do not change", () => {
  const extra = article.querySelector(':scope > [data-id="p"]');
  expect(envelopeIn(extra)).toEqual({ due: EXTRA.due, meta: EXTRA.meta });
  expect(extra.textContent).toBe(EXTRA.c);
  expect(article.querySelector(':scope > [data-id="z"]').outerHTML).toBe('<p data-id="z">Nothing unfamiliar here</p>');
});

test("unfamiliar marks keep their descriptors in the envelope, and the known text stays as it is", () => {
  const marked = article.querySelector(':scope > [data-id="a"]');
  expect(marked.getAttribute(OPAQUE)).toBeNull();
  const spans = [...marked.querySelectorAll(`span[${MARKS}]`)];
  expect(spans.map((span) => span.textContent)).toEqual(["one", " two"]);
  const entriesOf = (span) => JSON.parse(b64decode(span.getAttribute(MARKS)));
  expect(entriesOf(spans[0])).toEqual([
    { name: "glow", attrs: { color: "red", fallback: "#e00", meta: { by: "Ada", at: "2026-10-24T10:00:00Z", depth: [1, 2, { x: true }] }, label: "網目 🚦" } },
  ]);
  expect(entriesOf(spans[1])).toEqual([
    { name: "annotation", attrs: { thread: "t-1", notes: ["keep", "these"] } },
    { tokens: ['y["kept"]'] },
  ]);
  expect(marked.textContent).toBe(MARKED.c);
});

test("the projection, the article's bytes and the projection again are one record and one revision", () => {
  const back = parseModel(throughBytes());
  expect(canon(back)).toBe(canon(model));
  expect(revOf(back)).toBe(revOf(model));
  for (const id of OPAQUE_IDS) expect(canon(byId(back).get(id))).toBe(canon(byId(model).get(id)));
});

test("a file stripped of its page tags is adopted, edited and saved keeping every record and revision", () => {
  const file = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><head><script type="application/json" merge="page" clay="live">${JSON.stringify(RECORD)}</script></head><body><article data-page="1" data-rev="${revOf(model)}">\n${html}\n</article></body></html>`,
    "text/html",
  );
  for (const tag of [...file.querySelectorAll('script[merge="page"]')]) tag.remove();
  expect(file.querySelector('script[merge="page"]')).toBeNull();
  const edited = file.querySelector("article");
  edited.querySelector('[data-id="z"]').textContent = "Nothing unfamiliar here, edited by hand";

  const found = classifyFile(edited, [RECORD]);
  expect(found.kind).toBe("adopt");
  expect(canon(found.parsed.find((item) => item.id === "q"))).toBe(canon(byId(model).get("q")));

  const plan = planAdoption(found.base, found.parsed, found.baseItems);
  expect(plan).not.toBeNull();
  expect([...plan.edited.keys()]).toEqual(["z"]);
  const before = stateOf({ a: MARKED, q: QUOTE, p: EXTRA, z: PLAIN });
  const tr = adoptionTransaction(before, plan);
  expect(tr).not.toBeNull();
  const next = before.apply(tr);

  expect(types(next.doc)).toEqual(["paragraph", "opaque_block", "paragraph", "paragraph"]);
  expect(find(next.doc, "z").node.textContent).toBe("Nothing unfamiliar here, edited by hand");
  expect(find(next.doc, "q").node.attrs.raw).toEqual({ t: "callout_future", unknown: QUOTE.unknown });
  expect(find(next.doc, "q").node.textContent).toBe(QUOTE.c);

  const neighbour = find(next.doc, "z");
  const typed = next.apply(next.tr.insertText("!", neighbour.pos + 1 + neighbour.node.textContent.length));
  expect(find(typed.doc, "z").node.textContent).toBe("Nothing unfamiliar here, edited by hand!");
  expect(find(typed.doc, "q").node.attrs.raw).toEqual({ t: "callout_future", unknown: QUOTE.unknown });

  const saved = project(savedBlocks(typed.doc));
  const savedHtml = renderModel(saved, { clean });
  expect(savedHtml).toContain(OPAQUE);
  const final = parseModel(articleOf(savedHtml));
  expect(revOf(final)).toBe(revOf(saved));
  expect(canon(final)).toBe(canon(saved));
  for (const id of EDITOR_IDS) expect(canon(byId(final).get(id))).toBe(canon(byId(model).get(id)));
  expect(byId(final).get("z").c).toBe("Nothing unfamiliar here, edited by hand!");
});

test("a newer peer's record reaches the editor through the article's envelope", () => {
  const changed = { ...QUOTE, unknown: { keep: true, thread: "t-2" } };
  const inner = html.replace(
    article.querySelector(':scope > [data-id="q"]').outerHTML,
    `<div data-id="q" ${envelopeOf({ t: changed.t, c: changed.c, m: changed.m, unknown: changed.unknown })}>${changed.c}</div>`,
  );
  const found = classifyFile(articleOf(inner), [RECORD]);
  expect(found.kind).toBe("adopt");
  const plan = planAdoption(found.base, found.parsed, found.baseItems);
  expect([...plan.edited.keys()]).toEqual(["q"]);
  const before = stateOf({ a: MARKED, q: QUOTE, p: EXTRA, z: PLAIN });
  const next = before.apply(adoptionTransaction(before, plan));
  expect(find(next.doc, "q").node.attrs.raw).toEqual({ t: "callout_future", unknown: changed.unknown });
  expect(canon(byId(project(savedBlocks(next.doc))).get("q"))).toBe(canon(byId(project({ q: changed })).get("q")));
});

test("a merge keeps an opaque record neither side touched", () => {
  const run = (current, incoming) => mergePageModels(model, current, incoming, { doc: document, merge3: HyperMorph.merge3, mergeJson: HyperMorph.mergeJson });
  const edit = (id, text) => model.map((item) => (item.id === id ? { ...item, c: text } : item));
  const oneSided = run(edit("z", "Tab words here"), model.map((item) => ({ ...item })));
  for (const id of OPAQUE_IDS) expect(canon(byId(oneSided.items).get(id))).toBe(canon(byId(model).get(id)));
  const both = run(edit("z", "Tab words here"), edit("z", "Outside words here"));
  for (const id of OPAQUE_IDS) expect(canon(byId(both.items).get(id))).toBe(canon(byId(model).get(id)));
  expect(byId(both.items).get("z").c).toBe("Outside words here");
});

test("a malformed or inconsistent envelope refuses the article instead of a plain-text fallback", () => {
  const refusals = [
    ["not base64url JSON", `${OPAQUE}="1" ${VALUE}="!!"`],
    ["no value at all", `${OPAQUE}="1"`],
    ["an unknown version", `${OPAQUE}="2" ${VALUE}="${b64encode('{"t":"callout_future"}')}"`],
    ["a record naming a known block type", envelopeOf({ t: "paragraph", c: "x" })],
    ["a record naming the internal node", envelopeOf({ t: "opaque_block" })],
    ["a record with a structural position", envelopeOf({ t: "callout_future", pos: "1" })],
    ["a record with a structural id", envelopeOf({ t: "callout_future", id: "q" })],
    ["a type that is not a name", envelopeOf({ t: 5 })],
    ["not a record", `${OPAQUE}="1" ${VALUE}="${b64encode("[1,2]")}"`],
  ];
  for (const [why, attrs] of refusals) {
    const refused = articleOf(`<div data-id="q" ${attrs}>text</div>`);
    expect(() => parseModel(refused)).toThrow(SyntaxError);
    expect(why).toBeTruthy();
  }
  const badMarks = articleOf(`<p data-id="p"><span ${MARKS}="${b64encode('{"name":"x"}')}">text</span></p>`);
  expect(() => parseModel(badMarks)).toThrow(SyntaxError);
  const good = parseModel(articleOf(`<div data-id="q" ${envelopeOf({ t: "callout_future", c: "text" })}>text</div>`));
  expect(good).toEqual([{ id: "q", t: "callout_future", c: "text" }]);
  const goodMarks = parseModel(articleOf(`<p data-id="p"><span ${MARKS}="${b64encode('[{"tokens":["u"]}]')}">text</span></p>`));
  expect(goodMarks[0].m).toEqual([[4, "u"]]);
});

test("the envelope budget refuses a deeper or larger record rather than truncating it", () => {
  const deep = (n) => (n ? { a: deep(n - 1) } : {});
  const keys = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]));
  const parsed = (record) => parseModel(articleOf(`<div data-id="q" ${envelopeOf(record)}>text</div>`));
  expect(() => parsed({ t: "callout_future", c: "text", extra: deep(40) })).toThrow(SyntaxError);
  expect(() => parsed({ t: "callout_future", c: "text", extra: keys(10001) })).toThrow(SyntaxError);
  expect(parsed({ t: "callout_future", c: "text", extra: deep(8) })).toHaveLength(1);
  expect(parsed({ t: "callout_future", c: "text", extra: keys(50) })).toHaveLength(1);
});

test("HTML-like attribute values and prototype-shaped keys stay inert data", () => {
  const hostile = { title: '"><script>alert(1)</script>', nested: { ["__proto__"]: { polluted: true } } };
  expect(() => parseModel(articleOf(`<p data-id="p" ${envelopeOf(hostile)}>text</p>`))).toThrow(SyntaxError);
  expect(Object.prototype.polluted).toBeUndefined();

  const inert = { title: '"><script>alert(1)</script>', onmouseover: "alert(1)", style: "background:url(javascript:alert(1))", constructor: { ok: true } };
  const back = parseModel(articleOf(`<p data-id="p" ${envelopeOf(inert)}>text</p>`))[0];
  expect(Object.hasOwn(back, "constructor")).toBe(true);
  expect(back.title).toBe(inert.title);
  expect(back.onmouseover).toBe("alert(1)");

  const rendered = articleOf(renderModel([back], { clean }));
  expect(rendered.querySelector("script")).toBeNull();
  expect(rendered.querySelector("[onmouseover], [style]")).toBeNull();
  expect([...rendered.querySelectorAll("*")].every((el) => [...el.attributes].every((a) => !/^on/i.test(a.name)))).toBe(true);
  expect(rendered.querySelector('[data-id="p"]').textContent).toBe("text");
  expect(canon(parseModel(rendered)[0])).toBe(canon(back));
});

// A newer peer's record as the projection writes it: an unfamiliar block with an
// attribute and text, a known paragraph carrying an unfamiliar named mark, a
// compact token and an attribute this runtime has no schema field for.
const WIDGET = {
  t: "future_widget",
  pos: "00000002",
  c: "Widget text",
  m: [[11, 'x["glow",{"color":"red"}]']],
  theme: { bg: "red" },
  level: 3,
};
const MARKED_TEXT = {
  t: "paragraph",
  pos: "00000001",
  c: "hover here",
  m: [[5, 'x["sparkle",{}]'], [5, 'y["kept"]']],
  due: "2026-11-01",
  meta: { by: "Ada" },
};
const NEIGHBOUR = { t: "paragraph", pos: "00000003", c: "Neighbour line" };
const SAVED = { blocks: { a: MARKED_TEXT, w: WIDGET, z: NEIGHBOUR }, deleted: {} };

test("a saved file with newer content reopens through the seed and takes a neighbour edit", () => {
  const records = blocksOfValues([SAVED]);
  const newer = project(records);
  const file = articleOf(renderModel(newer, { clean }), revOf(newer));
  const value = seedPageFromArticle(file);
  const seeded = blocksFromYValue(value);
  expect(canon(seeded)).toBe(canon(records));
  expect(revOf(project(seeded))).toBe(revOf(newer));
  expect(canon(byId(project(seeded)).get("w"))).toBe(canon(byId(newer).get("w")));
  expect(canon(byId(project(seeded)).get("a"))).toBe(canon(byId(newer).get("a")));

  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  try {
    expect(types(view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph"]);
    const neighbour = find(view.state.doc, "z");
    view.dispatch(view.state.tr.insertText("!", neighbour.pos + 1 + neighbour.node.textContent.length));
    expect(find(view.state.doc, "z").node.textContent).toBe("Neighbour line!");

    const saved = project(blocksFromYValue(yValueOf(binding.ydoc)));
    const savedHtml = renderModel(saved, { clean });
    const final = parseModel(articleOf(savedHtml, revOf(saved)));
    expect(revOf(final)).toBe(revOf(saved));
    expect(canon(final)).toBe(canon(saved));
    for (const id of ["a", "w"]) expect(canon(byId(final).get(id))).toBe(canon(byId(newer).get(id)));
    expect(byId(final).get("z").c).toBe("Neighbour line!");
  } finally {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }
});

test("a live room's newer content reaches the saved file and comes back as the same records", () => {
  const doc = new Y.Doc();
  const pd = createPageDoc(doc);
  doc.transact(() => {
    pd.attrs.set("p", new Y.Map([["t", "paragraph"]]));
    pd.flow.insertEmbed(0, { b: "p" }, {});
    pd.flow.insert(1, "before", { "sparkle~upstream": { color: "red" } });
    pd.attrs.set("q", new Y.Map([["t", "future_widget"], ["theme", { bg: "red" }]]));
    pd.flow.insertEmbed(pd.flow.length, { b: "q" }, {});
    pd.flow.insert(pd.flow.length, "later", { "clay_opaque_code~upstream": { tokens: ["u"] } });
  });
  const live = blocksFromYValue(yValueOf(doc));
  doc.destroy();
  expect(live.q).toEqual({ t: "future_widget", pos: "00000002", theme: { bg: "red" }, c: "later", m: [[5, "u"]] });
  const projected = project(live);
  const saved = parseModel(articleOf(renderModel(projected, { clean })));
  expect(canon(saved)).toBe(canon(projected));
  expect(revOf(saved)).toBe(revOf(projected));
  expect(canon(project(savedBlocks(stateOf(live).doc)))).toBe(canon(projected));
});
