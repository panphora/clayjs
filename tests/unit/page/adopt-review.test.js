import { jest } from "@jest/globals";
import { state as pmState, history } from "../../../src/vendor/prosemirror.vendor.js";
import { schema } from "../../../src/page/schema.js";
import { docFromBlocks, blockMap, identityPlugin } from "../../../src/page/model.js";
import { structurePlugin } from "../../../src/page/blocks.js";
import { blocksOfValues, project, renderModel, revOf, parseModel, fragmentCleaner } from "../../../src/page/projection.js";
import { planAdoption, adoptionTransaction, classifyFile } from "../../../src/page/adopt.js";
import { installAdoption, readFile } from "../../../src/page/adopt-boot.js";
import { createPageEditor } from "../../../src/page/editor.js";
import { startPageView } from "../../../src/page/view.js";

/**
 * Regressions from the two-seat review of S2: a file nobody touched never
 * produces ops, a hand edit never loses or duplicates blocks, links and tool
 * fallbacks cannot carry script into the saved article, and the autosave hold
 * always ends.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const fallbacks = (blocks) => (id) => (typeof blocks[id]?.artifact?.fallbackHtml === "string" ? blocks[id].artifact.fallbackHtml : "");

// The saved file as the save transform writes it, optionally hand-edited.
function fileOf(record, { edit = () => {}, rev = true } = {}) {
  const blocks = blocksOfValues([record]);
  const model = project(blocks);
  const html = renderModel(model, { fallbackOf: fallbacks(blocks), clean: fragmentCleaner(document) });
  const revAttr = rev ? ` data-rev="${revOf(model)}"` : "";
  const page = `<!DOCTYPE html><html><head><script type="application/json" merge="page" clay="live">${JSON.stringify(record).replace(/</g, "\\u003c")}</script></head><body><article class="page" clay="freeze" data-page="1"${revAttr}>\n${html}\n</article></body></html>`;
  const d = new DOMParser().parseFromString(page, "text/html");
  edit(d);
  return "<!DOCTYPE html>" + d.documentElement.outerHTML;
}
const read = (html) => readFile(new DOMParser().parseFromString(html, "text/html"));
const stateOf = (blocks) => pmState.EditorState.create({ doc: docFromBlocks(schema, blocks), plugins: [history.history(), structurePlugin(), identityPlugin()] });

function adoptInto(st, html) {
  const file = read(html);
  const found = classifyFile(file.article, file.tags);
  if (found.kind !== "adopt") return { found, plan: null, next: st };
  const plan = planAdoption(found.base, found.parsed, found.baseItems);
  const tr = adoptionTransaction(st, plan);
  return { found, plan, tr, next: tr ? st.apply(tr) : st };
}
const texts = (st) => {
  const out = [];
  st.doc.forEach((n) => out.push(n.textContent));
  return out;
};

describe("a file nobody touched produces no plan", () => {
  const after = { b: { t: "paragraph", pos: "2", c: "After the tool" }, c: { t: "heading", pos: "3", level: 2, c: "A heading" } };
  test.each([
    ["<table><tr><td>Launch"],
    ["<p>Notes</p><textarea>draft"],
    ["<p><b>Launch in 9 days</p>"],
    ['<p>See <a href="/x">details'],
  ])("unbalanced tool fallback %s keeps the blocks after it", (fallbackHtml) => {
    const record = { blocks: { tool: { t: "tool", pos: "1", artifact: { fallbackHtml } }, ...after }, deleted: {} };
    const html = fileOf(record);
    const article = read(html).article;
    expect(article.querySelector(':scope > [data-id="b"]')).not.toBeNull();
    expect(article.querySelector(':scope > [data-id="c"]')).not.toBeNull();
    const { found, plan } = adoptInto(stateOf(clone(record.blocks)), html);
    expect(found.kind === "untouched" || plan === null).toBe(true);
  });

  test.each([
    ["an image caption with a newline", { t: "image", pos: "1", src: "/a.png", alt: "A", caption: "one\ntwo" }],
    ["a chart title with a newline", { t: "chart", pos: "1", kind: "line", title: "Sign\nups" }],
    ["code with CRLF", { t: "code_block", pos: "1", c: "line one\r\nline two" }],
    ["a table column name with a newline", { t: "table", pos: "1", cols: { c1: { pos: "1", name: "Q1\nrevenue" } }, rows: { r1: { pos: "1", cells: { c1: "10" } } } }],
  ])("%s reads back untouched", (_name, block) => {
    const record = { blocks: { a: block }, deleted: {} };
    expect(read(fileOf(record)) && classifyFile(read(fileOf(record)).article, [record]).kind).toBe("untouched");
  });

  test.each([
    ["<video controls></video>"],
    ["<blockquote class='quote'>text<br/></blockquote>"],
  ])("preserved markup %s produces no plan", (html) => {
    const record = { blocks: { v: { t: "preserved", pos: "1", html }, p: { t: "paragraph", pos: "2", c: "After" } }, deleted: {} };
    const { found, plan } = adoptInto(stateOf(clone(record.blocks)), fileOf(record));
    expect(found.kind === "untouched" || plan === null).toBe(true);
  });
});

test("a tool fallback is saved as static markup: no scripts, handlers or script URLs", () => {
  const record = { blocks: { tool: { t: "tool", pos: "1", artifact: { fallbackHtml: '<img src="x" onerror="boom()"><script>boom()</script><a href=" javascript:boom()">link</a><p>Kept</p>' } } }, deleted: {} };
  const section = read(fileOf(record)).article.querySelector('[data-id="tool"]');
  expect(section.querySelector("script:not([data-tool])")).toBeNull();
  expect(section.querySelector("img").hasAttribute("onerror")).toBe(false);
  expect(section.querySelector("a").hasAttribute("href")).toBe(false);
  expect(section.querySelector("p").textContent).toBe("Kept");
});

test("a link to a script URL is never rendered, and a hand-written one is not adopted as a link", () => {
  const key = "a" + JSON.stringify(["javascript:alert(document.domain)"]);
  const record = { blocks: { p: { t: "paragraph", pos: "1", c: "click", m: [[5, key]] } }, deleted: {} };
  const article = read(fileOf(record)).article;
  expect(article.querySelector("a")).toBeNull();
  expect(article.textContent.trim()).toBe("click");
  const hand = new DOMParser().parseFromString('<article data-page="1"><p>go <a href="JavaScript:x()">here</a></p></article>', "text/html").querySelector("article");
  const [item] = parseModel(hand);
  expect(JSON.stringify(item)).not.toContain("JavaScript");
});

test("a stale plain-HTML article (no data-rev) is not adopted over newer tags", () => {
  const record = { blocks: { p: { t: "paragraph", pos: "1", c: "Written by an agent, then edited" }, x: { t: "paragraph", pos: "2", c: "Added later" } }, deleted: {} };
  const html = fileOf(record, { rev: false, edit: (d) => { d.querySelector("article").innerHTML = "<h1>Plan</h1><p>Written by an agent</p>"; } });
  const file = read(html);
  expect(classifyFile(file.article, file.tags).kind).toBe("unbased");
});

test("a plain-HTML article into an empty page leaves no placeholder line", () => {
  const html = fileOf({ blocks: {}, deleted: {} }, { rev: false, edit: (d) => { d.querySelector("article").innerHTML = "<h1>Plan</h1><p>Body</p>"; } });
  const st = pmState.EditorState.create({ doc: docFromBlocks(schema, { empty: { t: "paragraph", pos: "1", c: "" } }), plugins: [history.history(), structurePlugin(), identityPlugin()] });
  expect(texts(adoptInto(st, html).next)).toEqual(["Plan", "Body"]);
});

test("a reorder adopts while a peer has deleted a block the article still shows", () => {
  const record = { blocks: { a: { t: "paragraph", pos: "1", c: "A" }, b: { t: "paragraph", pos: "2", c: "B" }, c: { t: "paragraph", pos: "3", c: "C" }, d: { t: "paragraph", pos: "4", c: "D" } }, deleted: {} };
  const html = fileOf(record, { edit: (doc) => { const art = doc.querySelector("article"); art.prepend(doc.querySelector('[data-id="d"]')); } });
  const current = clone(record.blocks);
  delete current.b;
  const { next } = adoptInto(stateOf(current), html);
  expect(texts(next)).toEqual(["D", "A", "C"]);
});

test("deleting a table's last row keeps the table and the rest of the edit", () => {
  const record = { blocks: { h: { t: "heading", pos: "1", level: 2, c: "Title" }, tbl: { t: "table", pos: "2", cols: { c1: { pos: "1", name: "Name" } }, rows: { r1: { pos: "1", cells: { c1: "x" } } } } }, deleted: {} };
  const html = fileOf(record, { edit: (doc) => { doc.querySelector('[data-id="h"]').textContent = "Title v2"; for (const tr of doc.querySelectorAll("tbody tr")) tr.remove(); } });
  const { next } = adoptInto(stateOf(clone(record.blocks)), html);
  const map = blockMap(next.doc);
  expect(map.h.c).toBe("Title v2");
  expect(Object.keys(map.tbl.rows)).toHaveLength(1);
});

test("two hand edits from the same save add a new paragraph once", () => {
  const record = { blocks: { a: { t: "paragraph", pos: "1", c: "A" } }, deleted: {} };
  const first = fileOf(record, { edit: (d) => { d.querySelector("article").insertAdjacentHTML("beforeend", "<p>new</p>"); } });
  const second = fileOf(record, { edit: (d) => { d.querySelector('[data-id="a"]').textContent = "A edited"; d.querySelector("article").insertAdjacentHTML("beforeend", "<p>new</p>"); } });
  const one = adoptInto(stateOf(clone(record.blocks)), first).next;
  const two = adoptInto(one, second).next;
  expect(texts(two)).toEqual(["A edited", "new"]);
});

test("an image alone in a paragraph is adopted as an image", () => {
  const article = new DOMParser().parseFromString('<article data-page="1"><p><img src="/photo.png" alt="Photo"></p></article>', "text/html").querySelector("article");
  const [item] = parseModel(article);
  expect(item.t).toBe("image");
  expect(item.src).toBe("/photo.png");
});

test("unknown elements are kept as preserved blocks, and script or style text is dropped", () => {
  const article = new DOMParser().parseFromString('<article data-page="1"><my-chart><p>Inside</p><p>Second</p></my-chart><script>var x = 1;</script><style>p{}</style><p>Body</p></article>', "text/html").querySelector("article");
  const items = parseModel(article);
  expect(items.map((i) => i.t)).toEqual(["preserved", "paragraph"]);
  expect(items[0].html).toContain("<my-chart>");
  expect(JSON.stringify(items)).not.toContain("var x");
});

test("a duplicated board column becomes a second column", () => {
  const article = new DOMParser().parseFromString('<article data-page="1"><section data-type="board"><div data-col="c"><h4>Copy</h4><ul><li>X</li></ul></div><div data-col="c"><h4>Original</h4><ul><li>Y</li></ul></div></section></article>', "text/html").querySelector("article");
  const [board] = parseModel(article);
  expect(board.columns).toHaveLength(2);
  const [copy, original] = board.columns;
  expect(copy.id).not.toBe(original.id);
  expect(board.cards.find((k) => k.title === "X").col).toBe(copy.id);
  expect(board.cards.find((k) => k.title === "Y").col).toBe(original.id);
});

describe("the adoption controller", () => {
  const RECORD = { blocks: { h: { t: "heading", pos: "1", level: 1, c: "Title" }, a: { t: "paragraph", pos: "2", c: "Hello world" } }, deleted: {} };
  const handEdited = () => read(fileOf(RECORD, { edit: (d) => { d.querySelector('[data-id="a"]').textContent = "Hello world!"; } }));
  let mount, view;
  beforeEach(() => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
  });
  afterEach(() => {
    view?.destroy();
    mount.remove();
  });

  test("typing after an adoption is its own undo step", async () => {
    view = createPageEditor(mount, { blocks: clone(RECORD.blocks) });
    const controller = installAdoption({ view, source: handEdited(), hold: () => {}, release: () => {} });
    await controller.idle();
    const end = view.state.doc.content.size - 1;
    view.dispatch(view.state.tr.insertText("?", end));
    expect(blockMap(view.state.doc).a.c).toBe("Hello world!?");
    history.undo(view.state, view.dispatch);
    expect(blockMap(view.state.doc).a.c).toBe("Hello world!");
    controller.dispose();
  });

  test("a peer's text that the hand edit replaced is reported as displaced", async () => {
    const current = clone(RECORD.blocks);
    current.a.c = "Hello brave world";
    view = createPageEditor(mount, { blocks: current });
    const notices = [];
    const controller = installAdoption({ view, source: handEdited(), hold: () => {}, release: () => {}, notice: (n) => notices.push(n) });
    await controller.idle();
    expect(blockMap(view.state.doc).a.c).toBe("Hello world!");
    expect(notices).toHaveLength(1);
    expect(notices[0].displaced.a.c).toBe("Hello brave world");
    controller.dispose();
  });

  test("dispose releases a hold whose wait never ends", async () => {
    view = createPageEditor(mount, { blocks: clone(RECORD.blocks) });
    let holds = 0, releases = 0;
    const controller = installAdoption({ view, source: handEdited(), ready: new Promise(() => {}), hold: () => holds++, release: () => releases++ });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect([holds, releases]).toEqual([1, 0]);
    controller.dispose();
    await controller.idle();
    expect(releases).toBe(1);
    expect(blockMap(view.state.doc).a.c).toBe("Hello world");
  });

  test("a wait that outlasts holdMs gives up and releases", async () => {
    view = createPageEditor(mount, { blocks: clone(RECORD.blocks) });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let releases = 0;
    const controller = installAdoption({ view, source: handEdited(), ready: new Promise(() => {}), holdMs: 20, hold: () => {}, release: () => releases++ });
    await controller.idle();
    expect(releases).toBe(1);
    expect(warn.mock.calls.some(([m]) => String(m).includes("gave up"))).toBe(true);
    warn.mockRestore();
    controller.dispose();
  });
});

describe("the reader view", () => {
  const record = { blocks: { t: { t: "toggle", pos: "1", c: "Notes", open: false }, x: { t: "paragraph", pos: "2", parent: "t", c: "Inside" }, y: { t: "paragraph", pos: "3", c: "After" } }, deleted: {} };
  const page = (rec) => fileOf(rec);

  test("a toggle opened without a click (find in page) stays open across an update", async () => {
    document.documentElement.innerHTML = new DOMParser().parseFromString(page(record), "text/html").documentElement.innerHTML;
    const stop = startPageView(document);
    document.querySelector('details[data-id="t"]').open = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const next = clone(record);
    next.blocks.y.c = "After, edited";
    document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: page(next) } }));
    expect(document.querySelector('details[data-id="t"]').open).toBe(true);
    stop();
  });

  test("a click that does not toggle records nothing", async () => {
    document.documentElement.innerHTML = new DOMParser().parseFromString(page(record), "text/html").documentElement.innerHTML;
    const stop = startPageView(document);
    document.querySelector('details[data-id="t"] > summary').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    document.querySelector('details[data-id="t"]').open = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const next = clone(record);
    next.blocks.t.open = true;
    document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: page(next) } }));
    expect(document.querySelector('details[data-id="t"]').open).toBe(true);
    stop();
  });
});
