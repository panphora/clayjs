import { expect, test } from "@jest/globals";
import { assets, createAssets } from "../../src/lib/assets.js";

/**
 * `clay.assets.load(name)` is how a document asks for OverType, marked or highlight.js
 * without carrying a library URL: each name is a module in the same release. These
 * drive the built vendor files, not a mock, so a rebuild that drops or renames an
 * export fails here rather than in a page.
 */

const LANGUAGES = ["bash", "css", "javascript", "json", "python", "xml"];

test("overtype resolves to the editor and its toolbar buttons", async () => {
  const mod = await assets.load("overtype");
  expect(typeof mod.default).toBe("function");
  expect(typeof mod.default.setTheme).toBe("function");
  expect(Object.keys(mod.toolbarButtons)).toContain("bold");
  expect(typeof mod.toolbarButtons.bold.action).toBe("function");
});

test("marked resolves to the Marked class", async () => {
  const { Marked } = await assets.load("marked");
  expect(typeof Marked).toBe("function");
  expect(new Marked().parse("# hi").trim()).toBe("<h1>hi</h1>");
});

test("highlight resolves to the core, with no grammar of its own", async () => {
  const { default: hljs } = await assets.load("highlight");
  expect(typeof hljs.registerLanguage).toBe("function");
  expect(typeof hljs.highlight).toBe("function");
  expect(hljs.getLanguage("javascript")).toBeUndefined();
});

test.each(LANGUAGES)("highlight/%s resolves to its grammar", async (name) => {
  const { default: language } = await assets.load(`highlight/${name}`);
  expect(typeof language).toBe("function");
});

test("the core plus a grammar highlights, in that order", async () => {
  const { default: hljs } = await assets.load("highlight");
  const { default: javascript } = await assets.load("highlight/javascript");
  hljs.registerLanguage("javascript", javascript);
  const { value } = hljs.highlight("const a = 1;", { language: "javascript" });
  expect(value).toContain("hljs-");
});

// `constructor` and friends are on every object via its prototype: a table lookup that
// used `name in table` would hand one out, so these reject like any unknown name.
test.each(["nope", "constructor", "toString", "__proto__", "hasOwnProperty"])("an unknown name rejects: %s", async (name) => {
  await expect(assets.load(name)).rejects.toThrow(`clay.assets: no asset named "${name}"`);
});

test("names lists every asset a document can ask for", () => {
  expect(assets.names()).toEqual(["overtype", "marked", "highlight", ...LANGUAGES.map((name) => `highlight/${name}`)]);
});

test("two calls before the first resolves share one load", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { load } = createAssets({ x: () => { calls += 1; return gate.then(() => ({ x: 1 })); } });

  const first = load("x");
  const second = load("x");

  expect(second).toBe(first);
  release();
  await expect(first).resolves.toEqual({ x: 1 });
  expect(calls).toBe(1);
});

test("a failed load is forgotten, so the next call tries again", async () => {
  let calls = 0;
  const { load } = createAssets({
    x: () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve({ x: 1 });
    },
  });

  await expect(load("x")).rejects.toThrow("offline");
  await expect(load("x")).resolves.toEqual({ x: 1 });
  expect(calls).toBe(2);
});
