// S2's side of the restore against a running room: the restored file reads as
// untouched, so the boot's adoption leaves it alone, and the article's
// projection shows the restored block's text. jsdom, because classifyFile
// parses a DOM element.

import { blocksOfValues, project, renderModel, revOf } from "../../../src/page/projection.js";
import { classifyFile } from "../../../src/page/adopt.js";

const record = { blocks: { a: { t: "paragraph", pos: "1", c: "version one" }, b: { t: "paragraph", pos: "2", c: "keep" } }, deleted: {} };
const blocks = blocksOfValues([record]);
const model = project(blocks);
const file = `<!DOCTYPE html><html><head><script type="application/json" merge="page" clay="live">${JSON.stringify(record)}</script></head><body><article class="page" clay="freeze" data-page="1" data-rev="${revOf(model)}">\n${renderModel(model)}\n</article></body></html>`;

test("the restored file is not re-adopted, and its projection shows the restored text", () => {
  const doc = new DOMParser().parseFromString(file, "text/html");
  const article = doc.querySelector("article");
  expect(classifyFile(article, [record]).kind).toBe("untouched");
  expect(article.querySelector('[data-id="a"]').textContent).toBe("version one");
});
