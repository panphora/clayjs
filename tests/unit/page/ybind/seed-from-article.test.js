import * as P from "../../../../src/page/projection.js";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { blockFromItem } from "../../../../src/page/adopt.js";
import { migrateHybridValues, seedPageFromArticle, seedClientId } from "../../../../src/page/ybind/migrate.js";
import { blocksFromYValue } from "../../../../src/page/ybind/decode.js";
import { createPageDoc } from "../../../../src/page/ybind/layout.js";
import { entriesOf } from "../../../../src/page/ybind/parts.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";
import { RECORD } from "../fixtures/all-kinds.js";

const v0 = migrateHybridValues([RECORD]);
const blocks0 = blocksFromYValue(v0);
const model0 = P.project(blocks0);
const rev0 = P.revOf(model0);

const articleOf = (model, blocks) => {
  const article = document.createElement("article");
  article.setAttribute("data-page", "1");
  article.setAttribute("data-rev", P.revOf(model));
  article.innerHTML = P.renderModel(model, { fallbackOf: (id) => blocks[id]?.artifact?.fallbackHtml ?? "", clean: P.fragmentCleaner(document) });
  return article;
};
const rebuild = (items) => {
  const blocks = {};
  items.forEach((item, i) => { const b = blockFromItem(item, null); b.pos = String(i + 1).padStart(8, "0"); blocks[item.id] = b; });
  return migrateHybridValues([{ blocks }]);
};
const blocksOfArticle = (article) => {
  const items = P.parseModel(article, { seed: article.getAttribute("data-rev") ?? "" });
  const blocks = {};
  items.forEach((item, i) => {
    const block = blockFromItem(item, null);
    block.pos = String(i + 1).padStart(8, "0");
    blocks[item.id] = block;
  });
  return blocks;
};
const docOf = (value) => {
  const doc = new Y.Doc();
  for (const [, text] of entriesOf(value.y)) Y.applyUpdateV2(doc, Y.fromBase64(text));
  return doc;
};
const clientsOf = (value) => {
  const doc = docOf(value);
  const clients = [...doc.store.clients.keys()];
  doc.destroy();
  return clients;
};

const article = articleOf(model0, blocks0);
const seed = seedPageFromArticle(article);
const parsed = P.parseModel(article, { seed: rev0 });
const seedBlocks = blocksOfArticle(article);

test("a seed rebuilt from the same article is byte-identical", () => {
  expect(JSON.stringify(seedPageFromArticle(article))).toBe(JSON.stringify(seed));
  expect(JSON.stringify(seedPageFromArticle(articleOf(model0, blocks0)))).toBe(JSON.stringify(seed));
});

test("a seed from the article is lossless for the projection", () => {
  expect(P.revOf(P.project(blocksFromYValue(seed)))).toBe(article.getAttribute("data-rev"));
  expect(P.canon(blocksFromYValue(seed))).toBe(P.canon(blocksFromYValue(rebuild(parsed))));
});

test("every tool keeps its artifact, rev and state through a seed", () => {
  const tools = Object.entries(blocksFromYValue(seed)).filter(([, b]) => b.t === "tool");
  expect(tools.length).toBeGreaterThan(0);
  for (const [id, b] of tools) {
    expect(blocks0[id]).toBeTruthy();
    expect(b.artifact).toEqual(blocks0[id].artifact);
    expect(b.rev).toEqual(blocks0[id].rev);
    expect(b.state).toEqual(blocks0[id].state);
  }
});

test("the seed uses a content-derived client id, never 1", () => {
  const expected = seedClientId(seedBlocks);
  expect(expected).not.toBe(1);
  expect(clientsOf(seed)).toEqual([expected]);
  const edited = article.cloneNode(true);
  edited.querySelector('[data-id="p1"]').textContent += " edited";
  const editedSeed = seedPageFromArticle(edited);
  const editedClient = seedClientId(blocksOfArticle(edited));
  expect(editedClient).not.toBe(expected);
  expect(clientsOf(editedSeed)).toEqual([editedClient]);
});

test("two docs seeded from the same article merge without duplicating blocks", () => {
  const d1 = docOf(seed);
  const d2 = docOf(seed);
  const pd = createPageDoc(d1);
  let index = 0;
  for (const op of pd.flow.toDelta()) {
    if (typeof op.insert === "string") { index += 1; break; }
    index += 1;
  }
  d1.transact(() => pd.flow.insert(index, "X"));
  Y.applyUpdateV2(d2, Y.encodeStateAsUpdateV2(d1));
  expect(Object.keys(blocksFromYValue(yValueOf(d2))).length).toBe(Object.keys(blocksFromYValue(seed)).length);
  d1.destroy();
  d2.destroy();
});

test("migrateHybridValues output is unchanged", () => {
  const value = migrateHybridValues([RECORD]);
  expect(P.hash64(JSON.stringify(value))).toBe("6fe61ad487e53ccc");
});
