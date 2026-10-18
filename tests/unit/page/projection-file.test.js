import { blocksOfValues, canon, parseModel, project, renderModel, revOf } from "../../../src/page/projection.js";

/**
 * A file block in the saved article: it renders as a named link and parses back
 * to the same block, and an unsafe address never becomes a clickable href.
 */

function throughBytes(html, rev) {
  const page = `<!DOCTYPE html><html><body><main><article class="page" clay="freeze" data-page="1" data-rev="${rev}">\n${html}\n</article></main></body></html>`;
  const first = new DOMParser().parseFromString(page, "text/html");
  const bytes = "<!DOCTYPE html>" + first.documentElement.outerHTML;
  return new DOMParser().parseFromString(bytes, "text/html").querySelector("article");
}

const roundTrip = (record) => {
  const blocks = blocksOfValues([record]);
  const model = project(blocks);
  const html = renderModel(model);
  const article = throughBytes(html, revOf(model));
  return { model, html, article, parsed: parseModel(article, { seed: article.getAttribute("data-rev") }) };
};

const RECORD = {
  blocks: {
    a: { t: "paragraph", pos: "1", c: "Before" },
    f: { t: "file", pos: "2", src: "/uploads/handbook.pdf", name: "handbook.pdf", size: 123456, mime: "application/pdf" },
    t: { t: "toggle", pos: "3", open: true, c: "Inside" },
    g: { t: "file", pos: "4", parent: "t", src: "https://cdn.example.test/a b.zip", name: "A <b> & c.zip" },
  },
  deleted: {},
};

test("a file block round-trips through bytes, parent and all", () => {
  const { model, parsed } = roundTrip(RECORD);
  expect(model.map((i) => i.t)).toEqual(["paragraph", "file", "toggle", "file"]);
  expect(canon(parsed)).toBe(canon(model));
  expect(parsed.find((i) => i.id === "g").parent).toBe("t");
});

test("the article shows the name as a link with noopener, and the data the parser reads back", () => {
  const { html } = roundTrip(RECORD);
  expect(html).toContain('<a href="/uploads/handbook.pdf" rel="noopener noreferrer">handbook.pdf</a>');
  expect(html).toContain('data-type="file"');
  expect(html).toContain('data-size="123456"');
  expect(html).toContain("A &lt;b&gt; &amp; c.zip");
});

test("defaults are left out: a file with only a source and a name keeps just those", () => {
  const { model } = roundTrip({ blocks: { f: { t: "file", pos: "1", src: "/u/x.txt", name: "x.txt" } }, deleted: {} });
  expect(model[0]).toEqual({ id: "f", t: "file", src: "/u/x.txt", name: "x.txt" });
});

test.each(["javascript:alert(1)", "data:text/html,<b>", "//evil.test/x", "vbscript:x"])("a source of %s is not made a clickable href", (src) => {
  const { html, parsed } = roundTrip({ blocks: { f: { t: "file", pos: "1", src, name: "x" } }, deleted: {} });
  expect(html).not.toMatch(/<a [^>]*href=/);
  expect(parsed.find((i) => i.t === "file").src).toBe(src);
});

test("a file with no name shows 'file' as the link text", () => {
  const { html } = roundTrip({ blocks: { f: { t: "file", pos: "1", src: "/u/x" } }, deleted: {} });
  expect(html).toContain(">file</a>");
});

test("an image's alignment round-trips through bytes; centre and unknown values are left out", () => {
  const { model, parsed, html } = roundTrip({ blocks: {
    l: { t: "image", pos: "1", src: "/u/a.png", align: "left" },
    r: { t: "image", pos: "2", src: "/u/b.png", align: "right", width: 240 },
    c: { t: "image", pos: "3", src: "/u/c.png" },
    x: { t: "image", pos: "4", src: "/u/d.png", align: "middle" },
  }, deleted: {} });
  expect(model.map((i) => i.align ?? null)).toEqual(["left", "right", null, null]);
  expect(html).toContain('data-align="left"');
  expect(canon(parsed)).toBe(canon(model));
});
