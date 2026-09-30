import { jest } from "@jest/globals";
import { ROOTS as QUICKCROP_ROOTS } from "../../src/ui/skins/quickcrop.js";
import { ROOTS as RICHCLAY_ROOTS } from "../../src/ui/skins/richclay.js";

/**
 * The vendors write some styles inline: quickcrop its crop geometry, richclay its
 * floating toolbar's placement. A plain inline style loses to a page's `!important`
 * rule, and a skin cannot declare those properties without freezing the vendor's own
 * values, so the vendors write them `!important` themselves. These tests drive the
 * vendored bundles, not a mock.
 */

const important = (el, prop) => [prop, el.style.getPropertyValue(prop) !== "", el.style.getPropertyPriority(prop)];

// Every inline declaration on the vendor's chrome, wherever it came from (a style
// property, setProperty, setAttribute("style"), a style object), must be !important:
// a plain one loses to any page rule marked !important.
function plainInline(roots, scope = document) {
  const plain = [];
  const within = [...(scope.matches?.(roots.join(",")) ? [scope] : []), ...scope.querySelectorAll(roots.join(","))];
  for (const root of within) {
    for (const el of [root, ...root.querySelectorAll("*")]) {
      for (let i = 0; i < el.style.length; i++) {
        const prop = el.style[i];
        if (el.style.getPropertyPriority(prop) !== "important") plain.push(`${el.getAttribute("class") || el.tagName.toLowerCase()} ${prop}`);
      }
    }
  }
  return plain;
}

describe("the vendored quickcrop", () => {
  const images = [];
  let realImage;

  beforeAll(() => {
    realImage = globalThis.Image;
    globalThis.Image = function Image() {
      const img = document.createElement("img");
      Object.defineProperty(img, "naturalWidth", { value: 1600 });
      Object.defineProperty(img, "naturalHeight", { value: 900 });
      images.push(img);
      return img;
    };
    URL.createObjectURL = jest.fn(() => "blob:quickcrop-test");
    URL.revokeObjectURL = jest.fn();
  });

  afterAll(() => {
    globalThis.Image = realImage;
  });

  test("writes the image size, the crop box and the dimming clip !important", async () => {
    const { default: quickcrop } = await import("../../src/vendor/quickcrop.vendor.js");
    let host = null;
    const adapter = {
      fit: () => ({ width: 800, height: 600 }),
      open(opts) { host = opts; return { close() {} }; },
    };
    const result = quickcrop(new Blob(["x"], { type: "image/png" }), { modal: adapter, aspect: 1 });
    images.at(-1).onload();
    const stage = host.content;
    const img = stage.querySelector("img");
    const box = stage.querySelector(".qc-box");
    const dim = stage.querySelector(".qc-dim");
    expect(["width", "height"].map((p) => important(img, p))).toEqual([
      ["width", true, "important"], ["height", true, "important"],
    ]);
    expect(img.style.getPropertyValue("width")).toBe("800px");
    expect(img.style.getPropertyValue("height")).toBe("450px");
    expect(["left", "top", "width", "height"].map((p) => important(box, p))).toEqual([
      ["left", true, "important"], ["top", true, "important"], ["width", true, "important"], ["height", true, "important"],
    ]);
    expect(box.style.getPropertyValue("width")).toBe("450px");
    expect(box.style.getPropertyValue("left")).toBe("175px");
    expect(important(dim, "clip-path")).toEqual(["clip-path", true, "important"]);
    expect(stage.matches(QUICKCROP_ROOTS.join(","))).toBe(true);
    expect(plainInline(QUICKCROP_ROOTS, stage)).toEqual([]);
    host.onCancel();
    await expect(result).resolves.toBeNull();
  });
});

describe("the vendored richclay", () => {
  test("places and hides its floating toolbar with !important inline styles", async () => {
    const { RichClay } = await import("../../src/vendor/richclay.vendor.js");
    document.body.innerHTML = '<div editable="toolbar-on-select"><p>Some text</p></div>';
    const element = document.querySelector("[editable]");
    element.getBoundingClientRect = () => ({ top: 300, bottom: 340, left: 50, right: 400, width: 350, height: 40 });
    const editor = new RichClay(element);
    element.dispatchEvent(new FocusEvent("focus"));
    const float = document.querySelector("[data-richclay-float]");
    expect(float).not.toBeNull();
    expect(important(float, "display")).toEqual(["display", true, "important"]);
    expect(float.style.getPropertyValue("display")).toBe("none");
    expect(document.querySelectorAll(RICHCLAY_ROOTS.join(",")).length).toBeGreaterThan(0);
    expect(plainInline(RICHCLAY_ROOTS)).toEqual([]);
    editor.destroy();
  });

  test("a shown floating toolbar is moved into place with an !important transform", async () => {
    const { RichClay } = await import("../../src/vendor/richclay.vendor.js");
    document.body.innerHTML = '<div editable><p>Some text</p></div>';
    const element = document.querySelector("[editable]");
    element.getBoundingClientRect = () => ({ top: 300, bottom: 340, left: 50, right: 400, width: 350, height: 40 });
    const editor = new RichClay(element);
    element.dispatchEvent(new FocusEvent("focus"));
    const float = document.querySelector("[data-richclay-float]");
    expect(float.style.getPropertyValue("display")).toBe("");
    expect(float.style.getPropertyValue("transform")).toMatch(/^translate\(/);
    expect(float.style.getPropertyPriority("transform")).toBe("important");
    expect(float.style.getPropertyValue("visibility")).toBe("");
    expect(document.querySelectorAll(RICHCLAY_ROOTS.join(",")).length).toBeGreaterThan(0);
    expect(plainInline(RICHCLAY_ROOTS)).toEqual([]);
    editor.destroy();
  });
});
