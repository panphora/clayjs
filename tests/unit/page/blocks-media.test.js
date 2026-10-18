import { model } from "../../../src/vendor/prosemirror.vendor.js";
import * as B from "../../../src/page/blocks.js";
import { schema } from "../../../src/page/schema.js";
import { blockJson, nodeFromBlock } from "../../../src/page/model.js";

/**
 * Image and file blocks on the clipboard: the parser reads them from pasted
 * HTML, the serializer writes them back, and the schema's file node round-trips
 * through the live record.
 */

const parse = (html) => {
  const box = document.createElement("div");
  box.innerHTML = B.flattenPastedHTML(html, document);
  const out = [];
  B.clipboardParser.parseSlice(box).content.forEach((n) => { if (n.type.name !== "paragraph" || n.content.size) out.push(n); });
  return out;
};
const kinds = (nodes) => nodes.map((n) => `${n.type.name}:${n.textContent}`);

describe("pasted images", () => {
  test("a figure with an image and a caption becomes one image block, the caption not a second paragraph", () => {
    const nodes = parse('<figure data-id="x" data-width="320"><img src="https://a.io/p.png" alt="A plot"><figcaption>Fig 1</figcaption></figure>');
    expect(kinds(nodes)).toEqual(["image:"]);
    expect(nodes[0].attrs).toMatchObject({ src: "https://a.io/p.png", alt: "A plot", caption: "Fig 1", width: 320 });
  });

  test("a bare img becomes an image block", () => {
    const nodes = parse('<img src="/uploads/p.png" alt="pic">');
    expect(nodes.map((n) => n.type.name)).toEqual(["image"]);
    expect(nodes[0].attrs).toMatchObject({ src: "/uploads/p.png", alt: "pic", caption: "", width: null });
  });

  test("an image inside a paragraph of text keeps both", () => {
    const nodes = parse('<p>See <img src="https://a.io/p.png" alt="p"> here</p>');
    expect(nodes.map((n) => n.type.name)).toContain("image");
    expect(nodes.map((n) => n.textContent).join("|")).toContain("See");
    expect(nodes.map((n) => n.textContent).join("|")).toContain("here");
  });

  test("an image nested in a div keeps the image", () => {
    const nodes = parse('<div><div><img src="https://a.io/q.png" alt="q"></div></div>');
    expect(nodes.map((n) => n.type.name)).toEqual(["image"]);
    expect(nodes[0].attrs.src).toBe("https://a.io/q.png");
  });

  test("a small raster data: image is kept; svg, script and oversized sources are dropped", () => {
    expect(parse('<img src="data:image/png;base64,iVBORw0KGgo=">').map((n) => n.type.name)).toEqual(["image"]);
    expect(parse('<img src="data:image/svg+xml;base64,PHN2Zz4=">').map((n) => n.type.name)).not.toContain("image");
    expect(parse('<img src="javascript:alert(1)">').map((n) => n.type.name)).not.toContain("image");
    expect(parse(`<img src="data:image/png;base64,${"A".repeat(2_100_001)}">`).map((n) => n.type.name)).not.toContain("image");
  });

  test("a non-numeric or zero width becomes null", () => {
    expect(parse('<figure><img src="/p.png"></figure>')[0].attrs.width).toBeNull();
    expect(parse('<figure data-width="abc"><img src="/p.png"></figure>')[0].attrs.width).toBeNull();
  });
});

describe("pasted files", () => {
  test("a page-file div becomes a file block with its name, size and type", () => {
    const nodes = parse('<div class="page-file" data-type="file" data-src="/uploads/a.pdf" data-name="a.pdf" data-size="2048" data-mime="application/pdf"><a href="/uploads/a.pdf">a.pdf</a></div>');
    expect(nodes.map((n) => n.type.name)).toEqual(["file"]);
    expect(nodes[0].attrs).toMatchObject({ src: "/uploads/a.pdf", name: "a.pdf", size: 2048, mime: "application/pdf" });
  });

  test("a file with an unsafe address is dropped, with no leftover text block for the link", () => {
    const nodes = parse('<div class="page-file" data-type="file" data-src="javascript:alert(1)" data-name="x"><a href="javascript:alert(1)">x</a></div>');
    expect(nodes.map((n) => n.type.name)).not.toContain("file");
  });

  test("a plain link to a file stays a link in a paragraph", () => {
    const nodes = parse('<p><a href="https://a.io/a.pdf">a.pdf</a></p>');
    expect(nodes.map((n) => n.type.name)).toEqual(["paragraph"]);
  });
});

describe("copying", () => {
  const serialize = (...nodes) => {
    const box = document.createElement("div");
    box.appendChild(B.clipboardSerializer.serializeFragment(model.Fragment.from(nodes)));
    return box;
  };

  test("an image's width is written as data-width and read back", () => {
    const img = schema.nodes.image.create({ id: "i", pos: "V", src: "https://a.io/p.png", alt: "p", caption: "c", width: 320 });
    const box = serialize(img);
    expect(box.querySelector("figure").getAttribute("data-width")).toBe("320");
    const back = parse(box.innerHTML);
    expect(back[0].attrs).toMatchObject({ src: "https://a.io/p.png", caption: "c", width: 320 });
  });

  test("an image without a width writes no data-width", () => {
    const box = serialize(schema.nodes.image.create({ id: "i", pos: "V", src: "/p.png" }));
    expect(box.querySelector("figure").hasAttribute("data-width")).toBe(false);
  });

  test("a file block is copied with its name, size and type, and pastes back as the same file", () => {
    const file = schema.nodes.file.create({ id: "f", pos: "V", src: "/uploads/a.pdf", name: "a.pdf", size: 2048, mime: "application/pdf" });
    const back = parse(serialize(file).innerHTML);
    expect(back[0].type.name).toBe("file");
    expect(back[0].attrs).toMatchObject({ src: "/uploads/a.pdf", name: "a.pdf", size: 2048, mime: "application/pdf" });
  });
});

describe("the file node in the record", () => {
  test("blockJson and nodeFromBlock round-trip name, size and mime, and write no defaults", () => {
    const node = schema.nodes.file.create({ id: "f", pos: "V", parent: "t", src: "/uploads/a.pdf", name: "a.pdf", size: 2048, mime: "application/pdf" });
    const json = blockJson(node);
    expect(json).toEqual({ t: "file", pos: "V", parent: "t", src: "/uploads/a.pdf", name: "a.pdf", size: 2048, mime: "application/pdf" });
    const back = nodeFromBlock(schema, "f", json);
    expect(back.type.name).toBe("file");
    expect(back.attrs).toMatchObject({ id: "f", pos: "V", parent: "t", src: "/uploads/a.pdf", name: "a.pdf", size: 2048, mime: "application/pdf" });
  });

  test("a file with only a source and a name writes just those", () => {
    const json = blockJson(schema.nodes.file.create({ id: "f", pos: "V", src: "/u/x", name: "x" }));
    expect(json).toEqual({ t: "file", pos: "V", src: "/u/x", name: "x" });
  });
});
