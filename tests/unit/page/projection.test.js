import * as projection from "../../../src/page/projection.js";
import { ATOM, BREAK, DEFAULTS, blocksOfValues, canon, parseModel, project, renderModel, revOf } from "../../../src/page/projection.js";
import { unitsOf as inlineUnitsOf, runsOf as inlineRunsOf } from "../../../src/page/inline.js";
import { orderedIds as modelOrderedIds } from "../../../src/page/model.js";
import { schema } from "../../../src/page/schema.js";
import { RECORD } from "./fixtures/all-kinds.js";

/**
 * The page's readable projection: render(blocks) -> <article> -> parse must
 * give back project(blocks) for every kind, and the revision hash must depend
 * on what the article shows, not on how a serializer wrote it.
 */

function throughBytes(html, rev) {
  const page = `<!DOCTYPE html><html><body><main><article class="page" clay="freeze" data-page="1" data-rev="${rev}">\n${html}\n</article></main></body></html>`;
  const first = new DOMParser().parseFromString(page, "text/html");
  const bytes = "<!DOCTYPE html>" + first.documentElement.outerHTML;
  return new DOMParser().parseFromString(bytes, "text/html").querySelector("article");
}

const renderOf = (blocks) => {
  const model = project(blocks);
  return { model, html: renderModel(model, { fallbackOf: (id) => blocks[id]?.artifact?.fallbackHtml ?? "" }), rev: revOf(model) };
};

const roundTripValues = (values) => {
  const blocks = blocksOfValues(values);
  const { model, html, rev } = renderOf(blocks);
  const article = throughBytes(html, rev);
  const parsed = parseModel(article, { seed: article.getAttribute("data-rev") });
  return { blocks, model, html, rev, article, parsed };
};

const articleOf = (inner) => new DOMParser().parseFromString(`<!DOCTYPE html><html><body><article data-page="1">${inner}</article></body></html>`, "text/html").querySelector("article");

const KINDS = ["paragraph", "heading", "list_item", "toggle", "callout", "code_block", "divider", "image", "table", "chart", "board", "tool", "preserved"];

test("DEFAULTS mirror the schema", () => {
  const schemaDefaults = {};
  for (const [name, type] of Object.entries(schema.nodes)) {
    if (!type.spec.group?.includes("block")) continue;
    schemaDefaults[name] = Object.fromEntries(Object.entries(type.spec.attrs || {}).filter(([k]) => k !== "id" && k !== "pos").map(([k, v]) => [k, v.default]));
  }
  expect(canon(schemaDefaults)).toBe(canon(DEFAULTS));
});

test("all kinds round-trip through bytes", () => {
  const { model, parsed } = roundTripValues([RECORD]);
  expect(canon(parsed)).toBe(canon(model));
  const kinds = new Set(model.map((i) => i.t));
  for (const kind of KINDS) expect(kinds.has(kind)).toBe(true);
});

const TOP_IDS = Object.entries(RECORD.blocks).filter(([id, b]) => b.parent == null && !RECORD.deleted[id]).map(([id]) => id);

test.each(TOP_IDS)("%s round-trips on its own", (id) => {
  const block = RECORD.blocks[id];
  const blocks = {};
  const add = (bid) => { if (RECORD.blocks[bid]) blocks[bid] = RECORD.blocks[bid]; };
  add(id);
  if (block.t === "chart") add(block.source);
  if (block.t === "toggle") for (const [bid, b] of Object.entries(RECORD.blocks)) if (b.parent === id) add(bid);
  const { model, parsed } = roundTripValues([{ blocks }]);
  expect(canon(parsed)).toBe(canon(model));
});

test("the rev of the parse equals data-rev", () => {
  const { parsed, article } = roundTripValues([RECORD]);
  expect(revOf(parsed)).toBe(article.getAttribute("data-rev"));
});

test("tombstones and w never render", () => {
  const blocks = blocksOfValues([RECORD]);
  const { html } = renderOf(blocks);
  for (const id of Object.keys(RECORD.deleted)) expect(html.includes(RECORD.blocks[id].c)).toBe(false);
  expect(html.includes("tab-1")).toBe(false);
});

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("the copied helpers agree with the originals", () => {
  const rnd = lcg(0x1a2b3c4d);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const POS_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const MARK_KEYS = ["", "b", "i", "bi", "c", 'a["https://x.test/"]'];
  const str = (n) => Array.from({ length: n }, () => POS_ALPHABET[Math.floor(rnd() * POS_ALPHABET.length)]).join("");
  for (let n = 0; n < 200; n++) {
    const map = {};
    const count = Math.floor(rnd() * 13);
    for (let i = 0; i < count; i++) map[`k${i}`] = rnd() < 0.15 ? {} : { pos: str(1 + Math.floor(rnd() * 3)) };
    expect(projection.orderedIds(map)).toEqual(modelOrderedIds(map));

    const runs = [];
    let total = 0;
    const runsCount = 1 + Math.floor(rnd() * 4);
    for (let i = 0; i < runsCount; i++) { const len = 1 + Math.floor(rnd() * 3); runs.push([len, pick(MARK_KEYS)]); total += len; }
    const length = rnd() < 0.3 ? Math.max(0, total + (rnd() < 0.5 ? -1 : 1)) : total;
    expect(projection.unitsOf(runs, length)).toEqual(inlineUnitsOf(runs, length));

    const units = Array.from({ length: Math.floor(rnd() * 21) }, () => pick(MARK_KEYS));
    expect(projection.runsOf(units)).toEqual(inlineRunsOf(units));
  }
});

test("fuzzed text blocks round-trip", () => {
  const rnd = lcg(0x5eed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const CHARS = ["a", "b", "z", " ", " ", "&", "<", ">", '"', "\r"];
  const BASE = ["", "b", "i", "s", "c", "bi"];
  const HREF = ['a["https://a.test/?x=1&y=2"]', 'a["https://b.test/"]'];
  let done = 0;
  for (let n = 0; n < 500; n++) {
    let c = "";
    const units = [];
    const len = 1 + Math.floor(rnd() * 40);
    for (let i = 0; i < len; i++) {
      if (rnd() < 0.12) { c += ATOM; units.push(BREAK); continue; }
      c += pick(CHARS);
      units.push(pick(BASE) + (rnd() < 0.2 ? pick(HREF) : ""));
    }
    if (c.includes("\n")) continue;
    const block = { t: "paragraph", pos: "1", c, m: projection.runsOf(units) };
    const { model, parsed } = roundTripValues([{ blocks: { p: block } }]);
    expect(canon(parsed)).toBe(canon(model));
    done++;
  }
  expect(done).toBeGreaterThan(0);
});

test("whitespace normalization", () => {
  const first = parseModel(articleOf('<p data-id="x">\n  Hello\n  world  \n</p>'));
  expect(first[0].c).toBe("Hello world");
  const second = parseModel(articleOf('<p data-id="y">a  b</p>'));
  expect(second[0].c).toBe("a  b");
});

test("escaping", () => {
  const href = 'https://x.test/?q="';
  const key = "a" + JSON.stringify([href]);
  const blocks = {
    p: { t: "paragraph", pos: "1", c: "</script><b>" },
    l: { t: "paragraph", pos: "2", c: "link", m: [[4, key]] },
  };
  const { model, parsed, html } = roundTripValues([{ blocks }]);
  expect(canon(parsed)).toBe(canon(model));
  expect(html.includes("</script>")).toBe(false);
});

test("the hash ignores serializer differences", () => {
  const blocks = blocksOfValues([RECORD]);
  const { html, rev } = renderOf(blocks);
  expect(html.includes(" checked>")).toBe(true);
  expect(html.includes(" open>")).toBe(true);
  expect(html.includes('<img src="/uploads/dip.png" alt="Activation dip"')).toBe(true);
  const variant = html
    .replace(" checked>", ' checked="">')
    .replace(" open>", ' open="">')
    .replace('<img src="/uploads/dip.png" alt="Activation dip"', '<img alt="Activation dip" src="/uploads/dip.png"');
  expect(variant).not.toBe(html);
  const a = throughBytes(html, rev);
  const b = throughBytes(variant, rev);
  expect(revOf(parseModel(a, { seed: a.getAttribute("data-rev") }))).toBe(revOf(parseModel(b, { seed: b.getAttribute("data-rev") })));
});

test("a list indent jump is clamped the same on both sides", () => {
  const blocks = {
    a: { t: "list_item", pos: "1", kind: "bullet", c: "one" },
    b: { t: "list_item", pos: "2", kind: "bullet", indent: 3, c: "two" },
    c: { t: "list_item", pos: "3", kind: "bullet", indent: 1, c: "three" },
  };
  const { model, parsed } = roundTripValues([{ blocks }]);
  const indentsOf = (items) => items.map((i) => i.indent ?? 0);
  expect(indentsOf(model)).toEqual([0, 1, 1]);
  expect(indentsOf(parsed)).toEqual([0, 1, 1]);
  expect(canon(parsed)).toBe(canon(model));
});
