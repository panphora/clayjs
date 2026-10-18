import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "../../../src/page/blocks.js";
import { selectBlocks } from "../../../src/page/blocksel.js";
import { renderBlocks } from "../../../src/page/projection.js";
import { editor } from "./view-helpers.js";
import { make, caret, at, short } from "./blocks-helpers.js";

const here = fileURLToPath(new URL(".", import.meta.url));

describe("plain text", () => {
  const lines = (sl) => { const r = []; sl.content.forEach((n) => r.push(`${n.attrs.kind ?? n.type.name}:${n.attrs.indent ?? ""}:${n.attrs.checked ?? ""}:${n.textContent}`)); return r; };

  test("markdown, 2-space", () => {
    expect(lines(B.parseListText("- a\n  - b\n    - c\n- d"))).toEqual(["bullet:0:false:a", "bullet:1:false:b", "bullet:2:false:c", "bullet:0:false:d"]);
  });

  test("markdown, 4-space and numbers and tasks", () => {
    expect(lines(B.parseListText("1. one\n    - [x] done\n    - [ ] todo\n2. two"))).toEqual(["ordered:0:false:one", "check:1:true:done", "check:1:false:todo", "ordered:0:false:two"]);
  });

  test("markdown, tabs, over-indented first line", () => {
    expect(lines(B.parseListText("\t\t- deep\n\t\t\t- deeper\n- top"))).toEqual(["bullet:0:false:deep", "bullet:1:false:deeper", "bullet:0:false:top"]);
  });

  test("text without list lines falls through", () => {
    expect(B.parseListText("just text\nmore") === null).toBe(true);
  });
});

describe("HTML", () => {
  const parse = (file) => {
    const html = B.flattenPastedHTML(readFileSync(join(here, "fixtures/paste", file), "utf8"), document);
    const box = document.createElement("div");
    box.innerHTML = html;
    const slice = B.clipboardParser.parseSlice(box);
    const r = [];
    slice.content.forEach((n) => r.push(`${n.type.name === "list_item" ? n.attrs.kind : n.type.name}:${n.attrs.indent ?? ""}:${n.attrs.checked ?? ""}:${n.attrs.parent ? "<" + n.attrs.parent : ""}:${n.textContent}`));
    return { r, slice };
  };

  test("Google Docs nested list (aria-level, child <ul> inside parent <ul>)", () => {
    const g = parse("gdocs-nested.html");
    expect(g.r).toEqual([
      "bullet:0:false::Alpha", "bullet:1:false::Beta", "bullet:2:false::Gamma", "bullet:1:false::Delta", "bullet:0:false::Epsilon",
      "ordered:0:false::First", "ordered:1:false::First a", "ordered:0:false::Second",
      "check:0:true::Done", "check:0:false::Open",
    ]);
  });

  test("Docs' wrapper <b style=font-weight:normal> is not bold; a 700 span is", () => {
    const g = parse("gdocs-nested.html");
    let bold = false;
    g.slice.content.forEach((n) => n.forEach((t) => { if (t.marks.some((m) => m.type.name === "strong")) bold = t.text; }));
    expect(bold).toBe("Beta");
  });

  test("Notion nested list and toggle", () => {
    expect(parse("notion-nested.html").r).toEqual([
      "bullet:0:false::One", "bullet:1:false::Two", "bullet:2:false::Three", "ordered:0:false::Num",
      "check:0:true::Task done", "toggle::::Toggle title", "paragraph:::<paste-1:Inside", "bullet:0:false:<paste-1:Inside bullet", "bullet:1:false:<paste-1:Inside nested",
    ]);
  });

  test("GitHub / markdown-rendered nested list with task list", () => {
    expect(parse("markdown-rendered.html").r).toEqual([
      "bullet:0:false::a", "bullet:1:false::b", "ordered:2:false::c", "check:0:true::done", "check:0:false::todo",
    ]);
  });

  test("standard <li> with nested <ul> inside the <li> and a second paragraph", () => {
    expect(parse("multi-paragraph-li.html").r).toEqual([
      "bullet:0:false::Line oneLine two", "bullet:1:false::Child",
    ]);
  });

  test("every fixture yields blocks (no vacuous pass)", () => {
    for (const f of ["gdocs-nested.html", "notion-nested.html", "markdown-rendered.html", "multi-paragraph-li.html"]) {
      expect(parse(f).r.length).toBeGreaterThan(0);
    }
  });

  test("pasted blocks get fresh ids and the toggle's body follows its new id", () => {
    const { slice } = parse("notion-nested.html");
    const s = caret(make([["p", "paragraph", "P"]]), "p");
    const out = B.remapPasted(slice, s);
    const rows = []; out.content.forEach((n) => rows.push([n.type.name, n.attrs.id, n.attrs.parent, n.attrs.pos]));
    const toggle = rows.find((r) => r[0] === "toggle");
    expect(toggle[1]).toBeTruthy();
    expect(toggle[1]).not.toBe("paste-1");
    for (const r of rows) {
      expect(r[3]).toBeNull();
      if (r[0] !== "toggle") expect(r[1]).toBeNull();
    }
    expect(rows.filter((r) => r[2] === toggle[1]).length).toBe(3);
  });

  test("list items pasted into a nested item shift by its indent", () => {
    const slice = B.parseListText("- a\n  - b");
    const s = caret(make([["x", "list_item", "X"], ["y", "list_item", "Y", { indent: 1 }]]), "y");
    const out = B.remapPasted(slice, s);
    const ind = []; out.content.forEach((n) => ind.push(n.attrs.indent));
    expect(ind).toEqual([1, 2]);
  });
});

describe("pasting into a paragraph", () => {
  const parse = (file) => {
    const html = B.flattenPastedHTML(readFileSync(join(here, "fixtures/paste", file), "utf8"), document);
    const box = document.createElement("div");
    box.innerHTML = html;
    const slice = B.clipboardParser.parseSlice(box);
    const r = [];
    slice.content.forEach((n) => r.push(`${n.type.name === "list_item" ? n.attrs.kind : n.type.name}:${n.attrs.indent ?? ""}:${n.attrs.checked ?? ""}:${n.attrs.parent ? "<" + n.attrs.parent : ""}:${n.textContent}`));
    return { r, slice };
  };

  const paste = (s, slice) => s.apply(s.tr.replaceSelection(B.remapPasted(slice, s)));

  test("a nested list pasted into an empty paragraph keeps every level", () => {
    const s = caret(make([["p", "paragraph", ""], ["q", "paragraph", "after"]]), "p");
    expect(short(paste(s, B.parseListText("- a\n  - b\n- c")))).toBe("a@0 | b@1 | c@0 | after");
  });

  test("a list pasted mid-paragraph splits it around the items", () => {
    const s = caret(make([["p", "paragraph", "Intro"]]), "p", 2);
    expect(short(paste(s, B.parseListText("- a\n  - b")))).toBe("In | a@0 | b@1 | tro");
  });

  test("the Docs fixture pasted into an empty paragraph keeps Beta nested", () => {
    const s = caret(make([["p", "paragraph", ""]]), "p");
    const out = paste(s, parse("gdocs-nested.html").slice);
    expect(short(out).split(" | ").slice(0, 5)).toEqual(["Alpha@0", "Beta@1", "Gamma@2", "Delta@1", "Epsilon@0"]);
  });

  test("partial item text copied in the editor still merges into a list item", () => {
    const src = make([["a", "list_item", "Alpha"], ["b", "list_item", "Beta"]]);
    const part = src.doc.slice(at(src, "a", 2), at(src, "b", 2));
    const s = caret(make([["x", "list_item", "Xy"]]), "x", 1);
    expect(short(paste(s, part))).toBe("Xpha@0 | Bey@0");
  });
});

describe("pasted links", () => {
  const links = (html) => {
    const box = document.createElement("div");
    box.innerHTML = html;
    const out = [];
    B.clipboardParser.parseSlice(box).content.descendants((n) => {
      if (n.isText) out.push([n.text, n.marks.find((m) => m.type.name === "link")?.attrs.href ?? null]);
    });
    return out;
  };

  test("script, data and file addresses lose the link but keep the text", () => {
    expect(links('<p><a href="javascript:alert(1)">a</a> <a href=" JaVaScRiPt:x">b</a> <a href="data:text/html,x">c</a> <a href="vbscript:x">d</a> <a href="file:///etc">e</a></p>')
      .filter(([, h]) => h !== null)).toEqual([]);
    expect(links('<p><a href="javascript:alert(1)">a</a></p>')).toEqual([["a", null]]);
  });

  test("http, mailto, fragments and paths are kept", () => {
    expect(links('<p><a href="https://x.com/a">a</a><a href="mailto:m@x.com">b</a><a href="#top">c</a><a href="/p">d</a></p>'))
      .toEqual([["a", "https://x.com/a"], ["b", "mailto:m@x.com"], ["c", "#top"], ["d", "/p"]]);
  });
});

describe("F8 media and block selection paste", () => {
  const parse = (html) => {
    const box = document.createElement("div");
    box.innerHTML = B.flattenPastedHTML(html);
    return B.clipboardParser.parse(box);
  };

  test("inline media and trailing marked text stay in their pasted toggle", () => {
    const view = editor([["p", "paragraph", ""]]);
    try {
      view.pasteHTML('<details open><summary>T</summary><p><strong>before <img src="https://example.test/a.png"> after</strong></p></details>', new Event("paste"));
      const nodes = [];
      view.state.doc.forEach((n) => nodes.push(n));
      const toggle = nodes.find((n) => n.type.name === "toggle");
      expect(nodes.map((n) => n.type.name)).toEqual(["toggle", "paragraph", "image", "paragraph"]);
      expect(nodes.slice(1).map((n) => n.attrs.parent)).toEqual([toggle.attrs.id, toggle.attrs.id, toggle.attrs.id]);
      expect(nodes[3].firstChild.marks.map((m) => m.type.name)).toEqual(["strong"]);
    } finally { view.destroy(); }
  });

  test("pasting over the last selected toggle child preserves the owner", () => {
    const view = editor([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "B1", { parent: "t" }], ["b2", "paragraph", "B2", { parent: "t" }], ["z", "paragraph", "Z"]]);
    try {
      view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 2)));
      view.pasteHTML("<p>X</p>", new Event("paste"));
      expect(view.state.doc.child(2).textContent).toBe("X");
      expect(view.state.doc.child(2).attrs.parent).toBe("t");
      expect(view.state.doc.child(3).attrs.id).toBe("z");
    } finally { view.destroy(); }
  });

  test("saved image and file projections round-trip with metadata", () => {
    const { html } = renderBlocks({
      i: { t: "image", pos: "B", src: "/photo.png", alt: "Photo", caption: "Caption", width: 320 },
      f: { t: "file", pos: "C", src: "/empty.txt", name: "empty.txt", size: 0, mime: "text/plain" },
    });
    const doc = parse(html);
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).type.name).toBe("image");
    expect(doc.child(0).attrs).toMatchObject({ src: "/photo.png", alt: "Photo", caption: "Caption", width: 320 });
    expect(doc.child(1).type.name).toBe("file");
    expect(doc.child(1).attrs).toMatchObject({ src: "/empty.txt", name: "empty.txt", size: 0, mime: "text/plain" });
  });

  test("a zero-byte clipboard file keeps its known size", () => {
    expect(parse('<div class="page-file" data-src="/empty" data-size="0"></div>').firstChild.attrs.size).toBe(0);
  });

  test.each(["-5.5", "12.7", "Infinity"])("invalid image width %s becomes automatic", (width) => {
    expect(parse(`<figure data-width="${width}"><img src="/photo.png"></figure>`).firstChild.attrs.width).toBeNull();
  });

  test("control: splitting a list wrapper keeps the inline image", () => {
    const doc = parse('<ul><li>before <img src="/photo.png"> after</li></ul>');
    expect(doc.childCount).toBe(3);
    expect(doc.child(1).type.name).toBe("image");
    expect(doc.textContent).toContain("after");
  });
});
