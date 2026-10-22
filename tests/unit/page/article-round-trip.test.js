import * as P from "../../../src/page/projection.js";
import { blockFromItem } from "../../../src/page/adopt.js";
import { migrateHybridValues } from "../../../src/page/ybind/migrate.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { startPageView } from "../../../src/page/view.js";
import { RECORD } from "./fixtures/all-kinds.js";

/**
 * A tool's code and state live in the rendered article, so a page rebuilt from
 * its <article data-page> alone keeps every tool: no Yjs tag needed.
 */

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
const parsedOf = (model, blocks) => P.parseModel(articleOf(model, blocks), { seed: P.revOf(model), known: new Map(model.map((i) => [i.id, i])) });

const parsed = parsedOf(model0, blocks0);
const b1 = blocksFromYValue(rebuild(parsed));

test("the fixture carries a tool with code and state", () => {
  const tools = Object.entries(blocks0).filter(([, b]) => b.t === "tool");
  expect(tools.length).toBeGreaterThan(0);
  expect(tools.some(([, b]) => b.artifact && b.rev && b.state && Object.keys(b.state).length)).toBe(true);
});

test("the article is lossless for the projection", () => {
  expect(P.revOf(parsed)).toBe(rev0);
});

test("a rebuild from the article keeps the rev", () => {
  expect(P.revOf(P.project(b1))).toBe(rev0);
});

test("every tool keeps its artifact, rev and state through a rebuild", () => {
  for (const [id, b] of Object.entries(blocks0)) {
    if (b.t !== "tool") continue;
    expect(b1[id]).toBeTruthy();
    expect(b1[id].artifact).toEqual(b.artifact);
    expect(b1[id].rev).toEqual(b.rev);
    expect(b1[id].state).toEqual(b.state);
  }
});

test("tool JSON holding a closing script tag cannot end the element", () => {
  const artifact = { title: "T", html: "</script><b>x</b>", css: "", javascript: "", fallbackHtml: "<p>fallback</p>", summary: "" };
  const blocks = {
    t1: { t: "tool", pos: "1", artifact, rev: "r1", state: { n: 2 } },
    t2: { t: "tool", pos: "2" },
  };
  const model = P.project(blocks);
  const article = articleOf(model, blocks);
  const html = article.innerHTML;
  expect(html.match(/<section[^>]*data-type="tool"/g).length).toBe(2);
  expect(html.match(/<\/script>/g).length).toBe(1);
  const back = P.parseModel(article, { seed: P.revOf(model) });
  expect(P.revOf(back)).toBe(P.revOf(model));
  expect(back.find((i) => i.id === "t1").artifact).toEqual(artifact);
  expect(back.find((i) => i.id === "t1").state).toEqual({ n: 2 });
  expect(back.find((i) => i.id === "t2")).toEqual({ id: "t2", t: "tool" });
});

test("readers mount a tool from the article, with no page tag", async () => {
  const artifact = {
    title: "Count", html: "<button>Count</button><output></output>", css: "",
    javascript: "function mount(tool) { const out = tool.root.querySelector('output'); const draw = () => out.textContent = String(tool.state.data.count ?? 0); const click = () => tool.state.add(['count'], 1); tool.root.querySelector('button').addEventListener('click', click); const off = tool.on('change', draw); draw(); return () => { tool.root.querySelector('button')?.removeEventListener('click', click); off(); }; }",
    fallbackHtml: "<p>Count fallback</p>", summary: "Count",
  };
  const blocks = { "tool-1": { t: "tool", pos: "1", artifact, rev: "r1", state: { count: 3 } } };
  const model = P.project(blocks);
  document.body.innerHTML = articleOf(model, blocks).outerHTML;
  expect(document.querySelector('script[merge="page"]')).toBeNull();
  const stop = startPageView(document);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const section = document.querySelector('section[data-type="tool"]');
  expect(section.querySelector("output").textContent).toBe("3");
  section.querySelector("button").click();
  expect(section.querySelector("output").textContent).toBe("4");
  stop();
});
