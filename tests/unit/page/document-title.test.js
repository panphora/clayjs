import { documentTitle, UNTITLED } from "../../../src/page/document-title.js";
import { customTitle, titleFor, titleText, writeTitle } from "../../../src/page/document-title-dom.js";

const heading = (c, attrs = {}) => ({ id: "h", t: "heading", level: 1, c, ...attrs });
const paragraph = (c) => ({ id: "p", t: "paragraph", c });

const meta = (content) => `<meta name="clay-seo-title-mode" content="${content}">`;

const docWith = (head, title = "") => {
  const parsed = new DOMParser().parseFromString(
    `<!doctype html><html><head>${head}${title ? `<title>${title}</title>` : ""}</head><body></body></html>`,
    "text/html",
  );
  return parsed;
};

afterEach(() => { document.head.innerHTML = ""; });

describe("the pure title rule", () => {
  test("a document with no H1 is Untitled", () => {
    expect(documentTitle([paragraph("Hand written")])).toBe(UNTITLED);
    expect(documentTitle([])).toBe(UNTITLED);
  });

  test("the first root H1 wins even when it is empty", () => {
    expect(documentTitle([heading(""), heading("A later title")])).toBe(UNTITLED);
  });

  test("a nested H1 is not a title", () => {
    expect(documentTitle([paragraph("Alpha"), heading("Inside a toggle", { parent: "t" }), heading("Root")])).toBe("Root");
  });

  test("an H2 is not a title", () => {
    expect(documentTitle([{ id: "h2", t: "heading", level: 2, c: "Second" }, heading("Root")])).toBe("Root");
  });

  test("marks contribute no markup", () => {
    expect(documentTitle([heading("Bold words")])).toBe("Bold words");
    expect(documentTitle([{ ...heading("Bold words"), m: [[4, "b"]] }])).toBe("Bold words");
  });

  test("hard breaks and whitespace runs normalize to one space", () => {
    expect(documentTitle([heading("One\uFFFCtwo")])).toBe("One two");
    expect(documentTitle([heading("One\n\ntwo")])).toBe("One two");
    expect(documentTitle([heading("  padded  ")])).toBe("padded");
    expect(documentTitle([heading("\uFFFC")])).toBe(UNTITLED);
  });

  test("ordinary Unicode is kept exactly, including non-BMP characters", () => {
    const text = "Café — 日本語 🎉 «ok»";
    expect(documentTitle([heading(text)])).toBe(text);
  });

  test("a non-breaking space is whitespace, like any other", () => {
    expect(documentTitle([heading("Two\u00a0words")])).toBe("Two words");
  });

  test("moving the title heading changes which H1 is the title", () => {
    const second = heading("Second", { id: "h2" });
    expect(documentTitle([heading("First"), second])).toBe("First");
    expect(documentTitle([second, heading("First")])).toBe("Second");
  });

  test("deleting the title heading falls back to Untitled", () => {
    expect(documentTitle([paragraph("Only a paragraph now")])).toBe(UNTITLED);
  });

  test("custom keeps the exact current title, including an empty one", () => {
    expect(documentTitle([heading("Ignored")], { custom: true, currentTitle: "  Kept  " })).toBe("  Kept  ");
    expect(documentTitle([heading("Ignored")], { custom: true, currentTitle: "" })).toBe("");
    expect(documentTitle([heading("Ignored")], { custom: true })).toBe("");
  });

  test("currentTitle is only consulted in custom mode", () => {
    expect(documentTitle([heading("Derived")], { currentTitle: "Old title" })).toBe("Derived");
  });
});

describe("the DOM adapter that decides custom ownership", () => {
  test("no marker is derived mode", () => {
    expect(customTitle(docWith(""))).toBe(false);
  });

  test("a custom marker opts out, whatever its case and spacing", () => {
    expect(customTitle(docWith('<meta name="clay-seo-title-mode" content=" Custom ">'))).toBe(true);
  });

  test("a non-custom marker does not opt out", () => {
    expect(customTitle(docWith(meta("derived")))).toBe(false);
    expect(customTitle(docWith(meta("")))).toBe(false);
  });

  test("a duplicate earlier non-custom marker does not cancel a later custom one", () => {
    expect(customTitle(docWith(meta("derived") + meta("custom")))).toBe(true);
  });

  test("titleFor reads the current title from the same tree", () => {
    expect(titleFor(docWith("", "Old title"), [heading("New title")])).toEqual({ custom: false, title: "New title" });
    expect(titleFor(docWith(meta("custom"), "Old title"), [heading("New title")])).toEqual({ custom: true, title: "Old title" });
    expect(titleFor(docWith(meta("custom"), ""), [heading("New title")])).toEqual({ custom: true, title: "" });
  });

  test("writeTitle replaces the one title and leaves the rest of the head alone", () => {
    const doc = docWith(meta("derived"), "Old title");
    doc.head.appendChild(doc.createElement("meta")).setAttribute("name", "description");

    expect(writeTitle(doc, "New title")).toBe(true);
    expect(doc.querySelectorAll("title")).toHaveLength(1);
    expect(titleText(doc)).toBe("New title");
    expect(doc.querySelector('meta[name="clay-seo-title-mode"]')).not.toBeNull();
    expect(doc.querySelector('meta[name="description"]')).not.toBeNull();
    expect(writeTitle(doc, "New title")).toBe(false);
  });

  test("writeTitle inserts a title into a head that has none", () => {
    const doc = docWith(meta("derived"));
    expect(writeTitle(doc, "Fresh")).toBe(true);
    expect(doc.head.firstChild.tagName).toBe("TITLE");
    expect(titleText(doc)).toBe("Fresh");
  });

  test("writeTitle works on a captured document element as well as a document", () => {
    const root = docWith("", "Old title").documentElement;
    expect(writeTitle(root, "Snapshotted")).toBe(true);
    expect(titleText(root)).toBe("Snapshotted");
  });
});
