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
const saved = (html) => new DOMParser().parseFromString(html, "text/html").querySelector("article");
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

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

test("a block moved into the toggle below it lands inside without throwing", () => {
  const before = '<p data-id="a">A</p><details data-id="t"><summary>Notes</summary><p data-id="x">X</p></details>';
  const after = '<details data-id="t"><summary>Notes</summary><p data-id="a">A</p><p data-id="x">X</p></details>';
  load(FILE(before));
  const toggle = node("t");
  const moved = node("a");
  const inner = node("x");
  expect(applySavedArticle(FILE(after))).toBe(true);
  expect(document.querySelector("article").outerHTML).toBe(saved(FILE(after)).outerHTML);
  expect(node("t")).toBe(toggle);
  expect(node("a")).toBe(moved);
  expect(node("x")).toBe(inner);
  expect(document.querySelector("article > p")).toBe(null);
});

test("a list item moved into a sibling's sublist lands there without throwing", () => {
  const before = '<ul><li data-id="one">One</li><li data-id="two">Two</li></ul>';
  const after = '<ul><li data-id="two">Two<ul><li data-id="one">One</li></ul></li></ul>';
  load(FILE(before));
  const two = node("two");
  const one = node("one");
  expect(applySavedArticle(FILE(after))).toBe(true);
  expect(document.querySelector("article").outerHTML).toBe(saved(FILE(after)).outerHTML);
  expect(node("two")).toBe(two);
  expect(node("one")).toBe(one);
  expect(node("one").parentNode.tagName).toBe("UL");
  expect(node("one").parentNode.parentNode).toBe(two);
});

test("a replaced block neither detaches later siblings nor hides a reorder", async () => {
  const artifact = { title: "Counter", javascript: "function mount() {}" };
  const blocks = (one) =>
    `<p data-id="p1">${one}</p><p data-id="p2">Two</p><details data-id="d1"><summary>Notes</summary><p data-id="in">In</p></details>${tool("t1", "r1", artifact, "<p>fallback</p>")}`;
  load(FILE(blocks("One")));
  const old = node("p1");
  const p2 = node("p2");
  const toggle = node("d1");
  const root = node("t1");
  const runtime = document.createElement("button");
  runtime.setAttribute("data-tool-scope", "");
  root.append(runtime);
  const touched = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) touched.push(...record.addedNodes, ...record.removedNodes);
  });
  observer.observe(document.querySelector("article"), { childList: true, subtree: true });
  applySavedArticle(FILE(blocks("One, edited")));
  await settled();
  observer.disconnect();
  expect(touched).not.toContain(p2);
  expect(touched).not.toContain(toggle);
  expect(touched).not.toContain(root);
  expect(touched).not.toContain(runtime);
  expect(node("p1")).not.toBe(old);
  expect(node("p2")).toBe(p2);
  expect(node("d1")).toBe(toggle);
  expect(node("t1")).toBe(root);
  expect(node("t1").querySelector("[data-tool-scope]")).toBe(runtime);
  runtime.remove();
  expect(document.querySelector("article").outerHTML).toBe(saved(FILE(blocks("One, edited"))).outerHTML);
});

test("a pure reorder reports changed", () => {
  const after = '<p data-id="b">B</p><p data-id="a">A</p>';
  load(FILE('<p data-id="a">A</p><p data-id="b">B</p>'));
  expect(applySavedArticle(FILE(after))).toBe(true);
  expect(document.querySelector("article").outerHTML).toBe(saved(FILE(after)).outerHTML);
});

test("a list item's own attributes are synced and a retagged nested list keeps its keyed items", () => {
  const before = '<ul><li data-id="i1" data-owner="alice" data-due="2026-10-25">Parent<ul><li data-id="i2">Child</li></ul></li></ul>';
  const after = '<ul><li data-id="i1" data-owner="bob" data-due="2026-11-01" data-done="yes">Parent, edited<ol><li data-id="i2">Child</li></ol></li></ul>';
  load(FILE(before));
  const item = node("i1");
  const child = node("i2");
  expect(applySavedArticle(FILE(after))).toBe(true);
  expect(node("i1")).toBe(item);
  expect(node("i2")).toBe(child);
  expect(item.getAttribute("data-owner")).toBe("bob");
  expect(item.getAttribute("data-due")).toBe("2026-11-01");
  expect(item.getAttribute("data-done")).toBe("yes");
  expect(item.querySelector("ol")).not.toBe(null);
  expect(document.querySelector("article").outerHTML).toBe(saved(FILE(after)).outerHTML);
});

test("a nested list created under an edited item adopts the item it wraps", () => {
  const before = '<ul><li data-id="i1">Parent</li><li data-id="i2">Child</li></ul>';
  const after = '<ul><li data-id="i1">Parent<ul><li data-id="i2">Child</li></ul></li></ul>';
  load(FILE(before));
  const child = node("i2");
  expect(applySavedArticle(FILE(after))).toBe(true);
  expect(node("i2")).toBe(child);
  expect(document.querySelector("article").outerHTML).toBe(saved(FILE(after)).outerHTML);
});

test("a retired list item attribute is removed", () => {
  const after = '<ul><li data-id="i1" data-owner="bob">Task</li></ul>';
  load(FILE('<ul><li data-id="i1" data-owner="alice" data-due="2026-10-25">Task</li></ul>'));
  const item = node("i1");
  expect(applySavedArticle(FILE(after))).toBe(true);
  expect(node("i1")).toBe(item);
  expect(item.hasAttribute("data-due")).toBe(false);
  expect(document.querySelector("article").outerHTML).toBe(saved(FILE(after)).outerHTML);
});

test("an uninitialized tool with a paragraph's id replaces the paragraph", () => {
  const after = '<section data-id="b1" data-type="tool"></section>';
  load(FILE('<p data-id="b1">Text</p>'));
  expect(applySavedArticle(FILE(after))).toBe(true);
  expect(node("b1").tagName).toBe("SECTION");
  expect(node("b1").hasAttribute("data-type")).toBe(true);
  expect(document.querySelector("article").outerHTML).toBe(saved(FILE(after)).outerHTML);
});

test("two identical keyless blocks both survive", () => {
  const after = "<hr><hr>";
  load(FILE("<hr>"));
  expect(applySavedArticle(FILE(after))).toBe(true);
  expect(document.querySelectorAll("article > hr").length).toBe(2);
  expect(document.querySelector("article").outerHTML).toBe(saved(FILE(after)).outerHTML);
  const more = "<hr><hr><hr>";
  expect(applySavedArticle(FILE(more))).toBe(true);
  expect(document.querySelectorAll("article > hr").length).toBe(3);
  expect(document.querySelector("article").outerHTML).toBe(saved(FILE(more)).outerHTML);
});

test("200 seeded random edits always end at the saved markup", () => {
  let seed = 20261025;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const choose = (list) => list[Math.floor(random() * list.length)];
  const chance = (p) => random() < p;
  let counter = 0;
  const nextId = () => `n${++counter}`;
  const ARTIFACT = { title: "Counter", javascript: "function mount() {}" };

  const paragraph = () => ({ kind: "p", id: nextId(), text: `note ${Math.floor(random() * 1000)}` });
  const toolBlock = () => ({ kind: "tool", id: nextId(), rev: "r1" });
  const detailsBlock = () => ({ kind: "details", id: nextId(), open: false, children: [paragraph()] });
  const itemBlock = () => ({ kind: "li", id: nextId(), owner: null, text: `task ${Math.floor(random() * 1000)}`, sublist: null });
  const listBlock = () => ({ kind: "list", tag: "ul", items: [itemBlock()] });
  const hrBlock = () => ({ kind: "hr" });
  const anyBlock = () => choose([paragraph, toolBlock, detailsBlock, listBlock, hrBlock, paragraph])();

  const renderItem = (li) => `<li data-id="${li.id}"${li.owner ? ` data-owner="${li.owner}"` : ""}>${li.text}${li.sublist ? render(li.sublist) : ""}</li>`;
  const render = (block) => {
    if (block.kind === "p") return `<p data-id="${block.id}">${block.text}</p>`;
    if (block.kind === "hr") return "<hr>";
    if (block.kind === "tool") return tool(block.id, block.rev, ARTIFACT, "<p>fallback</p>");
    if (block.kind === "details") return `<details data-id="${block.id}"${block.open ? " open" : ""}><summary>More</summary>${block.children.map(render).join("")}</details>`;
    if (block.kind === "list") return `<${block.tag}>${block.items.map(renderItem).join("")}</${block.tag}>`;
    throw new Error(block.kind);
  };

  const arraysOf = (blocks) => {
    const found = [{ owner: null, items: blocks, ancestors: [] }];
    const walk = (block, chain) => {
      if (block.kind === "list") {
        const entry = { owner: block, items: block.items, ancestors: [...chain, block] };
        found.push(entry);
        block.items.forEach((child) => walk(child, entry.ancestors));
        return;
      }
      if (block.kind === "details") {
        const entry = { owner: block, items: block.children, ancestors: [...chain, block] };
        found.push(entry);
        block.children.forEach((child) => walk(child, entry.ancestors));
        return;
      }
      if (block.kind === "li" && block.sublist) walk(block.sublist, [...chain, block]);
    };
    for (const block of blocks) walk(block, []);
    return found;
  };
  const accepts = (target, block) => (target.owner?.kind === "list" ? block.kind === "li" : block.kind !== "li");
  const placeable = (blocks, target, block) => accepts(target, block) && target.owner !== block && !target.ancestors.includes(block);

  const deepItem = () => {
    const li = itemBlock();
    li.sublist = listBlock();
    return li;
  };
  const blocks = [
    paragraph(),
    { ...detailsBlock(), children: [paragraph(), listBlock()] },
    { kind: "list", tag: "ul", items: [itemBlock(), deepItem()] },
    toolBlock(),
    paragraph(),
  ];
  load(FILE(blocks.map(render).join("")));

  for (let step = 0; step < 200; step++) {
    const arrays = arraysOf(blocks);
    const all = arrays.flatMap((entry) => entry.items);
    const kind = choose(["move", "move", "insert", "delete", "reorder", "attribute", "tag"]);
    if (kind === "move") {
      const sources = arrays.filter((entry) => entry.items.length > 0);
      if (!sources.length) continue;
      const source = choose(sources);
      const block = choose(source.items);
      const hosts = arrays.filter((entry) => placeable(blocks, entry, block));
      if (!hosts.length) continue;
      const target = choose(hosts);
      source.items.splice(source.items.indexOf(block), 1);
      target.items.splice(Math.floor(random() * (target.items.length + 1)), 0, block);
    } else if (kind === "insert") {
      const target = choose(arrays);
      const block = target.owner?.kind === "list" ? (chance(0.25) ? deepItem() : itemBlock()) : anyBlock();
      target.items.splice(Math.floor(random() * (target.items.length + 1)), 0, block);
    } else if (kind === "delete") {
      const sources = arrays.filter((entry) => entry.items.length > 0);
      if (!sources.length) continue;
      const source = choose(sources);
      source.items.splice(source.items.indexOf(choose(source.items)), 1);
    } else if (kind === "reorder") {
      const sources = arrays.filter((entry) => entry.items.length > 1);
      if (!sources.length) continue;
      const source = choose(sources);
      const from = Math.floor(random() * source.items.length);
      const to = Math.floor(random() * source.items.length);
      const [block] = source.items.splice(from, 1);
      source.items.splice(to, 0, block);
    } else if (kind === "attribute") {
      if (!all.length) continue;
      const block = choose(all);
      if (block.kind === "p") block.text = `note ${Math.floor(random() * 1000)}`;
      else if (block.kind === "li") {
        block.text = `task ${Math.floor(random() * 1000)}`;
        block.owner = choose([null, "alice", "bob"]);
      } else if (block.kind === "details") block.open = chance(0.5);
      else if (block.kind === "list") block.tag = block.tag === "ul" ? "ol" : "ul";
      else block.rev = "r2";
    } else {
      const sources = arrays.filter((entry) => entry.items.length > 0);
      if (!sources.length) continue;
      const source = choose(sources);
      const index = source.items.indexOf(choose(source.items));
      const block = source.items[index];
      if (block.kind === "list") block.tag = block.tag === "ul" ? "ol" : "ul";
      else if (block.kind === "p") source.items[index] = { kind: "details", id: block.id, open: false, children: [paragraph()] };
      else if (block.kind === "details") source.items[index] = { kind: "p", id: block.id, text: block.children.map(render).join("") };
      else block.text = `task ${Math.floor(random() * 1000)}`;
    }
    if (blocks.length < 4) blocks.splice(Math.floor(random() * (blocks.length + 1)), 0, anyBlock());
    if (!arraysOf(blocks).some((entry) => entry.ancestors.length)) blocks.push({ ...detailsBlock(), children: [paragraph(), deepItem()] });
    applySavedArticle(FILE(blocks.map(render).join("")));
    expect([step, document.querySelector("article").outerHTML]).toEqual([step, saved(FILE(blocks.map(render).join(""))).outerHTML]);
  }
});
