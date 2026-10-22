/**
 * @jest-environment node
 */
import { closestBase, rebasePage, composePage } from "../../src/server/rooms/index.js";
import { blocksOfValues, project, renderModel, revOf, fragmentCleaner } from "../../src/page/projection.js";
import { classifyFile } from "../../src/page/adopt.js";

const { JSDOM } = await import("jsdom");
const createDocument = () => new JSDOM("<!doctype html><html><body></body></html>").window.document;

const tag = (record) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(record).replace(/</g, "\\u003c")}</script>`;
function pageOf(record) {
  const d = createDocument();
  const blocks = blocksOfValues([record]);
  const model = project(blocks);
  const html = renderModel(model, { fallbackOf: () => "", clean: fragmentCleaner(d) });
  const rev = revOf(model);
  return { rev, file: `<!doctype html>\n<html><head><title>t</title></head><body>\n<article class="page" clay="freeze" data-page="1" data-rev="${rev}">\n${html}\n</article>\n</body></html>\n` };
}
const edit = (html, id, text) => html.replace(new RegExp(`(<[^>]+data-id="${id}"[^>]*>)[^<]*`), `$1${text}`);

const clone = (v) => JSON.parse(JSON.stringify(v));
const A = { blocks: { h: { t: "heading", pos: "1", level: 1, c: "Title" }, a: { t: "paragraph", pos: "2", c: "Hello world" }, b: { t: "paragraph", pos: "3", c: "Second block" } }, deleted: {} };
const B = clone(A);
B.blocks.b.c = "Second block, revised";
const base = pageOf(A);
const stored = pageOf(B);
const state = { v: 1, rev: stored.rev, tag: tag(B) };

const articleOfHtml = (html) => new JSDOM(html).window.document.querySelector("article[data-page]");

test("a writer's edit to a different block lands on the stored page", () => {
  const incoming = edit(base.file, "a", "Hello outside world");
  const result = rebasePage({ storedHtml: stored.file, state, incomingHtml: incoming, baseHtml: base.file, createDocument });
  expect(result).not.toBeNull();
  const article = articleOfHtml(result.html);
  expect(article.getAttribute("data-rev")).toBe(stored.rev);
  expect(article.innerHTML).toContain("Hello outside world");
  expect(article.innerHTML).toContain("Second block, revised");
  expect(result.conflicts).toEqual([]);

  const composed = composePage(result.html, state);
  expect(composed).toContain(tag(B));
  const doc = new JSDOM(composed).window.document;
  const found = classifyFile(doc.querySelector("article[data-page]"), [B]);
  expect(found.kind).toBe("adopt");
});

test("the same words changed on both sides go to the incoming side and conflict", () => {
  const C = clone(A);
  C.blocks.a.c = "Hello there";
  const other = pageOf(C);
  const incoming = edit(base.file, "a", "Hello friend");
  const result = rebasePage({ storedHtml: other.file, state: { v: 1, rev: other.rev, tag: tag(C) }, incomingHtml: incoming, baseHtml: base.file, createDocument });
  expect(result).not.toBeNull();
  const article = articleOfHtml(result.html);
  expect(article.innerHTML).toContain("Hello friend");
  expect(article.innerHTML).not.toContain("Hello there");
  expect(result.conflicts.length).toBe(1);
});

test("a writer who already had the stored rev is not rebased", () => {
  const incoming = edit(stored.file, "a", "x");
  expect(rebasePage({ storedHtml: stored.file, state, incomingHtml: incoming, baseHtml: base.file, createDocument })).toBeNull();
});

test("a base that does not match the incoming rev is not rebased", () => {
  const incoming = edit(base.file, "a", "Hello outside world");
  expect(rebasePage({ storedHtml: stored.file, state, incomingHtml: incoming, baseHtml: stored.file, createDocument })).toBeNull();
});

test("no stored page record is not rebased", () => {
  const incoming = edit(base.file, "a", "Hello outside world");
  expect(rebasePage({ storedHtml: stored.file, state: null, incomingHtml: incoming, baseHtml: base.file, createDocument })).toBeNull();
});

test("a resent result is a no-op", () => {
  const incoming = edit(base.file, "a", "Hello outside world");
  const result = rebasePage({ storedHtml: stored.file, state, incomingHtml: incoming, baseHtml: base.file, createDocument });
  expect(rebasePage({ storedHtml: stored.file, state, incomingHtml: result.html, baseHtml: base.file, createDocument })).toBeNull();
});

test("everything outside the article stays the incoming's", () => {
  const incoming = edit(base.file, "a", "Hello outside world");
  const result = rebasePage({ storedHtml: stored.file, state, incomingHtml: incoming, baseHtml: base.file, createDocument });
  const outside = (html) => {
    const start = html.search(/<article[^>]*data-page/);
    const end = html.indexOf("</article>") + "</article>".length;
    return [html.slice(0, start), html.slice(end)];
  };
  expect(outside(result.html)).toEqual(outside(incoming));
});

describe("stampPageRev", () => {
  test("replaces the article's rev and nothing else", async () => {
    const { stampPageRev } = await import("../../src/server/rooms/index.js");
    const html = `<!doctype html><html><body><template><article data-page data-rev="t"></article></template><article class="page" data-page="1" data-rev='old'><p>x</p></article></body></html>`;
    expect(stampPageRev(html, "new")).toBe(html.replace(`data-rev='old'`, `data-rev="new"`));
  });
  test("a data-rev inside another attribute's value is left alone", async () => {
    const { stampPageRev } = await import("../../src/server/rooms/index.js");
    const html = `<article data-page data-note="a data-rev=1" data-rev="old"><p>x</p></article>`;
    expect(stampPageRev(html, "new")).toBe(`<article data-page data-note="a data-rev=1" data-rev="new"><p>x</p></article>`);
  });
  test("adds a rev to an article that has none, and refuses a document with no lone article", async () => {
    const { stampPageRev } = await import("../../src/server/rooms/index.js");
    expect(stampPageRev(`<article data-page="1"><p>x</p></article>`, "r1")).toBe(`<article data-page="1" data-rev="r1"><p>x</p></article>`);
    expect(stampPageRev(`<p>no page</p>`, "r1")).toBeNull();
    expect(stampPageRev(`<article data-page></article><article data-page></article>`, "r1")).toBeNull();
  });
});

test("of two versions with the writer's rev, the base is the one it was copied from", () => {
  const handEdited = edit(base.file, "h", "Title edited by hand");
  const incoming = edit(base.file, "b", "Second block from a stale writer");
  expect(closestBase([handEdited, base.file], incoming, createDocument)).toBe(base.file);
  expect(closestBase([base.file, handEdited], edit(handEdited, "b", "x"), createDocument)).toBe(handEdited);
  expect(closestBase([handEdited, base.file], base.file, createDocument)).toBe(base.file);
  expect(closestBase([base.file], incoming, createDocument)).toBe(base.file);
});
