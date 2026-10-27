/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import * as titleIcon from "../../../src/page/features/title-icon.js";
import * as titleCover from "../../../src/page/features/title-cover.js";
import { installPageFeature, runPageCommand } from "../../../src/page/editor.js";
import { OPAQUE, VALUE, canon, envelopeAttrs, parseModel, project, renderModel, revOf } from "../../../src/page/projection.js";
import { documentTitle } from "../../../src/page/document-title.js";
import { blockMap } from "../../../src/page/model.js";
import { editor } from "./view-helpers.js";

/**
 * Page cover: the picture above the title. It is four scalar attributes of the first root
 * H1 — where it comes from, what it says, and which part of it stays in view — so a reader
 * draws it with nothing of this loaded and one person's cover never overwrites another's
 * icon. The file goes through the media upload transport; nothing reaches the record until
 * the host answers with an address, the format gate admits the write and the title block is
 * still the one the command was asked for. The reposition preview writes nothing at all.
 */

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
const COVER = { level: 1, pageCoverSrc: "/cover.jpg", pageCoverAlt: "A door", pageCoverX: 50, pageCoverY: 50 };
const PAGE = (attrs = {}) => [["h", "heading", "Notes", { level: 1, ...attrs }], ["b", "paragraph", "Body"]];

afterEach(() => { document.body.innerHTML = ""; });

const settle = () => new Promise((done) => setTimeout(done, 0));
const waitFor = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return true;
    await new Promise((done) => setTimeout(done, 5));
  }
  return false;
};
const deferred = () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return { gate, release };
};
const file = (name = "cover.png", type = "image/png", body = "bytes") => new File([body], name, { type });
const recordingUpload = () => {
  const calls = [];
  const upload = (f) => { calls.push(f); return Promise.resolve({ ok: true, uploads: [{ url: `/uploads/${calls.length}-${f.name}` }] }); };
  return { upload, calls };
};

// The gate answers as the page host's does when the document may use floor 1.
const open = (spec, { upload = recordingUpload().upload, gate = true } = {}) => {
  const view = editor(spec, { upload });
  const asked = [];
  if (gate) view.runFormatCommand = async (apply) => { asked.push(apply); return { status: "applied", floor: 1, result: await apply({ floor: 1 }) }; };
  installPageFeature({ view }, "titleIcon", titleIcon);
  return { view, asked };
};

const record = (view, id) => blockMap(view.state.doc)[id];
const header = (view) => view.dom.querySelector("header[data-page-heading]");
const coverImg = (view) => header(view)?.querySelector("img[data-page-cover]");
const panel = () => document.querySelector(".page-cover-panel");
const acts = () => [...(panel()?.querySelectorAll("[data-act]") ?? [])].map((b) => b.dataset.act);
const press = (act) => panel().querySelector(`[data-act="${act}"]`).click();
const chooser = () => document.querySelector("input.page-cover-input");
const attrsOf = (view, id) => {
  const a = record(view, id) ?? {};
  return { src: a.pageCoverSrc ?? null, alt: a.pageCoverAlt ?? "", x: a.pageCoverX ?? 50, y: a.pageCoverY ?? 50 };
};
const dataUrlOf = (f) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
const chooseFile = (f) => {
  const input = chooser();
  Object.defineProperty(input, "files", { configurable: true, get: () => [f] });
  input.dispatchEvent(new Event("change"));
};
const addCover = async (view, f) => {
  const started = await runPageCommand(view, "titleCover", {});
  expect(started).toEqual({ ok: true, picker: true });
  chooseFile(f);
};
const key = (name) => document.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

const articleOf = (inner, rev = "0") => {
  const parsed = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body><article data-page="1" data-rev="${rev}">\n${inner}\n</article></body></html>`,
    "text/html",
  );
  return parsed.querySelector("article");
};

test("a chosen photograph is uploaded through the media transport and written to the title once", async () => {
  const up = recordingUpload();
  const { view, asked } = open(PAGE(), { upload: up.upload });
  await addCover(view, file("cover.png", "image/png", "the bytes"));

  expect(await waitFor(() => record(view, "h").pageCoverSrc === "/uploads/1-cover.png")).toBe(true);
  expect(up.calls.map((f) => f.name)).toEqual(["cover.png"]);
  expect(asked).toHaveLength(1);
  expect(record(view, "p")).toBeUndefined();

  expect(attrsOf(view, "h")).toEqual({ src: "/uploads/1-cover.png", alt: "", x: 50, y: 50 });
  const img = coverImg(view);
  expect([img.getAttribute("src"), img.getAttribute("alt"), img.getAttribute("style")])
    .toEqual(["/uploads/1-cover.png", "", "object-position:50% 50%"]);
  // The picture is beside the title, never in it.
  expect(header(view).querySelector("h1").textContent).toBe("Notes");
  expect(header(view).firstChild).toBe(img);
  expect(panel()).toBeNull();

  // One commit, so one undo takes the cover and nothing else.
  history.undoNoScroll(view.state, view.dispatch);
  expect(record(view, "h").pageCoverSrc ?? null).toBeNull();
  expect(header(view)).toBeNull();
  expect(view.state.doc.child(1).textContent).toBe("Body");
});

test("Add cover makes the title when the page has no H1: one admitted transaction, one undo step", async () => {
  const { view, asked } = open([["e", "paragraph", "Body"]]);
  const before = view.state.doc;
  await addCover(view, file());

  expect(await waitFor(() => view.state.doc.childCount === 2)).toBe(true);
  expect(asked).toHaveLength(1);
  const title = view.state.doc.child(0);
  expect([title.type.name, title.attrs.level, title.attrs.parent, title.attrs.pageCoverSrc]).toEqual(["heading", 1, null, "/uploads/1-cover.png"]);
  expect([title.textContent, view.state.doc.child(1).textContent]).toEqual(["", "Body"]);
  expect(header(view).querySelector("h1").textContent).toBe("");
  expect(coverImg(view).getAttribute("src")).toBe("/uploads/1-cover.png");

  history.undoNoScroll(view.state, view.dispatch);
  expect(view.state.doc.childCount).toBe(1);
  expect(canon(blockMap(view.state.doc))).toBe(canon(blockMap(before)));
  expect(view.dom.querySelector("header[data-page-heading]")).toBeNull();
});

test("a host that stores no files offers the embed choice, and only that choice keeps the image", async () => {
  const { view, asked } = open(PAGE(), { upload: () => Promise.resolve({ ok: false, code: "unsupported", msg: "This host does not store uploaded files" }) });
  const image = file();
  await addCover(view, image);

  expect(await waitFor(() => panel()?.dataset.state === "embed-choice")).toBe(true);
  expect(acts()).toEqual(["embed", "cancel"]);
  expect(record(view, "h").pageCoverSrc ?? null).toBeNull();
  expect(asked).toHaveLength(0);

  press("embed");
  expect(await waitFor(() => typeof record(view, "h").pageCoverSrc === "string")).toBe(true);
  expect(record(view, "h").pageCoverSrc).toBe(await dataUrlOf(image));
  expect(asked).toHaveLength(1);
  expect(coverImg(view).getAttribute("src")).toBe(record(view, "h").pageCoverSrc);
  expect(panel()).toBeNull();
});

test("a forbidden upload embeds nothing: it is a refusal, not an offer", async () => {
  const { view, asked } = open(PAGE(), { upload: () => Promise.resolve({ ok: false, code: "forbidden", msg: "You can\u2019t add files to this document" }) });
  const before = view.state.doc;
  await addCover(view, file());

  expect(await waitFor(() => panel()?.dataset.state === "error")).toBe(true);
  expect(panel().textContent).toContain("add files to this document");
  expect(acts()).toEqual(["cancel"]);
  await settle();
  await settle();
  expect(acts()).toEqual(["cancel"]);
  expect(view.state.doc).toBe(before);
  expect(asked).toHaveLength(0);
  expect(header(view)).toBeNull();
});

test("cancel stops the upload, and an answer that arrives afterwards lands nowhere", async () => {
  const held = deferred();
  let aborted = false;
  const { view, asked } = open(PAGE(), {
    upload: (f, { signal } = {}) => new Promise((ok) => {
      signal?.addEventListener("abort", () => { aborted = true; });
      held.gate.then(() => ok({ ok: true, uploads: [{ url: "/uploads/late.png" }] }));
    }),
  });
  const before = view.state.doc;
  await addCover(view, file());
  expect(await waitFor(() => panel()?.dataset.state === "uploading")).toBe(true);

  press("cancel");
  expect(panel()).toBeNull();
  expect(aborted).toBe(true);
  held.release();
  await settle();
  await settle();

  expect(view.state.doc).toBe(before);
  expect(asked).toHaveLength(0);
  expect(header(view)).toBeNull();
});

test("a title deleted, or a format that refuses, while the upload is in the air writes nothing", async () => {
  const held = deferred();
  const first = open(PAGE(), { upload: () => held.gate.then(() => ({ ok: true, uploads: [{ url: "/uploads/1-cover.png" }] })) });
  await addCover(first.view, file());
  expect(await waitFor(() => panel()?.dataset.state === "uploading")).toBe(true);

  // The title is deleted while the host is still answering: the block the command was asked
  // for is gone, so the address is written nowhere.
  first.view.dispatch(first.view.state.tr.delete(0, first.view.state.doc.child(0).nodeSize));
  const gone = first.view.state.doc;
  held.release();
  expect(await waitFor(() => first.asked.length === 1)).toBe(true);
  await settle();
  expect(first.view.state.doc).toBe(gone);
  expect(first.view.dom.querySelector("header[data-page-heading]")).toBeNull();

  // A document whose format moved under the upload writes nothing either: the gate answers
  // first and its refusal is the command's own.
  const second = open(PAGE());
  second.view.runFormatCommand = async () => ({ status: "upgrade-required", code: "page-format-upgrade-required" });
  const before = second.view.state.doc;
  await runPageCommand(second.view, "titleCover", {});
  chooseFile(file());
  await settle();
  await settle();
  expect(second.view.state.doc).toBe(before);
  expect(second.view.dom.querySelector("header[data-page-heading]")).toBeNull();
});

test("the reposition previews without writing, and Apply is one undo step", async () => {
  const { view, asked } = open(PAGE(COVER));
  const before = view.state.doc;
  expect(coverImg(view).getAttribute("style")).toBe("object-position:50% 50%");

  expect(await runPageCommand(view, "titleCover", { act: "position" })).toEqual({ ok: true, position: true });
  expect(acts()).toEqual(["apply", "cancel"]);

  key("ArrowRight");
  key("ArrowDown");
  expect(coverImg(view).getAttribute("style")).toBe("object-position:55% 55%");
  expect(view.state.doc).toBe(before);
  expect(asked).toHaveLength(0);

  // Escape puts the picture back where the record says it is.
  key("Escape");
  expect(panel()).toBeNull();
  expect(coverImg(view).getAttribute("style")).toBe("object-position:50% 50%");
  expect(view.state.doc).toBe(before);

  await runPageCommand(view, "titleCover", { act: "position" });
  key("ArrowRight");
  press("apply");
  expect(await waitFor(() => record(view, "h").pageCoverX === 55)).toBe(true);
  expect(attrsOf(view, "h")).toEqual({ src: "/cover.jpg", alt: "A door", x: 55, y: 50 });
  expect(coverImg(view).getAttribute("style")).toBe("object-position:55% 50%");
  expect(asked).toHaveLength(1);

  history.undoNoScroll(view.state, view.dispatch);
  expect(attrsOf(view, "h")).toEqual({ src: "/cover.jpg", alt: "A door", x: 50, y: 50 });
  expect(coverImg(view).getAttribute("style")).toBe("object-position:50% 50%");
});

test("a remote icon and a local cover are different fields: neither overwrites the other", async () => {
  const held = deferred();
  const { view } = open(PAGE(), { upload: () => held.gate.then(() => ({ ok: true, uploads: [{ url: "/uploads/1-cover.png" }] })) });
  await addCover(view, file());
  expect(await waitFor(() => panel()?.dataset.state === "uploading")).toBe(true);

  // A peer puts an icon on the same title while the upload is in the air.
  const at = 0;
  view.dispatch(view.state.tr.setNodeMarkup(at, null, { ...view.state.doc.child(at).attrs, pageIcon: "\u{1F308}" }));
  held.release();

  expect(await waitFor(() => record(view, "h").pageCoverSrc === "/uploads/1-cover.png")).toBe(true);
  expect(record(view, "h").pageIcon).toBe("\u{1F308}");
  expect(header(view).querySelector("span[data-page-icon]").textContent).toBe("\u{1F308}");
  expect(coverImg(view)).not.toBeNull();

  // Undo takes back the cover, the way a second person's own change would, and leaves the
  // icon that came from someone else.
  history.undoNoScroll(view.state, view.dispatch);
  expect(record(view, "h").pageCoverSrc ?? null).toBeNull();
  expect(record(view, "h").pageIcon).toBe("\u{1F308}");
});

test("the saved page carries the cover, reopens with it, and an older writer keeps it", async () => {
  const { view } = open(PAGE(COVER));
  const shape = project(blockMap(view.state.doc));
  expect(documentTitle(shape)).toBe("Notes");
  const html = renderModel(shape);
  expect(html).toBe(`<header data-id="h" data-page-heading="1"><img data-page-cover src="/cover.jpg" alt="A door" style="object-position:50% 50%"><h1>Notes</h1></header>\n<p data-id="b">Body</p>`);
  expect(canon(parseModel(articleOf(html, revOf(shape))))).toBe(canon(shape));

  // R has no cover of its own: a heading it could not decorate carries the attributes in its
  // envelope, and this reader draws it and hands it back whole.
  const env = envelopeAttrs({ pageCoverSrc: "/cover.jpg", pageCoverAlt: "A door", pageCoverX: 10, pageCoverY: 90 });
  const theirs = parseModel(articleOf(`<h1 data-id="h" ${OPAQUE}="${env[OPAQUE]}" ${VALUE}="${env[VALUE]}">Notes</h1>`));
  expect(theirs).toEqual([{ id: "h", t: "heading", level: 1, pageCoverSrc: "/cover.jpg", pageCoverAlt: "A door", pageCoverX: 10, pageCoverY: 90, c: "Notes" }]);
  expect(renderModel(theirs)).toContain(`<img data-page-cover src="/cover.jpg" alt="A door" style="object-position:10% 90%">`);
  expect(canon(parseModel(articleOf(renderModel(theirs))))).toBe(canon(theirs));
});

test("a cover is an address a reader can load and a focal point inside the picture", async () => {
  const shapeOf = (attrs) => project({ h: { t: "heading", pos: "B", c: "Notes", level: 1, ...attrs } })[0];
  // Script, blob and malformed addresses are no picture at all: the heading saves plain.
  for (const src of ["javascript:alert(1)", "blob:https://example.com/a.png", "data:text/html,<b>x</b>", ""]) {
    expect(shapeOf({ pageCoverSrc: src }).pageCoverSrc).toBeUndefined();
    expect(renderModel(project({ h: { t: "heading", pos: "B", c: "Notes", level: 1, pageCoverSrc: src } }))).toBe('<h1 data-id="h">Notes</h1>');
  }
  expect(shapeOf({ pageCoverSrc: PNG }).pageCoverSrc).toBe(PNG);
  expect(shapeOf({ pageCoverSrc: "/cover.jpg" }).pageCoverSrc).toBe("/cover.jpg");
  // A focal point is a percentage of the image, so it is clamped into 0 to 100, and a value
  // that is not a number is the middle.
  const withFocal = (attrs) => renderModel(project({ h: { t: "heading", pos: "B", c: "Notes", level: 1, pageCoverSrc: "/c.jpg", ...attrs } }));
  expect(withFocal({ pageCoverX: 400, pageCoverY: -20 })).toContain(`style="object-position:100% 0%"`);
  expect(withFocal({ pageCoverX: null, pageCoverY: "nonsense" })).toContain(`style="object-position:50% 50%"`);
  expect(withFocal({})).toContain(`style="object-position:50% 50%"`);

  // The host's answer passes the same validator: a blob or script address is not embedded.
  for (const url of ["blob:https://example.com/a.png", "javascript:alert(1)"]) {
    const { view, asked } = open(PAGE(), { upload: () => Promise.resolve({ ok: true, uploads: [{ url }] }) });
    const before = view.state.doc;
    await addCover(view, file());
    expect(await waitFor(() => panel()?.dataset.state === "error")).toBe(true);
    expect(view.state.doc).toBe(before);
    expect(asked).toHaveLength(0);
    expect(header(view)).toBeNull();
  }
});

test("an answer that arrives after the edit left is inert", async () => {
  const held = deferred();
  const view = editor(PAGE());
  const feature = titleCover.createFeature({ view, upload: () => held.gate.then(() => ({ ok: true, uploads: [{ url: "/uploads/1-cover.png" }] })) });
  const before = view.state.doc;
  expect(feature.run()).toEqual({ ok: true, picker: true });
  chooseFile(file());
  await settle();
  expect(panel()).not.toBeNull();

  feature.dispose();
  expect(panel()).toBeNull();
  expect(document.querySelector("input.page-cover-input")).toBeNull();
  held.release();
  await settle();
  await settle();

  expect(view.state.doc).toBe(before);
  expect(view.dom.querySelector("header[data-page-heading]")).toBeNull();
});
