/**
 * The projection is rendered into the saved bytes, after save-freeze has put the
 * load-time article back, from the values the live plugin wrote into the same
 * capture. Run with the clayjs jest (see README in this folder).
 */
const ARTICLE_AT_LOAD = '<h1 data-id="h">Old title</h1><p data-id="p">Old text</p>';
const TAG = '{"blocks":{"h":{"t":"heading","pos":"1","level":1,"c":"Old title"},"p":{"t":"paragraph","pos":"2","c":"Old text"}},"deleted":{}}';

let snapshot, live, projection;

beforeAll(async () => {
  window.clayEditMode = true;
  document.head.innerHTML = `<script type="application/json" merge="page" clay="live" live-format="lines">${TAG}</script>`;
  document.body.innerHTML = `<main><article class="page" clay="freeze" data-page="1" data-rev="stale">${ARTICLE_AT_LOAD}</article></main>`;
  // Order matters and is the point: the page transform first, save-freeze
  // second. Without the static import in save-projection.js, save-freeze would
  // register after it and its restore would win.
  projection = await import("../../../src/page/save-projection.js");
  await import("../../../src/attrs/save-freeze.js");
  snapshot = await import("../../../src/core/snapshot.js");
  ({ live } = await import("../../../src/plugins/live.js"));
});

const saved = () => new DOMParser().parseFromString(snapshot.captureForSaveAndComparison({ flushUndo: false, emitForSync: false }).forSave, "text/html");

test("the saved article is the projection of the store, not the load-time article or the editor DOM", () => {
  const page = live("page");
  page.set("blocks.p.c", "New text from the store");
  page.set("blocks.n", { t: "paragraph", pos: "3", c: "Added" });
  // The editor's own DOM inside the article: never saved.
  document.querySelector("article").innerHTML = '<div class="page-shell"><div class="page-editor" contenteditable="true">EDITOR DOM</div></div>';
  const doc = saved();
  const article = doc.querySelector("article");
  expect(article.querySelector('[data-id="p"]').textContent).toBe("New text from the store");
  expect(article.querySelector('[data-id="n"]').textContent).toBe("Added");
  expect(article.textContent).not.toContain("EDITOR DOM");
  expect(article.textContent).not.toContain("Old text");
  expect(article.getAttribute("clay")).toBe("freeze");
  // The article and the tag in the same bytes describe the same blocks.
  const tag = doc.querySelector('script[merge="page"]').textContent;
  expect(JSON.parse(tag).blocks.p.c).toBe("New text from the store");
  expect(article.getAttribute("data-rev")).toBe(projection.renderFromTags([tag]).rev);
});

test("comparison captures never see the article, so editing it is never dirty", () => {
  const { forComparison, forDirty } = snapshot.captureForSaveAndComparison({ flushUndo: false, emitForSync: false });
  expect(forComparison).not.toContain("<article");
  expect(forDirty).not.toContain("<article");
});

test("two captures in a row give identical bytes", () => {
  const first = saved();
  const second = saved();
  const a1 = first.querySelector("article");
  const a2 = second.querySelector("article");
  expect(a1.outerHTML).toBe(a2.outerHTML);
  const rev1 = a1.getAttribute("data-rev");
  const rev2 = a2.getAttribute("data-rev");
  expect(rev1).toBe(rev2);
  expect(rev1).toMatch(/^[0-9a-f]{16}$/);
  expect(rev2).toMatch(/^[0-9a-f]{16}$/);
});

test("a page with no live page tag is left alone", () => {
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = '<article data-page="1" data-rev="x"><p>Hand</p></article>';
  projection.projectInto(doc);
  const article = doc.querySelector("article");
  expect(article.innerHTML).toBe("<p>Hand</p>");
  expect(article.getAttribute("data-rev")).toBe("x");
});

test("the article and the tag agree after a tombstone", () => {
  const page = live("page");
  page.set("deleted.n", true);
  page.delete("blocks.n");
  const doc = saved();
  const article = doc.querySelector("article");
  expect(article.querySelector('[data-id="n"]')).toBeNull();
  const tag = doc.querySelector('script[merge="page"]').textContent;
  expect(article.getAttribute("data-rev")).toBe(projection.renderFromTags([tag]).rev);
});

test("a captured model's title is projected with it, never the live title", () => {
  const page = live("page");
  page.set("blocks.h.c", "Title A");
  const clone = snapshot.captureSnapshot({ flushUndo: false });
  page.set("blocks.h.c", "Title B");
  document.title = "Title B";

  projection.projectInto(clone);

  const article = clone.querySelector("article");
  expect(article.querySelector('[data-id="h"]').textContent).toBe("Title A");
  expect(clone.querySelector("head title").textContent).toBe("Title A");
  expect(clone.querySelectorAll("head title")).toHaveLength(1);
});

test("an empty first H1 projects the Untitled placeholder as a title, never as article text", () => {
  const page = live("page");
  page.set("blocks.h.c", "");
  const clone = snapshot.captureSnapshot({ flushUndo: false });

  projection.projectInto(clone);

  const article = clone.querySelector("article");
  expect(article.querySelector('[data-id="h"]').textContent).toBe("");
  expect(clone.querySelector("head title").textContent).toBe("Untitled");
});

test("a custom title marker keeps the snapshot's exact title, including an empty one", () => {
  const page = live("page");
  page.set("blocks.h.c", "Derived after this");
  const meta = document.head.appendChild(document.createElement("meta"));
  meta.setAttribute("name", "clay-seo-title-mode");
  meta.setAttribute("content", "custom");
  try {
    document.title = "Hand written";
    const clone = snapshot.captureSnapshot({ flushUndo: false });
    page.set("blocks.h.c", "Later title");
    projection.projectInto(clone);

    expect(clone.querySelectorAll("head title")).toHaveLength(1);
    expect(clone.querySelector("head title").textContent).toBe("Hand written");

    document.title = "";
    const empty = snapshot.captureSnapshot({ flushUndo: false });
    projection.projectInto(empty);
    expect(empty.querySelectorAll("head title")).toHaveLength(1);
    expect(empty.querySelector("head title").textContent).toBe("");
  } finally {
    meta.remove();
    document.title = "";
  }
});

test("the editor's Untitled placeholder never reaches the saved bytes", async () => {
  const { createPageEditor } = await import("../../../src/page/editor.js");
  const page = live("page");
  page.set("blocks.h.c", "");
  const host = document.querySelector("article").appendChild(document.createElement("div"));
  const view = createPageEditor(host, { blocks: { h: { t: "heading", pos: "A", level: 1, c: "" } }, features: null });
  try {
    expect(view.dom.querySelector('[data-placeholder="Untitled"]')).not.toBeNull();
    const html = saved().documentElement.outerHTML;
    expect(html).not.toContain("data-placeholder");
    expect(html).not.toContain("page-title-placeholder");
  } finally {
    view.destroy();
    host.remove();
  }
});
