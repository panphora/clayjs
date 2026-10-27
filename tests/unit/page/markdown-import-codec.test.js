import "../../../src/vendor/marked.vendor.js";
import { Marked } from "../../../src/vendor/marked.vendor.js";
import { MAX_BLOCKS, MAX_BYTES, MAX_DEPTH, MarkdownImportError, importMarkdownTokens } from "../../../src/page/import-markdown.js";
import { blockMap, docFromBlocks, orderedIds } from "../../../src/page/model.js";
import { schema } from "../../../src/page/schema.js";
import { unitsOf, unpackMarks } from "../../../src/page/inline.js";

/**
 * The Markdown import codec takes marked's lexer output and returns page blocks:
 * every supported construct becomes the record's own block and marks, unsupported
 * ones are kept as literal blocks and named, a refused address keeps its text, and
 * the result opens through the production conversion (docFromBlocks).
 */

const markdown = (text) => new Marked().lexer(text);
const convert = (text) => importMarkdownTokens(markdown(text));
const inorder = (blocks) => orderedIds(blocks).map((id) => blocks[id]);
const keys = (block) => unitsOf(block.m, block.c.length) ?? [];
const keyAt = (block, word) => keys(block)[block.c.indexOf(word)];
const kinds = (blocks) => inorder(blocks).map((block) => block.t);
const normalized = (blocks) => Object.fromEntries(Object.entries(blocks).map(([id, block]) => [id, unpackMarks(block)]));
const converted = (blocks) => blockMap(docFromBlocks(schema, blocks));

const CORPUS = `# First title

A paragraph with **strong**, *emphasis*, ~~struck~~ and \`inline code\`,
a [link](https://example.test/a?b=1), an ![image](https://example.test/i.png),
a backslash \\* escape and two spaces  
after a break.

## Second title

### Third title

- a bullet
- another bullet
  - a nested bullet

1. one
2. two

- [ ] a task
- [x] a done task

> A quote.
>
> A second quoted paragraph.

\`\`\`js
const answer = 42;
\`\`\`

---

| Column one | Column two |
| --- | --- |
| a value | **a bold value** |

<figure class="raw">raw block html</figure>

A paragraph with <span>raw inline html</span> in it.

A paragraph with a hard<br>break.

[reference]: https://example.test/reference
`;

function countTypes(tokens, counts = new Map()) {
  for (const token of tokens ?? []) {
    counts.set(token.type, (counts.get(token.type) ?? 0) + 1);
    countTypes(token.tokens, counts);
    for (const item of token.items ?? []) {
      counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
      countTypes(item.tokens, counts);
    }
    for (const cell of [...(token.header ?? []), ...(token.rows ?? []).flat()]) countTypes(cell.tokens, counts);
  }
  return counts;
}

test("every supported token type arrives with a nonzero count and becomes its own block", () => {
  const tokens = markdown(CORPUS);
  const counts = countTypes(tokens);
  for (const type of ["heading", "paragraph", "text", "strong", "em", "del", "codespan", "link", "image", "escape", "br", "list", "list_item", "checkbox", "blockquote", "code", "hr", "table", "html", "def", "space"]) {
    expect([type, counts.get(type) ?? 0]).toEqual([type, expect.any(Number)]);
    expect(counts.get(type) ?? 0).toBeGreaterThan(0);
  }
  expect(counts.get("space")).toBeGreaterThan(0);

  const { blocks, unsupported } = importMarkdownTokens(tokens);
  const found = kinds(blocks);
  for (const type of ["heading", "paragraph", "list_item", "quote", "code_block", "divider", "table", "image", "preserved"]) {
    expect([type, found.filter((t) => t === type).length > 0]).toEqual([type, true]);
  }
  expect(found).toContain("preserved");
  expect(unsupported.map((entry) => entry.type)).toEqual(["def"]);

  const [first, second] = inorder(blocks).filter((block) => block.t === "paragraph");
  expect(first.c).toBe("A paragraph with strong, emphasis, struck and inline code,\na link, an ");
  expect(keyAt(first, "strong")).toBe("b");
  expect(keyAt(first, "emphasis")).toBe("i");
  expect(keyAt(first, "struck")).toBe("s");
  expect(keyAt(first, "inline code")).toBe("c");
  expect(keyAt(first, "link")).toBe('a["https://example.test/a?b=1"]');
  expect(second.c).toBe(",\na backslash * escape and two spaces\uFFFCafter a break.");
  expect(keyAt(second, "escape")).toBe("");
  expect(keys(second)[second.c.indexOf("\uFFFC")]).toBe('@{"type":"hard_break"}');

  const [list] = [inorder(blocks).filter((block) => block.t === "list_item")];
  expect(list.map((item) => [item.kind ?? "bullet", item.indent ?? 0, item.checked ?? false, item.c])).toEqual([
    ["bullet", 0, false, "a bullet"],
    ["bullet", 0, false, "another bullet"],
    ["bullet", 1, false, "a nested bullet"],
    ["ordered", 0, false, "one"],
    ["ordered", 0, false, "two"],
    ["check", 0, false, "a task"],
    ["check", 0, true, "a done task"],
  ]);
});

test("Unicode survives whole: graphemes, accents and marks over them", () => {
  const text = "- 👩‍👩‍👧‍👦 family\n- café ☕️ naïve\n\n**👩🏽‍🚀 astronaut** and _émoji_ 🎉\n";
  const { blocks } = convert(text);
  const items = inorder(blocks).filter((block) => block.t === "list_item");
  expect(items.map((item) => item.c)).toEqual(["👩‍👩‍👧‍👦 family", "café ☕️ naïve"]);
  expect(items[0].c.length).toBe("👩‍👩‍👧‍👦 family".length);

  const [paragraph] = inorder(blocks).filter((block) => block.t === "paragraph");
  expect(paragraph.c).toBe("👩🏽‍🚀 astronaut and émoji 🎉");
  expect(keys(paragraph)).toHaveLength(paragraph.c.length);
  expect(keyAt(paragraph, "astronaut")).toBe("b");
  expect(keyAt(paragraph, "émoji")).toBe("i");
  expect(keys(paragraph).slice(0, "👩🏽‍🚀 astronaut".length).every((key) => key === "b")).toBe(true);
  expect(paragraph.m).toEqual([[17, "b"], [5, ""], [5, "i"], [3, ""]]);
});

test("only the addresses the editor stores become links and images", () => {
  const { blocks, refused } = convert("[ok](https://x.test/a) [path](/local/page#top) [mail](mailto:a@x.test) [bad](javascript:alert(1)) [data](data:text/html,<b>x</b>)\n\n![good](https://x.test/i.png) ![bad](javascript:alert(1))\n");
  const found = inorder(blocks);
  const [paragraph] = found;
  const image = found.find((block) => block.t === "image");
  const tail = found[found.length - 1];
  expect(paragraph.c).toBe("ok path mail bad data");
  expect(keyAt(paragraph, "ok")).toBe('a["https://x.test/a"]');
  expect(keyAt(paragraph, "path")).toBe('a["/local/page#top"]');
  expect(keyAt(paragraph, "mail")).toBe('a["mailto:a@x.test"]');
  expect(keyAt(paragraph, "bad")).toBe("");
  expect(keyAt(paragraph, "data")).toBe("");
  expect(image).toEqual({ t: "image", src: "https://x.test/i.png", alt: "good", pos: image.pos });
  expect(found.map((block) => block.c ?? block.t)).toEqual(["ok path mail bad data", "image", " ", "bad"]);
  expect(tail.c).toBe("bad");
  expect(refused).toEqual([
    { type: "link", href: "javascript:alert(1)" },
    { type: "link", href: "data:text/html,<b>x</b>" },
    { type: "image", href: "javascript:alert(1)" },
  ]);
});

test("raw HTML stays inert: a block is preserved as written and inline markup is text", () => {
  const { blocks } = convert('<div class="note"><b>bold</b> &amp; <script>alert(1)</script></div>\n\nA <b>bold</b> word with <img src=x onerror=alert(1)> in it.\n');
  const [preserved, paragraph] = inorder(blocks);
  expect(preserved.t).toBe("preserved");
  expect(preserved.html).toBe('<div class="note"><b>bold</b> &amp; <script>alert(1)</script></div>');
  expect(paragraph.t).toBe("paragraph");
  expect(paragraph.c).toBe("A <b>bold</b> word with <img src=x onerror=alert(1)> in it.");
  expect(keys(paragraph).every((key) => key === "")).toBe(true);

  const doc = docFromBlocks(schema, blocks);
  expect(doc.child(0).type.name).toBe("preserved");
  expect(doc.child(1).type.name).toBe("paragraph");
  expect(doc.child(0).attrs.html).toContain("<script>alert(1)</script>");
  expect(doc.child(1).textContent).toBe("A <b>bold</b> word with <img src=x onerror=alert(1)> in it.");
  expect(doc.child(0).childCount).toBe(0);
});

test("an unsupported token is kept as a literal block and named, never dropped", () => {
  const { blocks, unsupported } = convert("[ref]: https://x.test/target\n\ntext [ref]\n");
  expect(kinds(blocks)).toEqual(["code_block", "paragraph"]);
  expect(inorder(blocks)[0]).toEqual({ t: "code_block", lang: "markdown", c: "[ref]: https://x.test/target", pos: inorder(blocks)[0].pos });
  expect(inorder(blocks)[1].c).toBe("text ref");
  expect(keyAt(inorder(blocks)[1], "ref")).toBe('a["https://x.test/target"]');
  expect(unsupported).toEqual([{ type: "def", text: "[ref]: https://x.test/target" }]);
  expect(converted(blocks)).toEqual(normalized(blocks));

  const unknown = importMarkdownTokens([{ type: "widget", raw: "::widget::" }, { type: "paragraph", raw: "a ::b:: c", tokens: [{ type: "text", raw: "a ", text: "a " }, { type: "widget", raw: "::b::" }, { type: "text", raw: " c", text: " c" }] }]);
  expect(kinds(unknown.blocks)).toEqual(["code_block", "paragraph"]);
  expect(inorder(unknown.blocks)[0].c).toBe("::widget::");
  expect(inorder(unknown.blocks)[1].c).toBe("a ::b:: c");
  expect(unknown.unsupported).toEqual([{ type: "widget", text: "::widget::" }, { type: "widget", text: "::b::" }]);
});

test("ids are fresh, unique and ordered, one set per import", () => {
  const text = "| a | b |\n| - | - |\n| 1 | 2 |\n\n- one\n- two\n\n> quote\n";
  const first = convert(text).blocks;
  const second = convert(text).blocks;
  const ids = Object.keys(first);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.some((id) => Object.hasOwn(second, id))).toBe(false);
  const table = inorder(first).find((block) => block.t === "table");
  const tableIds = [...Object.keys(table.cols), ...Object.keys(table.rows)];
  expect(new Set(tableIds).size).toBe(tableIds.length);
  expect(tableIds.some((id) => ids.includes(id))).toBe(false);

  const positions = inorder(first).map((block) => block.pos);
  expect([...positions].sort()).toEqual(positions);
  expect(new Set(positions).size).toBe(positions.length);
  expect(kinds(first)).toEqual(["table", "list_item", "list_item", "quote"]);
});

test("nested ownership: list indent under its item, quotes flat and in order", () => {
  const { blocks } = convert("- first\n  - second\n    - third\n- back\n\n> outer\n> > inner\n\n- item with a quote\n\n  > quoted in a list\n");
  expect(inorder(blocks).map((block) => [block.t, block.indent ?? 0, block.c])).toEqual([
    ["list_item", 0, "first"],
    ["list_item", 1, "second"],
    ["list_item", 2, "third"],
    ["list_item", 0, "back"],
    ["quote", 0, "outer"],
    ["quote", 0, "inner"],
    ["list_item", 0, "item with a quote"],
    ["quote", 0, "quoted in a list"],
  ]);
  expect(converted(blocks)).toEqual(normalized(blocks));
});

test("the result opens through production conversion unchanged", () => {
  const { blocks } = importMarkdownTokens(markdown(CORPUS));
  const doc = docFromBlocks(schema, blocks);
  expect(doc.childCount).toBe(Object.keys(blocks).length);
  expect(doc.firstChild.attrs.id).toBe(orderedIds(blocks)[0]);
  expect(blockMap(doc)).toEqual(normalized(blocks));
  const links = [];
  const strong = [];
  doc.descendants((node) => {
    if (!node.isText) return;
    const link = schema.marks.link.isInSet(node.marks);
    if (link) links.push([node.text, link.attrs.href]);
    if (schema.marks.strong.isInSet(node.marks)) strong.push(node.text);
  });
  expect(links).toEqual([["link", "https://example.test/a?b=1"]]);
  expect(strong).toEqual(["strong", "a bold value"]);
  const table = [...Array(doc.childCount).keys()].map((i) => doc.child(i)).find((node) => node.type.name === "table");
  expect(table.attrs.cols[Object.keys(table.attrs.cols)[0]].name).toBe("Column one");
  expect(table.child(1).child(1).textContent).toBe("a bold value");
});

test("the byte, depth and block limits each refuse with a named reason", () => {
  const exact = new Marked().lexer("a".repeat(MAX_BYTES));
  expect(Object.keys(importMarkdownTokens(exact).blocks)).toHaveLength(1);
  expect(() => importMarkdownTokens(new Marked().lexer("a".repeat(MAX_BYTES + 1)))).toThrow(MarkdownImportError);
  try {
    importMarkdownTokens(new Marked().lexer("a".repeat(MAX_BYTES + 1)));
  } catch (error) {
    expect([error.name, error.code]).toEqual(["MarkdownImportError", "input-too-large"]);
    expect(error.message).toBe(`Markdown import is limited to ${MAX_BYTES} bytes; this file is ${MAX_BYTES + 1}.`);
  }

  const nested = (levels) => Array.from({ length: levels }, (_, i) => `${"  ".repeat(i)}- level ${i}`).join("\n");
  expect(inorder(importMarkdownTokens(markdown(nested(MAX_DEPTH))).blocks).map((block) => block.indent ?? 0)).toEqual(Array.from({ length: MAX_DEPTH }, (_, i) => i));
  expect(() => importMarkdownTokens(markdown(nested(MAX_DEPTH + 1)))).toThrow(expect.objectContaining({ code: "nesting-too-deep" }));

  const many = (count) => "a\n\n".repeat(count - 1) + "a";
  expect(Object.keys(importMarkdownTokens(markdown(many(MAX_BLOCKS))).blocks)).toHaveLength(MAX_BLOCKS);
  expect(() => importMarkdownTokens(markdown(many(MAX_BLOCKS + 1)))).toThrow(expect.objectContaining({ code: "too-many-blocks" }));
});

test("malformed input refuses with a named reason and nothing half-built", () => {
  for (const input of [null, undefined, "not tokens", {}, [null], [{ type: 42 }], [{ text: "no type" }]]) {
    expect(() => importMarkdownTokens(input)).toThrow(MarkdownImportError);
    try {
      importMarkdownTokens(input);
    } catch (error) {
      expect(error.code).toBe("malformed-input");
    }
  }
  expect(importMarkdownTokens([])).toEqual({ blocks: {}, unsupported: [], refused: [] });
  expect(importMarkdownTokens([{ type: "paragraph", raw: "", tokens: [] }]).blocks).toEqual({});
  expect(importMarkdownTokens([{ type: "space", raw: "\n\n" }]).blocks).toEqual({});
  expect(() => docFromBlocks(schema, importMarkdownTokens([{ type: "paragraph", raw: "x", tokens: [{ type: "text", text: "x" }] }]).blocks)).not.toThrow();
});
