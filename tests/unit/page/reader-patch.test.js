import { applySavedArticle, prepareSavedArticle } from "../../../src/page/view.js";

const FILE = (inner, { rev = "r1", title = "Reader" } = {}) =>
  `<!doctype html><html><head><title>${title}</title></head><body><article class="page" clay="freeze" data-page="1" data-rev="${rev}">${inner}</article></body></html>`;

const load = (html) => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
  return document.querySelector("article");
};
const node = (id) => document.querySelector(`article > [data-id="${id}"], article [data-id="${id}"]`);
const tool = (id, rev, artifact, fallback) =>
  `<section data-id="${id}" data-type="tool" data-rev="${rev}"><script type="application/json" data-tool>${JSON.stringify({ rev, artifact, state: {} }).replace(/</g, "\\u003c")}</script>${fallback}</section>`;

test("an unchanged paragraph keeps its node when the saved file moves it", () => {
  load(FILE('<p data-id="a">A</p><p data-id="b">B</p><p data-id="c">C</p>'));
  const a = node("a");
  const b = node("b");
  const c = node("c");
  applySavedArticle(FILE('<p data-id="c">C</p><p data-id="a">A</p><p data-id="b">B</p>'));
  expect([...document.querySelector("article").children].map((el) => el.getAttribute("data-id"))).toEqual(["c", "a", "b"]);
  expect(node("a")).toBe(a);
  expect(node("b")).toBe(b);
  expect(node("c")).toBe(c);
});

test("a changed list item leaves the nested items under it in place", () => {
  load(FILE('<ul><li data-id="one">First</li><li data-id="two">Second<ul><li data-id="two-a">Nested A</li><li data-id="two-b">Nested B</li></ul></li></ul>'));
  const two = node("two");
  const nested = node("two-a");
  applySavedArticle(FILE('<ul><li data-id="one">First, edited</li><li data-id="two">Second<ul><li data-id="two-a">Nested A</li><li data-id="two-b">Nested B, edited</li></ul></li></ul>'));
  expect(node("one").textContent).toBe("First, edited");
  expect(node("two")).toBe(two);
  expect(node("two-a")).toBe(nested);
  expect(node("two-b").textContent).toBe("Nested B, edited");
});

test("a toggle keeps the open state the reader chose, and a newer saved value is pruned with it", () => {
  const details = (open, text) => `<details data-id="t"${open ? " open" : ""}><summary>Notes</summary><p data-id="in">${text}</p></details>`;
  load(FILE(details(false, "inside")));
  const readerOpen = new Map([["t", true]]);
  const savedOpen = new Map();
  document.querySelector('details[data-id="t"]').open = true;
  applySavedArticle(FILE(details(false, "inside")), document, readerOpen, savedOpen);
  expect(node("t").open).toBe(true);
  expect(savedOpen.get("t")).toBe(false);
  applySavedArticle(FILE(details(false, "inside, edited")), document, readerOpen, savedOpen);
  expect(node("t").open).toBe(true);
  expect(readerOpen.get("t")).toBe(true);
  applySavedArticle(FILE('<p data-id="x">no toggle</p>'), document, readerOpen, savedOpen);
  expect(readerOpen.has("t")).toBe(false);
});

test("a changed heading type is replaced, not reused as a heading of the old level", () => {
  load(FILE('<h2 data-id="h">Title</h2>'));
  const old = node("h");
  applySavedArticle(FILE('<h3 data-id="h">Title</h3>'));
  expect(node("h").tagName).toBe("H3");
  expect(node("h")).not.toBe(old);
});

test("duplicate block ids never enter the reuse index", () => {
  load(FILE('<p data-id="dup">One</p><p data-id="dup">Two</p>'));
  const [first, second] = [...document.querySelectorAll('article > [data-id="dup"]')];
  applySavedArticle(FILE('<p data-id="dup">One, edited</p><p data-id="dup">Two</p>'));
  const [nextFirst, nextSecond] = [...document.querySelectorAll('article > [data-id="dup"]')];
  expect(nextFirst).not.toBe(first);
  expect(nextSecond).not.toBe(second);
  expect(nextFirst.textContent).toBe("One, edited");
});

test("preserved markup renders, and only an unchanged one keeps its node", () => {
  load(FILE('<div data-id="pre" data-type="preserved"><blockquote><p>Quoted <u>thing</u></p></blockquote></div>'));
  const kept = node("pre");
  applySavedArticle(FILE('<div data-id="pre" data-type="preserved"><blockquote><p>Quoted <u>thing</u></p></blockquote></div>'));
  expect(node("pre")).toBe(kept);
  applySavedArticle(FILE('<div data-id="pre" data-type="preserved"><blockquote><p>Quoted <em>other</em></p></blockquote></div>'));
  expect(node("pre")).not.toBe(kept);
  expect(node("pre").querySelector("em").textContent).toBe("other");
});

test("a table row id cannot stand in for an article block id", () => {
  const table = (cell) => `<table data-id="tbl"><thead><tr><th>Week</th></tr></thead><tbody><tr data-id="r1"><td>${cell}</td></tr></tbody></table>`;
  load(FILE(`<p data-id="r1">A paragraph called r1</p>${table("Sep 21")}`));
  const paragraph = node("r1");
  const grid = node("tbl");
  applySavedArticle(FILE(`<p data-id="r1">A paragraph called r1</p>${table("Sep 28")}`));
  expect(node("r1")).toBe(paragraph);
  expect(node("tbl")).not.toBe(grid);
  expect(node("tbl").querySelector("td").textContent).toBe("Sep 28");
});

test("a board card id cannot stand in for an article block id", () => {
  const board = (title) => `<section data-id="bd" data-type="board"><div data-col="k1"><h4>To do</h4><ul><li data-id="a">${title}</li></ul></div></section>`;
  load(FILE(`<p data-id="a">Ordinary block</p>${board("Card")}`));
  const paragraph = node("a");
  const section = node("bd");
  applySavedArticle(FILE(`<p data-id="a">Ordinary block, edited</p>${board("Card")}`));
  expect(node("a").tagName).toBe("P");
  expect(node("a").textContent).toBe("Ordinary block, edited");
  expect(node("a")).not.toBe(paragraph);
  expect(node("bd")).toBe(section);
});

test("an unchanged tool keeps its root and runtime subtree; a revised one is replaced from the file", () => {
  const artifact = { title: "Counter", javascript: "function mount() {}" };
  load(FILE(tool("tool-1", "r1", artifact, "<p>fallback one</p>")));
  const root = node("tool-1");
  const runtime = document.createElement("button");
  runtime.setAttribute("data-tool-scope", "");
  root.append(runtime);
  applySavedArticle(FILE(tool("tool-1", "r1", artifact, "<p>fallback one</p>")));
  expect(node("tool-1")).toBe(root);
  expect(node("tool-1").querySelector("[data-tool-scope]")).toBe(runtime);
  applySavedArticle(FILE(tool("tool-1", "r2", { ...artifact, title: "Counter 2" }, "<p>fallback two</p>")));
  expect(node("tool-1")).not.toBe(root);
  expect(node("tool-1").textContent).toContain("fallback two");
});

test("a data-rev change alone replaces nothing, but equal revisions with changed content still apply", () => {
  load(FILE('<p data-id="a">Same</p>', { rev: "r1" }));
  const paragraph = node("a");
  const prepared = prepareSavedArticle(FILE('<p data-id="a">Same</p>', { rev: "r2" }));
  expect(prepared.ok).toBe(true);
  applySavedArticle(FILE('<p data-id="a">Same</p>', { rev: "r2" }));
  expect(node("a")).toBe(paragraph);
  applySavedArticle(FILE('<p data-id="a">Different</p>', { rev: "r2" }));
  expect(node("a")).not.toBe(paragraph);
  expect(node("a").textContent).toBe("Different");
});

test("a file with no single article is refused before anything changes", () => {
  load(FILE('<p data-id="a">Saved</p>'));
  expect(prepareSavedArticle("<html><body>no article</body></html>").ok).toBe(false);
  expect(prepareSavedArticle("").ok).toBe(false);
  expect(applySavedArticle("<html><body>no article</body></html>")).toBe(false);
  expect(node("a").textContent).toBe("Saved");
});
