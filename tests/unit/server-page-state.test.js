/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { splitPage, composePage, pageRev } from "../../src/server/rooms/index.js";
import { inspectPage } from "../../src/server/rooms/page-admission.js";

const template = readFileSync(new URL("../fixtures/ypage-template.html", import.meta.url), "utf8");
const pageTag = (value) => `<script type="application/json" merge="page" clay="live">${value}</script>`;
const yValue = `{"v":1,"g":0,"y":{"seed":"abc"}}`;
const article = (attrs = `data-page="1" data-rev="093360993130d818"`) =>
  `<article class="page" clay="freeze" ${attrs}><h1 data-id="title"></h1></article>`;
const doc = (head, body) => `<!doctype html>\n<html>\n<head>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

const articleRev = (html) => /<article[^>]*data-rev="([^"]+)"/.exec(html)[1];

test("round trip on the template", () => {
  const { file, state } = splitPage(template);
  expect(state.v).toBe(1);
  expect(state.rev).toBe(articleRev(template));
  expect(state.tag.startsWith("<script")).toBe(true);
  expect(state.tag).toContain('merge="page"');
  expect(file).not.toContain('merge="page"');
  expect(file).toContain('merge="page.tools"');
  expect(file).toContain("<article");

  const composed = composePage(file, state);
  expect(composed.match(/merge="page"/g)).toHaveLength(1);
  expect(splitPage(composed)).toEqual({ file, state });
});

test("canonical placement restores the document exactly", () => {
  const html = doc("", `  ${pageTag(yValue)}\n  ${article()}`);
  const { file, state } = splitPage(html);
  expect(state).not.toBeNull();
  expect(composePage(file, state)).toBe(html);
});

test("a tag elsewhere is removed whole and composed directly before the article", () => {
  const html = doc(`  ${pageTag(yValue)}`, `  ${article()}`);
  const { file, state } = splitPage(html);
  expect(file).not.toContain('merge="page"');
  const composed = composePage(file, state);
  expect(composed).toContain(`${state.tag}\n  <article`);
  expect(inspectPage(composed).kind).toBe("yjs");
});

test("a mismatched revision leaves the file alone", () => {
  const html = doc(`  ${pageTag(yValue)}`, `  ${article()}`);
  const { file, state } = splitPage(html);
  expect(composePage(file, { ...state, rev: "0000000000000000" })).toBe(file);
});

test("a file that still has its own page tag is left alone", () => {
  const { state } = splitPage(template);
  expect(composePage(template, state)).toBe(template);
});

test("inputs that are not exactly one Yjs tag beside one revisioned article are unchanged", () => {
  const cases = {
    none: doc("", `  ${article()}`),
    hybrid: doc(`  ${pageTag(`{"blocks":{"b1":{"text":"hi"}}}`)}`, `  ${article()}`),
    tagInsideArticle: doc("", `  <article class="page" data-page="1" data-rev="093360993130d818">${pageTag(yValue)}</article>`),
    tagInTemplate: doc(`  <template>${pageTag(yValue)}</template>`, `  ${article()}`),
  };
  for (const [name, html] of Object.entries(cases)) expect([name, splitPage(html)]).toEqual([name, { file: html, state: null }]);
});

test("an escaped closing script sequence survives split and compose byte for byte", () => {
  const tag = pageTag(`{"v":1,"g":0,"y":{"seed":"a<\\/script>b"}}`);
  const html = doc("", `  ${tag}\n  ${article()}`);
  const { file, state } = splitPage(html);
  expect(state.tag).toBe(tag);
  expect(composePage(file, state)).toBe(html);

  const fromTemplate = splitPage(template);
  expect(fromTemplate.state.tag).toBe(/<script type="application\/json" merge="page"[^>]*>[\s\S]*?<\/script>/.exec(template)[0]);
});

test("pageRev answers the lone article's revision, and null otherwise", () => {
  expect(pageRev(doc("", `  ${article()}`))).toBe("093360993130d818");
  expect(pageRev(template)).toBe(articleRev(template));
  expect(pageRev(doc("", `  ${pageTag(yValue)}`))).toBeNull();
  expect(pageRev(doc("", `  ${article()}\n  ${article()}`))).toBeNull();
  expect(pageRev(doc("", `  <article class="page" data-page="1" data-rev=""></article>`))).toBeNull();
  expect(pageRev(doc("", `  <article class="page" data-page="1"></article>`))).toBeNull();
  expect(pageRev(doc("", `  <template>${article()}</template>`))).toBeNull();
});

const crlf = (html) => html.replace(/\n/g, "\r\n");
const cr = (html) => html.replace(/\n/g, "\r");

test("a CRLF document round trips byte for byte and composes with CRLF", () => {
  const html = crlf(doc("", `  ${pageTag(yValue)}\n  ${article()}`));
  const { file, state } = splitPage(html);
  expect(state).not.toBeNull();
  expect(file).not.toContain('merge="page"');
  const composed = composePage(file, state);
  expect(composed).toBe(html);
  expect(composed).toContain(`${state.tag}\r\n  <article`);
  expect(splitPage(composed)).toEqual({ file, state });
});

test("a CR-only document round trips byte for byte", () => {
  const html = cr(doc("", `  ${pageTag(yValue)}\n  ${article()}`));
  const { file, state } = splitPage(html);
  expect(state).not.toBeNull();
  expect(file).not.toContain('merge="page"');
  const composed = composePage(file, state);
  expect(composed).toBe(html);
  expect(splitPage(composed)).toEqual({ file, state });
});

test("a page tag with no revisioned article stays in the file", () => {
  const noArticle = doc("", `  ${pageTag(yValue)}`);
  const noRev = doc("", `  ${pageTag(yValue)}\n  <article class="page" data-page="1"></article>`);
  const twoArticles = doc("", `  ${pageTag(yValue)}\n  ${article()}\n  ${article()}`);
  for (const html of [noArticle, noRev, twoArticles]) expect(splitPage(html)).toEqual({ file: html, state: null });
});

test("two page tags leave the document unchanged", () => {
  const html = doc("", `  ${pageTag(yValue)}\n  ${pageTag(yValue)}\n  ${article()}`);
  expect(splitPage(html)).toEqual({ file: html, state: null });
});

test("asking twice about one document answers the same, whatever the first caller did with its answer", () => {
  const html = doc("", `${pageTag(yValue)}\n${article()}`);
  const first = splitPage(html);
  first.state.tag = "changed";
  inspectPage(html).tags[0][1].v = 99;
  expect(splitPage(html).state.tag).toBe(pageTag(yValue));
  expect(inspectPage(html).tags[0][1].v).toBe(1);
  expect(pageRev(html)).toBe("093360993130d818");
  expect(composePage(splitPage(html).file, splitPage(html).state)).toBe(html);
});
