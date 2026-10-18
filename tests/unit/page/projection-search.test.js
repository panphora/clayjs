/**
 * @jest-environment node
 */
// The real search extractor (hyperclay/server-lib/search/extract-text.js, cheerio)
// over a saved page file: every block's text is found once, the JSON is not.
// The page tag is a <script>, which the extractor drops, so all searchable text
// must come from the projected article.

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { RECORD } from "./fixtures/all-kinds.js";
import { blocksOfValues, project, renderModel, revOf } from "../../../src/page/projection.js";

const HYPERCLAY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../hyperclay/server-lib");
const present = existsSync(path.join(HYPERCLAY, "search/extract-text.js"));
if (!present) console.log("projection-search.test.js: skipped, the sibling hyperclay checkout is not here");
const suite = present ? describe : describe.skip;

let extractSearchText;
let text;
beforeAll(async () => {
  if (!present) return;
  ({ extractSearchText } = await import(pathToFileURL(path.join(HYPERCLAY, "search/extract-text.js")).href));
  text = extractSearchText(file);
});

const blocks = blocksOfValues([RECORD]);
const model = project(blocks);
const html = renderModel(model, { fallbackOf: (id) => blocks[id]?.artifact?.fallbackHtml ?? "" });
const file = `<!DOCTYPE html><html><head><title>Relay launch review</title>
<script type="application/json" merge="page" clay="live" live-format="lines">${JSON.stringify(RECORD).replace(/</g, "\\u003c")}</script></head>
<body><main><article class="page" clay="freeze" data-page="1" data-rev="${revOf(model)}">\n${html}\n</article></main></body></html>`;

const squash = (s) => s.replace(/\uFFFC/g, " ").replace(/\s+/g, " ").trim();
const wanted = [];
for (const item of model) {
  if (typeof item.c === "string" && item.c.trim()) for (const part of item.c.split("\uFFFC")) if (part.trim()) wanted.push(squash(part));
  if (item.t === "table") { for (const c of item.cols) wanted.push(c.name); for (const r of item.rows) for (const v of Object.values(r.cells)) if (v) wanted.push(squash(v)); }
  if (item.t === "board") { for (const c of item.columns) wanted.push(c.name); for (const k of item.cards) wanted.push(k.title); }
  if (item.t === "chart" && item.title) wanted.push(item.title);
  if (item.t === "image") { if (item.alt) wanted.push(item.alt); if (item.caption) wanted.push(item.caption); }
}
wanted.push("Launch in 9 days", "Quoted thing");
const count = (needle) => text.split(needle).length - 1;

suite("search extraction over a saved page", () => {
  test("every block's text is found", () => {
    const missing = wanted.filter((w) => count(w) < 1);
    expect(missing).toEqual([]);
    expect(wanted.length).toBeGreaterThan(20);
  });

  test("no JSON from the live tag leaks into the text", () => {
    for (const json of ['"t":"paragraph"', "hard_break", "fallbackHtml", "tab-1"]) expect(text).not.toContain(json);
  });

  test("a sentence is found once, not doubled by the tag", () => {
    expect(count("Mobile empty state checked")).toBe(1);
  });
});
