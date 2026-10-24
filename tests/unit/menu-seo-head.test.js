import { applyHead, FIELDS, readHead } from "../../src/plugins/menu/seo-head.js";

const parse = (head = "", lang = "en") =>
  new DOMParser().parseFromString(
    `<!DOCTYPE html><html lang="${lang}"><head>${head}</head><body><p>body</p></body></html>`,
    "text/html",
  );

const nodeSignature = (node) => (node.nodeType === 8 ? `<!--${node.data}-->` : node.outerHTML);

const headSignatures = (doc, skip) =>
  Array.from(doc.head.childNodes)
    .map(nodeSignature)
    .filter((signature) => !skip || !skip(signature));

const VALUES = {
  title: "A page title",
  description: "What this page is about.",
  lang: "fr-CA",
  canonical: "https://example.com/articles/one",
  index: false,
  follow: false,
  ogTitle: "Preview title",
  ogDescription: "Preview description",
  ogImage: "https://cdn.example.com/shot.png",
  ogImageAlt: "A screenshot of the page",
  siteName: "Example Site",
  twitterSite: "@example",
};

describe("FIELDS", () => {
  test("one entry per owned field, each with read and write", () => {
    expect(Object.keys(FIELDS)).toEqual([
      "title",
      "description",
      "lang",
      "canonical",
      "index",
      "follow",
      "ogTitle",
      "ogDescription",
      "ogImage",
      "ogImageAlt",
      "siteName",
      "twitterSite",
    ]);
    for (const field of Object.values(FIELDS)) {
      expect(typeof field.read).toBe("function");
      expect(typeof field.write).toBe("function");
    }
  });
});

describe("round trips", () => {
  for (const [key, value] of Object.entries(VALUES)) {
    test(`${key} writes and reads back the same value`, () => {
      const doc = parse();
      const result = applyHead(doc, { [key]: value });
      expect(result.errors).toEqual({});
      expect(readHead(doc).values[key]).toBe(value);
    });
  }

  test("a written value is still there after an unrelated change", () => {
    const doc = parse();
    applyHead(doc, { title: "Kept", description: "Also kept" });
    applyHead(doc, { ogTitle: "Preview" });
    const { values } = readHead(doc);
    expect(values.title).toBe("Kept");
    expect(values.description).toBe("Also kept");
  });
});

describe("clearing", () => {
  for (const key of Object.keys(VALUES)) {
    test(`${key} clears its element`, () => {
      const doc = parse(`<meta name="description" content="d"><meta property="og:title" content="t">`);
      const robots = key === "index" || key === "follow";
      applyHead(doc, { [key]: robots ? false : VALUES[key] });
      expect(readHead(doc).values[key]).toBe(robots ? false : VALUES[key]);
      const cleared = applyHead(doc, { [key]: robots ? true : "" });
      expect(cleared.errors).toEqual({});
      const { values, present } = readHead(doc);
      if (robots) {
        expect(values[key]).toBe(true);
        expect(doc.head.querySelector('meta[name="robots"]')).toBeNull();
        return;
      }
      expect(present[key]).toBe(false);
      expect(values[key]).toBe("");
    });
  }

  test("a cleared robots tag takes only its own directives with it", () => {
    const doc = parse(`<meta name="robots" content="max-snippet:50">`);
    applyHead(doc, { index: false });
    expect(doc.head.querySelector('meta[name="robots"]').getAttribute("content")).toBe(
      "noindex, max-snippet:50",
    );
    applyHead(doc, { index: true });
    expect(doc.head.querySelector('meta[name="robots"]').getAttribute("content")).toBe("max-snippet:50");
  });

  test("clearing every robots directive removes the tag", () => {
    const doc = parse();
    applyHead(doc, { index: false, follow: false });
    expect(doc.head.querySelector('meta[name="robots"]').getAttribute("content")).toBe("noindex, nofollow");
    applyHead(doc, { index: true, follow: true });
    expect(doc.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});

describe("position", () => {
  test("an existing description keeps its place in the head", () => {
    const doc = parse(
      `<meta charset="utf-8"><meta name="description" content="Old"><script type="application/ld+json">{"a":1}</script>`,
    );
    const before = Array.from(doc.head.children).indexOf(doc.head.querySelector('meta[name="description"]'));
    applyHead(doc, { description: "New" });
    const after = Array.from(doc.head.children).indexOf(doc.head.querySelector('meta[name="description"]'));
    expect(after).toBe(before);
    expect(doc.head.children[before].getAttribute("content")).toBe("New");
    expect(doc.head.children.length).toBe(3);
  });

  test("a missing element is created at the end of the head", () => {
    const doc = parse(`<meta charset="utf-8">`);
    applyHead(doc, { description: "Fresh" });
    expect(doc.head.children.length).toBe(2);
    expect(doc.head.lastElementChild.getAttribute("name")).toBe("description");
  });
});

describe("duplicates", () => {
  test("duplicates of an owned key collapse and are reported", () => {
    const doc = parse(
      `<meta name="description" content="One"><meta name="description" content="Two"><title>t</title>`,
    );
    const result = applyHead(doc, { description: "Only" });
    expect(result.normalized).toEqual(["description"]);
    expect(doc.head.querySelectorAll('meta[name="description"]').length).toBe(1);
    expect(readHead(doc).values.description).toBe("Only");
  });

  test("duplicate robots tags collapse once and report one key", () => {
    const doc = parse(`<meta name="robots" content="noindex"><meta name="robots" content="nofollow">`);
    const result = applyHead(doc, { index: true, follow: true });
    expect(result.normalized).toEqual(["index"]);
    expect(doc.head.querySelectorAll('meta[name="robots"]').length).toBe(0);
  });

  test("untouched keys are not normalized", () => {
    const doc = parse(`<meta property="og:image" content="a.png"><meta property="og:image" content="b.png">`);
    const result = applyHead(doc, { title: "Only the title" });
    expect(result.normalized).toEqual([]);
    expect(doc.head.querySelectorAll('meta[property="og:image"]').length).toBe(2);
  });
});

describe("tags the sheet does not own", () => {
  const UNRELATED = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script><meta property="article:published_time" content="2026-10-24T09:00:00Z"><!-- keep me exactly --><meta name="viewport" content="width=device-width">`;

  test("unknown and structured data tags survive a title change byte for byte", () => {
    const doc = parse(UNRELATED);
    const before = headSignatures(doc);
    applyHead(doc, { title: "New title" });
    const after = headSignatures(doc, (signature) => signature.startsWith("<title"));
    expect(after).toEqual(before);
  });

  test("an unrelated head serializes the same before and after a description change", () => {
    const doc = parse(`${UNRELATED}<meta name="description" content="Old description">`);
    const before = doc.head.innerHTML;
    applyHead(doc, { description: "New description" });
    expect(doc.head.innerHTML).toBe(before.replace('content="Old description"', 'content="New description"'));
  });

  test("extra og:image tags are untouched when a different preview field changes", () => {
    const doc = parse(
      `<meta property="og:image" content="https://example.com/one.png"><meta property="og:image" content="https://example.com/two.png">`,
    );
    applyHead(doc, { ogTitle: "Preview" });
    const images = Array.from(doc.head.querySelectorAll('meta[property="og:image"]')).map((meta) =>
      meta.getAttribute("content"),
    );
    expect(images).toEqual(["https://example.com/one.png", "https://example.com/two.png"]);
  });
});

describe("automatic writes", () => {
  test("og:url follows the canonical", () => {
    const doc = parse();
    applyHead(doc, { canonical: "https://example.com/articles/one" });
    expect(doc.head.querySelector('meta[property="og:url"]').getAttribute("content")).toBe(
      "https://example.com/articles/one",
    );
    expect(doc.head.querySelector('meta[property="og:type"]').getAttribute("content")).toBe("website");
  });

  test("og:url falls back to the page URL without query and hash", () => {
    const doc = parse();
    Object.defineProperty(doc, "URL", { value: "https://example.com/blog/post?ref=1#top" });
    applyHead(doc, { ogTitle: "Preview" });
    expect(doc.head.querySelector('meta[property="og:url"]').getAttribute("content")).toBe(
      "https://example.com/blog/post",
    );
  });

  test("og:url moves with the canonical when the canonical changes", () => {
    const doc = parse();
    applyHead(doc, { canonical: "https://example.com/one" });
    applyHead(doc, { canonical: "https://example.com/two" });
    expect(doc.head.querySelector('meta[property="og:url"]').getAttribute("content")).toBe(
      "https://example.com/two",
    );
    expect(doc.head.querySelectorAll('meta[property="og:url"]').length).toBe(1);
  });

  test("an existing og:type is kept", () => {
    const doc = parse(`<meta property="og:type" content="article">`);
    applyHead(doc, { ogTitle: "Preview" });
    expect(doc.head.querySelectorAll('meta[property="og:type"]').length).toBe(1);
    expect(doc.head.querySelector('meta[property="og:type"]').getAttribute("content")).toBe("article");
  });

  test("the card size follows the image", () => {
    const doc = parse();
    applyHead(doc, { ogTitle: "Preview" });
    expect(doc.head.querySelector('meta[name="twitter:card"]').getAttribute("content")).toBe("summary");
    applyHead(doc, { ogImage: "https://cdn.example.com/shot.png" });
    expect(doc.head.querySelector('meta[name="twitter:card"]').getAttribute("content")).toBe(
      "summary_large_image",
    );
    applyHead(doc, { ogImage: "" });
    expect(doc.head.querySelector('meta[name="twitter:card"]').getAttribute("content")).toBe("summary");
  });

  test("nothing automatic happens for a field outside the preview", () => {
    const doc = parse();
    applyHead(doc, { title: "Title only" });
    expect(doc.head.querySelector('meta[property="og:url"]')).toBeNull();
    expect(doc.head.querySelector('meta[property="og:type"]')).toBeNull();
    expect(doc.head.querySelector('meta[name="twitter:card"]')).toBeNull();
  });
});

describe("URL rules", () => {
  test("javascript: canonical is refused and nothing is written", () => {
    const doc = parse(`<meta charset="utf-8">`);
    const before = doc.head.innerHTML;
    const result = applyHead(doc, { title: "Typed", canonical: "javascript:alert(1)" });
    expect(result.errors.canonical).toBeTruthy();
    expect(doc.head.innerHTML).toBe(before);
  });

  test("localhost and 127.0.0.1 canonicals are refused", () => {
    for (const canonical of ["http://localhost:3000/page", "http://127.0.0.1/page", "http://app.localhost/x"]) {
      const doc = parse();
      const result = applyHead(doc, { canonical });
      expect(result.errors.canonical).toBeTruthy();
      expect(readHead(doc).present.canonical).toBe(false);
    }
  });

  test("a relative canonical is refused", () => {
    const doc = parse();
    expect(applyHead(doc, { canonical: "/page" }).errors.canonical).toBeTruthy();
  });

  test("a javascript: image is refused", () => {
    const doc = parse();
    const result = applyHead(doc, { ogImage: "javascript:alert(1)" });
    expect(result.errors.ogImage).toBeTruthy();
    expect(readHead(doc).present.ogImage).toBe(false);
  });

  test("a relative image path is saved as typed", () => {
    const doc = parse();
    applyHead(doc, { canonical: "https://example.com/articles/one", ogImage: "/uploads/shot.png" });
    expect(readHead(doc).values.ogImage).toBe("/uploads/shot.png");
    expect(doc.head.querySelector('meta[property="og:image"]').getAttribute("content")).toBe(
      "/uploads/shot.png",
    );
  });

  test("neither og:url nor og:image is written for a localhost page", () => {
    const doc = parse();
    Object.defineProperty(doc, "URL", { value: "http://localhost:8080/page" });
    applyHead(doc, { ogTitle: "Preview" });
    expect(doc.head.querySelector('meta[property="og:url"]')).toBeNull();
  });
});

describe("text", () => {
  test("text with <, & and quotes is stored as text", () => {
    const doc = parse();
    const title = `Tom & "Jerry" <b>bold</b> 'single'`;
    applyHead(doc, { title, description: title, ogTitle: title });
    const { values } = readHead(doc);
    expect(values.title).toBe(title);
    expect(values.description).toBe(title);
    expect(values.ogTitle).toBe(title);
    expect(doc.head.querySelector("b")).toBeNull();
    expect(doc.head.querySelector("title").children.length).toBe(0);
    expect(doc.head.innerHTML).toContain("&amp;");
  });
});

describe("readHead", () => {
  test("absent differs from empty", () => {
    const empty = parse();
    const blank = parse(`<meta name="description" content=""><meta name="robots" content="">`);
    expect(readHead(empty).present.description).toBe(false);
    expect(readHead(empty).values.description).toBe("");
    expect(readHead(blank).present.description).toBe(true);
    expect(readHead(blank).values.description).toBe("");
    expect(readHead(blank).present.index).toBe(true);
  });

  test("defaults: shown in search, followed, and no other values", () => {
    const { values, present } = readHead(parse());
    expect(values.index).toBe(true);
    expect(values.follow).toBe(true);
    expect(values.title).toBe("");
    expect(values.lang).toBe("en");
    expect(present.lang).toBe(true);
    expect(present.canonical).toBe(false);
  });

  test("robots directives it does not own do not count as hiding the page", () => {
    const doc = parse(`<meta name="robots" content="max-snippet:50, nofollow">`);
    const { values } = readHead(doc);
    expect(values.index).toBe(true);
    expect(values.follow).toBe(false);
  });

  test("reads a document with no head children without throwing", () => {
    const doc = parse();
    expect(() => readHead(doc)).not.toThrow();
    expect(() => applyHead(doc, {})).not.toThrow();
  });
});

describe("applyHead", () => {
  test("an empty change set writes nothing", () => {
    const doc = parse(`<meta name="description" content="Kept">`);
    const before = doc.head.innerHTML;
    expect(applyHead(doc, {})).toEqual({ normalized: [], errors: {} });
    expect(doc.head.innerHTML).toBe(before);
  });

  test("unknown keys are ignored", () => {
    const doc = parse();
    const before = doc.head.innerHTML;
    expect(applyHead(doc, { keywords: "a", twitterTitle: "b" })).toEqual({ normalized: [], errors: {} });
    expect(doc.head.innerHTML).toBe(before);
  });

  test("a canonical and an image in one call both land with one og:url", () => {
    const doc = parse();
    const result = applyHead(doc, {
      canonical: "https://example.com/page",
      ogImage: "https://cdn.example.com/x.png",
    });
    expect(result).toEqual({ normalized: [], errors: {} });
    expect(doc.head.querySelectorAll('meta[property="og:url"]').length).toBe(1);
    expect(doc.head.querySelector('meta[property="og:url"]').getAttribute("content")).toBe(
      "https://example.com/page",
    );
    expect(doc.head.querySelector('meta[name="twitter:card"]').getAttribute("content")).toBe(
      "summary_large_image",
    );
  });
});
