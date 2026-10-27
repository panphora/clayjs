import { RECORD } from "./fixtures/all-kinds.js";
import { blocksOfValues, project } from "../../../src/page/projection.js";
import { PageExportError, renderExportHtml } from "../../../src/page/export-html.js";

/**
 * The readable snapshot: one static HTML document rendered from the live page model
 * through the saved page's own projection. Every block that saves exports, the page
 * icon and cover ride the title, toggles come out open, the table of contents is a
 * plain list, and the editor, live store, recovery journal and host data stay behind.
 * The inventory names every image, attachment, chart and embed without fetching one;
 * an address the file cannot carry, or a tool with no static rendering, is a named
 * refusal rather than a quietly missing block.
 */

// The rich page: every block kind, the decorated title, a table of contents, a mention
// with an emoji, an attachment and a toggle heading that is closed in the document.
const rich = () => {
  const record = JSON.parse(JSON.stringify(RECORD));
  record.blocks.h = { ...record.blocks.h, pageIcon: "🚀", pageCoverSrc: "/uploads/cover.jpg", pageCoverAlt: "The team" };
  record.blocks.img.src = "/uploads/dip.png";
  const parts = [["Ask ", ""], ["Maya", 'x["mention",{"id":"maya"}]'], [" about the 🚀 launch", ""]];
  record.blocks.note = {
    t: "paragraph",
    pos: "U",
    c: parts.map(([text]) => text).join(""),
    m: parts.map(([text, key]) => [text.length, key]),
  };
  record.blocks.toc = { t: "toc", pos: "V", maxLevel: 3 };
  record.blocks.tg3 = { t: "toggle", pos: "W", level: 2, c: "Closed heading" };
  record.blocks.tg3a = { t: "paragraph", pos: "X", parent: "tg3", c: "Hidden until opened" };
  record.blocks.q = { t: "quote", pos: "Y", c: "Quoted line" };
  record.blocks.file = { t: "file", pos: "Z", src: "/uploads/relay.pdf", name: "relay.pdf", size: 2048, mime: "application/pdf" };
  return record;
};

const modelOf = (record = rich()) => project(blocksOfValues([record]));
const render = (record = rich()) => renderExportHtml(modelOf(record));
const docOf = (html) => new DOMParser().parseFromString(html, "text/html");

const errorOf = (run) => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
};

test("every block kind and the decorated title survive into the reading copy", () => {
  const { html, title } = render();
  const doc = docOf(html);
  const article = doc.querySelector("article[data-page]");
  expect(article).not.toBeNull();
  expect(title).toBe("Relay launch review");

  const header = article.querySelector("header[data-page-heading]");
  expect(header.querySelector("h1").textContent).toBe("Relay launch review");
  expect(header.querySelector("[data-page-icon]").textContent).toBe("🚀");
  expect(header.querySelector("img[data-page-cover]").getAttribute("src")).toBe("/uploads/cover.jpg");

  expect(article.querySelector("p strong").textContent).toBe("Bold");
  expect(article.querySelector('p a[href="https://example.test/?a=1&b=<2>"]').textContent).toBe("link");
  expect(article.querySelector("h2").textContent).toBe("What changed");

  const items = [...article.querySelectorAll("li")].map((li) => [...li.childNodes].find((node) => node.nodeType === 3)?.data ?? "");
  for (const text of ["First bullet", "Nested ordered one", "Nested ordered two", "Deeper bullet", "Second bullet", "Ordered after bullet", "Invite copy"]) {
    expect(items).toContain(text);
  }
  const boxes = [...article.querySelectorAll("li input[type=checkbox]")];
  expect(boxes.length).toBe(2);
  for (const box of boxes) expect(box.hasAttribute("disabled")).toBe(true);
  const checked = boxes.filter((box) => box.hasAttribute("checked"));
  expect(checked.length).toBe(1);
  expect(checked[0].closest("li").textContent).toBe("Mobile empty state checked");

  expect(article.querySelector("aside.page-callout").textContent).toBe("Decision: launch.");
  expect(article.querySelector('blockquote[data-id="q"]').textContent).toBe("Quoted line");
  expect(article.querySelector("pre code").textContent).toContain("const a = 1 < 2 && 3;");
  expect(article.querySelectorAll("hr").length).toBe(1);

  expect(article.querySelector("summary").textContent).toBe("Interview notes");
  expect(article.textContent).toContain("Inside the toggle");
  expect(article.textContent).toContain("Two deep");

  const image = article.querySelector('figure[data-type="image"]');
  expect(image.querySelector("img").getAttribute("src")).toBe("/uploads/dip.png");
  expect(image.querySelector("figcaption").textContent).toBe("Sep 28 dip");

  const table = article.querySelector("table");
  expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Week", "Activation %", "Note"]);
  expect(table.textContent).toContain("invite <first>");

  const board = article.querySelector('section[data-type="board"]');
  expect(board.textContent).toContain("To do");
  expect(board.textContent).toContain("Sample inbox");

  expect(article.querySelector('section[data-type="tool"]').textContent).toContain("Launch in 9 days");
  expect(article.querySelector('div[data-type="preserved"]').textContent).toContain("Quoted thing");

  expect(article.querySelector('[data-type="file"] a').textContent).toBe("relay.pdf");

  expect(article.textContent).toContain("Ask Maya about the 🚀 launch");
  expect(article.querySelector("span[data-page-mention]")?.textContent).toBe("Maya");
});

test("no editor, live, recovery or host data reaches the file", () => {
  const { html } = render();
  const doc = docOf(html);
  expect(html).not.toMatch(/\sclay=/);
  expect(html).not.toMatch(/\smerge=/);
  expect(html).not.toMatch(/\slive=/);
  expect(html).not.toContain("data-clay");
  expect(html).not.toMatch(/<script/i);
  expect(doc.querySelectorAll("script, link, style[data-name]").length).toBe(0);
  expect(doc.querySelectorAll(".page-editor, .page-toolbar, .page-chrome, .page-gutter, [contenteditable]").length).toBe(0);
  expect(html).not.toContain("page-recovery");
  expect(html).not.toContain("application/json");
  expect(doc.body.children.length).toBe(1);
});

test("the title is escaped in the head and in the article", () => {
  const record = rich();
  record.blocks.h.c = "</title><script>alert(1)</script>";
  const { html } = render(record);
  expect(html).not.toContain("</title><script>");
  expect(html).not.toMatch(/<script/i);
  expect(html).toContain("<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>");
  expect(docOf(html).querySelector("h1").textContent).toBe("</title><script>alert(1)</script>");
});

test("every toggle comes out open, including one the document keeps closed", () => {
  const { html } = render();
  const article = docOf(html).querySelector("article");
  const details = [...article.querySelectorAll("details")];
  expect(details.length).toBe(3);
  for (const el of details) expect(el.hasAttribute("open")).toBe(true);
  const closed = article.querySelector('details[data-id="tg3"]');
  expect(closed.hasAttribute("open")).toBe(true);
  expect(closed.textContent).toContain("Hidden until opened");
});

test("a chart exports as its static SVG, not as a request for one", () => {
  const { html } = render();
  const figure = docOf(html).querySelector('figure[data-type="chart"]');
  const svg = figure.querySelector("svg");
  expect(svg).not.toBeNull();
  expect(svg.querySelectorAll("path, line, text").length).toBeGreaterThan(0);
  expect(figure.querySelector("figcaption").textContent).toBe("Activation by week");
  expect(figure.querySelector("img, iframe")).toBeNull();
});

test("the table of contents exports as a plain list of its entries", () => {
  const { html } = render();
  const nav = docOf(html).querySelector('nav[data-type="toc"]');
  expect(nav).not.toBeNull();
  expect(nav.querySelectorAll("a").length).toBe(0);
  const entries = [...nav.querySelectorAll("li")].map((li) => li.textContent);
  expect(entries).toContain("What changed");
  expect(entries).toContain("Closed heading");
});

test("the inventory names every image, attachment and chart without fetching one", () => {
  const { resources } = render();
  expect(resources.length).toBe(4);
  expect(resources.map((entry) => `${entry.kind} ${entry.url}`).sort()).toEqual([
    "attachment /uploads/relay.pdf",
    "chart null",
    "image /uploads/cover.jpg",
    "image /uploads/dip.png",
  ]);
  for (const entry of resources) expect(entry.blockId).toBeTruthy();
  expect(resources.filter((entry) => entry.kind === "chart")[0].inline).toBe(true);
  expect(resources.filter((entry) => entry.kind !== "chart").every((entry) => entry.inline === false)).toBe(true);
});

test("an image inside preserved markup is inventoried, and its unsafe candidate refused", () => {
  const record = rich();
  record.blocks.kept = { t: "preserved", pos: "a", html: '<img src="/uploads/kept.png" srcset="/uploads/kept.png 1x, /uploads/kept-2.png 2x">' };
  const { resources } = render(record);
  expect(resources.filter((entry) => entry.kind === "image").map((entry) => entry.url)).toEqual([
    "/uploads/cover.jpg",
    "/uploads/dip.png",
    "/uploads/kept.png",
    "/uploads/kept-2.png",
  ]);

  const hostile = rich();
  hostile.blocks.kept = { t: "preserved", pos: "a", html: '<img srcset="javascript:alert(1) 1x">' };
  const error = errorOf(() => render(hostile));
  expect(error).toBeInstanceOf(PageExportError);
  expect(error.code).toBe("unsafe-url");
});

test("an image embedded in the document is inventoried as already inline", () => {
  const record = rich();
  const data = "data:image/png;base64,iVBORw0KGgo=";
  record.blocks.img.src = data;
  const { resources } = render(record);
  const embedded = resources.find((entry) => entry.kind === "image" && entry.blockId === "img");
  expect(embedded).toEqual({ kind: "image", url: data, blockId: "img", inline: true });
});

test("an unsafe image address is a named refusal, never a silent block", () => {
  for (const src of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"]) {
    const record = rich();
    record.blocks.img.src = src;
    const error = errorOf(() => render(record));
    expect(error).toBeInstanceOf(PageExportError);
    expect(error.name).toBe("PageExportError");
    expect(error.code).toBe("unsafe-url");
    expect(error.message).toContain("img");
  }
});

test("an unsafe attachment address is refused by name too", () => {
  const record = rich();
  record.blocks.file.src = "javascript:alert(1)";
  const error = errorOf(() => render(record));
  expect(error).toBeInstanceOf(PageExportError);
  expect(error.code).toBe("unsafe-url");
});

test("a tool with no static rendering is a named refusal", () => {
  const record = rich();
  record.blocks.tool.artifact = { ...record.blocks.tool.artifact, fallbackHtml: "" };
  const error = errorOf(() => render(record));
  expect(error).toBeInstanceOf(PageExportError);
  expect(error.code).toBe("unsupported-tool");
  expect(error.message).toContain("tool");
});

test("a model that is not a projection model is refused rather than rendered", () => {
  expect(errorOf(() => renderExportHtml(null))).toBeInstanceOf(TypeError);
});
