import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { openAltEditor } from "../../../src/page/media.js";
import { editor } from "./view-helpers.js";

/**
 * The image and file node views: what they draw, the caption that commits on
 * Enter or blur as one undo step, the width handle, and the safe link on a file.
 */

beforeAll(() => { document.elementFromPoint ??= () => null; });
afterEach(() => { document.body.innerHTML = ""; });

const IMG = { src: "/a.png", alt: "A door", caption: "Front door" };
const image = (attrs = {}) => {
  const view = editor([["p", "paragraph", "P"], ["i", "image", "", { ...IMG, ...attrs }]]);
  view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
  return view;
};
const figure = (view) => view.dom.querySelector("figure.page-image");
const caption = (view) => figure(view).querySelector(".page-image-caption");
const frame = (view) => figure(view).querySelector(".page-image-frame");
const attrs = (view) => view.state.doc.child(1).attrs;
const press = (el, k) => { const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
const ptr = (type, props = {}) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: props.clientX ?? 0, clientY: 0 });
  Object.defineProperty(e, "pointerId", { value: 1 });
  return e;
};

describe("ImageView", () => {
  test("draws the picture, its alt text, caption and block id", () => {
    const view = image();
    const img = figure(view).querySelector("img");
    expect([img.getAttribute("src"), img.alt, caption(view).textContent, figure(view).dataset.id]).toEqual(["/a.png", "A door", "Front door", "i"]);
    expect(caption(view).getAttribute("aria-label")).toBe("Caption");
  });

  test("the align bar sets left and right as one undo step each, and Centre clears the attribute", () => {
    const view = image();
    const bar = figure(view).querySelector(".page-image-align");
    const pressed = () => [...bar.children].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.align);
    expect([figure(view).dataset.align, pressed()]).toEqual([undefined, ["center"]]);
    bar.querySelector('[data-align="left"]').click();
    expect([attrs(view).align, figure(view).dataset.align, pressed()]).toEqual(["left", "left", ["left"]]);
    bar.querySelector('[data-align="right"]').click();
    expect(attrs(view).align).toBe("right");
    history.undo(view.state, view.dispatch);
    expect(attrs(view).align).toBe("left");
    bar.querySelector('[data-align="center"]').click();
    expect([attrs(view).align, figure(view).dataset.align]).toEqual([null, undefined]);
  });

  test("a copied image keeps its width and alignment when pasted back", async () => {
    const { model } = await import("../../../src/vendor/prosemirror.vendor.js");
    const view = image({ width: 300, align: "right" });
    const dom = model.DOMSerializer.fromSchema(view.state.schema).serializeNode(view.state.doc.child(1));
    const back = view.someProp("clipboardParser", (p) => p) ?? model.DOMParser.fromSchema(view.state.schema);
    const wrap = document.createElement("div");
    wrap.append(dom);
    const node = back.parseSlice(wrap).content.firstChild;
    expect([node.type.name, node.attrs.width, node.attrs.align]).toEqual(["image", 300, "right"]);
  });

  test("a pixel width is the frame's width, and no width leaves it automatic", () => {
    const view = image({ width: 320 });
    expect(frame(view).style.width).toBe("320px");
    view.dispatch(view.state.tr.setNodeMarkup(view.state.doc.child(0).nodeSize, null, { ...attrs(view), width: null }));
    expect(frame(view).style.width).toBe("");
  });

  test("changing attributes updates the same element instead of building a new one", () => {
    const view = image();
    const before = figure(view);
    view.dispatch(view.state.tr.setNodeMarkup(view.state.doc.child(0).nodeSize, null, { ...attrs(view), alt: "Other" }));
    expect(figure(view)).toBe(before);
    expect(figure(view).querySelector("img").alt).toBe("Other");
  });

  test("an empty caption is marked data-empty", () => {
    const view = image({ caption: "" });
    expect(caption(view).hasAttribute("data-empty")).toBe(true);
    expect(caption(view).dataset.placeholder).toBe("Add a caption");
  });

  test("Enter commits the caption with spaces collapsed, as one undo step", () => {
    const view = image();
    caption(view).textContent = "  Back   door ";
    expect(press(caption(view), "Enter")).toBe(true);
    expect(attrs(view).caption).toBe("Back door");
    history.undo(view.state, view.dispatch);
    expect(attrs(view).caption).toBe("Front door");
  });

  test("leaving the field commits it too, and an unchanged caption makes no transaction", () => {
    const view = image();
    caption(view).textContent = "Changed";
    caption(view).dispatchEvent(new Event("blur"));
    expect(attrs(view).caption).toBe("Changed");
    const before = view.state;
    caption(view).dispatchEvent(new Event("blur"));
    expect(view.state).toBe(before);
  });

  test("Escape puts the saved caption back and commits nothing", () => {
    const view = image();
    const before = view.state.doc;
    caption(view).textContent = "Typed";
    press(caption(view), "Escape");
    expect(caption(view).textContent).toBe("Front door");
    expect(view.state.doc).toBe(before);
  });

  test("a broken picture is marked until it loads", () => {
    const view = image();
    const img = figure(view).querySelector("img");
    img.dispatchEvent(new Event("error"));
    expect(figure(view).hasAttribute("data-broken")).toBe(true);
    img.dispatchEvent(new Event("load"));
    expect(figure(view).hasAttribute("data-broken")).toBe(false);
  });

  test("selecting the node adds .is-selected, and caption and handle events stay with the view", () => {
    const view = image();
    const iv = view.nodeDOM(view.state.doc.child(0).nodeSize);
    expect(iv).toBe(figure(view));
    const desc = view.docView.children[1];
    desc.selectNode();
    expect(figure(view).classList.contains("is-selected")).toBe(true);
    desc.deselectNode();
    expect(figure(view).classList.contains("is-selected")).toBe(false);
    expect(desc.spec.stopEvent({ target: caption(view) })).toBe(true);
    expect(desc.spec.stopEvent({ target: figure(view).querySelector("img") })).toBe(false);
  });
});

describe("the width handle", () => {
  const setup = () => {
    const view = image({ width: 300 });
    view.dom.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 });
    frame(view).getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200 });
    return { view, handle: figure(view).querySelector(".page-image-handle") };
  };

  test("dragging resizes the frame live and commits an integer pixel width on release, as one undo step", () => {
    const { view, handle } = setup();
    handle.dispatchEvent(ptr("pointerdown", { clientX: 300 }));
    handle.dispatchEvent(ptr("pointermove", { clientX: 400 }));
    expect(frame(view).style.width).toBe("400px");
    expect(attrs(view).width).toBe(300);
    handle.dispatchEvent(ptr("pointerup", { clientX: 400 }));
    expect(attrs(view).width).toBe(400);
    history.undo(view.state, view.dispatch);
    expect(attrs(view).width).toBe(300);
  });

  test("the width never passes the column and never goes under the minimum", () => {
    const { view, handle } = setup();
    handle.dispatchEvent(ptr("pointerdown", { clientX: 300 }));
    handle.dispatchEvent(ptr("pointermove", { clientX: 2000 }));
    expect(frame(view).style.width).toBe("600px");
    handle.dispatchEvent(ptr("pointermove", { clientX: -2000 }));
    expect(frame(view).style.width).toBe("48px");
    handle.dispatchEvent(ptr("pointerup", { clientX: -2000 }));
    expect(attrs(view).width).toBe(48);
  });

  test("a cancelled gesture puts the old width back and commits nothing", () => {
    const { view, handle } = setup();
    const before = view.state.doc;
    handle.dispatchEvent(ptr("pointerdown", { clientX: 300 }));
    handle.dispatchEvent(ptr("pointermove", { clientX: 450 }));
    handle.dispatchEvent(ptr("pointercancel"));
    expect(frame(view).style.width).toBe("300px");
    expect(view.state.doc).toBe(before);
  });

  test("releasing without moving commits nothing", () => {
    const { view, handle } = setup();
    const before = view.state;
    handle.dispatchEvent(ptr("pointerdown", { clientX: 300 }));
    handle.dispatchEvent(ptr("pointerup", { clientX: 300 }));
    expect(view.state.doc).toBe(before.doc);
  });
});

describe("FileView", () => {
  const file = (a = {}) => editor([["p", "paragraph", "P"], ["f", "file", "", { src: "/files/a.pdf", name: "Report.pdf", size: 2 * 1024 * 1024, mime: "application/pdf", ...a }]]);
  const link = (view) => view.dom.querySelector(".page-file-link");

  test("draws the name as a link that opens in a new tab, with the size beside it", () => {
    const view = file();
    expect([link(view).getAttribute("href"), link(view).target, link(view).rel]).toEqual(["/files/a.pdf", "_blank", "noopener noreferrer"]);
    expect([view.dom.querySelector(".page-file-name").textContent, view.dom.querySelector(".page-file-meta").textContent]).toEqual(["Report.pdf", "2.0 MB"]);
    expect(view.dom.querySelector(".page-file").dataset.id).toBe("f");
  });

  test("sizes read as bytes, kilobytes or megabytes, and an unknown size shows nothing", () => {
    const meta = (size) => { const v = file({ size }); const t = v.dom.querySelector(".page-file-meta").textContent; document.body.innerHTML = ""; return t; };
    expect([meta(500), meta(1536), meta(null)]).toEqual(["500 B", "2 KB", ""]);
  });

  test("an address that is not safe leaves the link without an href", () => {
    const view = file({ src: "javascript:alert(1)" });
    expect(link(view).hasAttribute("href")).toBe(false);
  });

  test("a missing name reads 'file'", () => {
    const view = file({ name: "" });
    expect(view.dom.querySelector(".page-file-name").textContent).toBe("file");
  });
});

test("F15 IME Enter in a caption leaves the candidate and saved caption alone", () => {
  const view = image();
  try {
    caption(view).textContent = "composing";
    const event = new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true });
    caption(view).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(attrs(view).caption).toBe("Front door");
    expect(caption(view).textContent).toBe("composing");
  } finally { view.destroy(); }
});

test("F22 blurring alt text commits it, while Escape still cancels", () => {
  const view = image();
  try {
    openAltEditor(view, "i");
    let input = view.dom.parentElement.querySelector('[data-mode="alt"] input');
    input.value = "New description";
    input.dispatchEvent(new Event("blur"));
    expect(attrs(view).alt).toBe("New description");
    history.undo(view.state, view.dispatch);
    expect(attrs(view).alt).toBe("A door");
    openAltEditor(view, "i");
    input = view.dom.parentElement.querySelector('[data-mode="alt"] input');
    input.value = "Discard";
    press(input, "Escape");
    expect(attrs(view).alt).toBe("A door");
  } finally { view.destroy(); }
});
