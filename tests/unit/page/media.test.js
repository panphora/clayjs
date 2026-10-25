import { jest } from "@jest/globals";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { blockMap, REMOTE } from "../../../src/page/model.js";
import { mediaKey, placeTr, removeTr, insertFiles, cancelUpload, pickFiles, hostPlace, EMBED_MAX } from "../../../src/page/media.js";
import { editor, posOf, select } from "./view-helpers.js";

/**
 * Uploads as bookmarks: nothing reaches the record until the host has a URL, the
 * files land in drop order, and every failure ends in a visible, removable state.
 */

afterEach(() => { document.body.innerHTML = ""; });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const until = async (done) => { for (let i = 0; i < 200 && !done(); i++) await new Promise((resolve) => setTimeout(resolve, 10)); };
const file = (name = "a.png", type = "image/png", size = 10) => Object.defineProperty(new File(["x"], name, { type }), "size", { value: size });

function fakeUpload() {
  const calls = [];
  const upload = (f, opts) => new Promise((resolve) => {
    const call = { file: f, opts, resolve: (r) => resolve(r) };
    calls.push(call);
    opts.signal.addEventListener("abort", () => resolve({ ok: false, code: "aborted", uploads: [] }));
  });
  return { upload, calls };
}
const ok = (url) => ({ ok: true, uploads: [{ url }] });
const fail = (code, msg = "Nope") => ({ ok: false, code, msg, uploads: [] });

const page = (spec = [["p", "paragraph", "P"], ["e", "paragraph", ""], ["z", "paragraph", "Z"]]) => {
  const up = fakeUpload();
  const view = editor(spec, { upload: up.upload });
  return { view, up };
};
const items = (view) => mediaKey.getState(view.state).items;
const names = (view) => { const r = []; view.state.doc.forEach((n) => r.push(n.type.name === "image" || n.type.name === "file" ? n.attrs.src : n.textContent)); return r; };
const widget = (view) => view.dom.querySelector(".page-upload");
const click = (view, act) => view.dom.querySelector(`.page-upload-btn[data-act="${act}"]`).click();

describe("placement", () => {
  test("three files finishing out of order land in drop order, the first replacing the empty paragraph", async () => {
    const { view, up } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [file("1.png"), file("2.png"), file("3.png")]);
    expect(items(view).map((it) => [it.order, it.replaceId])).toEqual([[0, "e"], [1, "e"], [2, "e"]]);
    up.calls[1].resolve(ok("/2.png")); await tick();
    up.calls[2].resolve(ok("/3.png")); await tick();
    up.calls[0].resolve(ok("/1.png")); await tick();
    expect(names(view)).toEqual(["P", "/1.png", "/2.png", "/3.png", "Z"]);
    expect(items(view)).toEqual([]);
  });

  test("nothing reaches the record while uploading, and each placed block gets its own id and key", async () => {
    const { view, up } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [file("1.png"), file("2.png")]);
    expect(Object.keys(blockMap(view.state.doc)).length).toBe(3);
    up.calls[0].resolve(ok("/1.png")); up.calls[1].resolve(ok("/2.png")); await tick();
    const record = blockMap(view.state.doc);
    expect(Object.keys(record).length).toBe(4);
    expect(new Set(Object.values(record).map((b) => b.pos)).size).toBe(4);
  });

  test("a bookmark maps through an edit above it", async () => {
    const { view, up } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [file()]);
    const before = items(view)[0].pos;
    view.dispatch(view.state.tr.insertText("xy", 1));
    expect(items(view)[0].pos).toBe(before + 2);
    up.calls[0].resolve(ok("/a.png")); await tick();
    expect(names(view)).toEqual(["xyP", "/a.png", "Z"]);
  });

  test("a file onto a non-empty block goes after its whole subtree at its level", async () => {
    const { view, up } = page([["t", "toggle", "T", { open: true }], ["b", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "Z"]]);
    select(view, posOf(view, "t"));
    insertFiles(view, [file("a.pdf", "application/pdf")]);
    up.calls[0].resolve(ok("/a.pdf")); await tick();
    expect(names(view)).toEqual(["T", "body", "/a.pdf", "Z"]);
    expect(view.state.doc.child(2).type.name).toBe("file");
    expect(view.state.doc.child(2).attrs).toMatchObject({ name: "a.pdf", mime: "application/pdf", parent: null });
  });

  test("one undo of the last placement brings back the empty paragraph it removed", async () => {
    const { view, up } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [file("1.png"), file("2.png")]);
    up.calls[0].resolve(ok("/1.png")); await tick();
    up.calls[1].resolve(ok("/2.png")); await tick();
    expect(names(view)).toEqual(["P", "/1.png", "/2.png", "Z"]);
    history.undo(view.state, view.dispatch);
    expect(names(view)).toEqual(["P", "/1.png", "", "Z"]);
  });

  test("a bookmark whose block was deleted still places at the mapped boundary", async () => {
    const { view, up } = page([["p", "paragraph", "P"], ["z", "paragraph", "Z"]]);
    select(view, posOf(view, "p"));
    insertFiles(view, [file("d.pdf", "application/pdf")]);
    view.dispatch(view.state.tr.delete(0, view.state.doc.child(0).nodeSize));
    up.calls[0].resolve(ok("/d.pdf")); await tick();
    expect(view.state.doc.childCount).toBe(2);
  });

  test("placeTr and removeTr return null for a bookmark that is gone", () => {
    const { view } = page();
    expect(placeTr(view.state, "u-missing", {})).toBeNull();
    expect(removeTr(view.state, "u-missing")).toBeNull();
  });

  test("hostPlace replaces an empty paragraph and otherwise follows the block's subtree", () => {
    const { view } = page();
    const empty = hostPlace(view.state, 1);
    expect([empty.replaceId, empty.parent]).toEqual(["e", null]);
    expect(hostPlace(view.state, 0).replaceId).toBeNull();
    expect(hostPlace(view.state, 99).at).toBe(view.state.doc.content.size);
  });
});

describe("the widget", () => {
  test("shows the file name, a progress bar that follows the upload and a Cancel button", async () => {
    const { view, up } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [file("big.png")]);
    expect(widget(view).dataset.state).toBe("uploading");
    expect(widget(view).querySelector(".page-upload-name").textContent).toBe("big.png");
    up.calls[0].opts.onProgress({ percent: 40 });
    expect(widget(view).querySelector('[role="progressbar"]').getAttribute("aria-valuenow")).toBe("40");
    expect(widget(view).querySelector(".page-upload-btn").textContent).toBe("Cancel");
  });

  test("progress below five points of the last drawn value is not redrawn", () => {
    const { view, up } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [file()]);
    up.calls[0].opts.onProgress({ percent: 10 });
    const before = view.state;
    up.calls[0].opts.onProgress({ percent: 12 });
    expect(view.state).toBe(before);
  });

  test("Cancel aborts the upload and removes the bookmark silently", async () => {
    const { view, up } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [file()]);
    click(view, "cancel");
    await tick();
    expect(up.calls[0].opts.signal.aborted).toBe(true);
    expect(items(view)).toEqual([]);
    expect(widget(view)).toBeNull();
    expect(names(view)).toEqual(["P", "", "Z"]);
  });

  test("the widget is not part of the record or the document text", () => {
    const { view } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [file()]);
    expect(view.state.doc.textContent).toBe("PZ");
  });
});

describe("when the upload does not succeed", () => {
  const settled = async (result, f = file()) => {
    const { view, up } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [f]);
    up.calls[0].resolve(result); await tick();
    return { view, up };
  };
  const buttons = (view) => [...view.dom.querySelectorAll(".page-upload-btn")].map((b) => b.dataset.act);

  test("a host without uploads offers to keep a small image inside the document, and embeds nothing until asked", async () => {
    const { view } = await settled(fail("unsupported"));
    expect(widget(view).dataset.state).toBe("embed-choice");
    expect(widget(view).querySelector(".page-upload-msg").textContent).toMatch(/doesn't store files/);
    expect(buttons(view)).toEqual(["embed", "remove"]);
    expect(widget(view).querySelector('[data-act="embed"]').textContent).toBe("Keep this image inside the document");
    expect(names(view)).toEqual(["P", "", "Z"]);
  });

  test("Keep this image inside the document embeds it as a data: URL and announces it", async () => {
    const { view } = await settled(fail("unsupported"));
    click(view, "embed");
    await until(() => items(view).length === 0);
    expect(view.state.doc.child(1).type.name).toBe("image");
    expect(view.state.doc.child(1).attrs.src).toMatch(/^data:image\/png;base64,/);
    expect(items(view)).toEqual([]);
    expect(view.dom.parentElement.querySelector(".page-live").textContent).toBe("Saved inside the document");
  });

  test("an image over the embed cap, and any file, get an error with Remove only", async () => {
    const big = await settled(fail("unsupported"), file("big.png", "image/png", EMBED_MAX + 1));
    expect(widget(big.view).dataset.state).toBe("error");
    expect(buttons(big.view)).toEqual(["remove"]);
    document.body.innerHTML = "";
    const doc = await settled(fail("unsupported"), file("a.pdf", "application/pdf"));
    expect(widget(doc.view).querySelector(".page-upload-msg").textContent).toBe("This host doesn't store files.");
    expect(buttons(doc.view)).toEqual(["remove"]);
  });

  test.each(["forbidden", "payment-required", "too-large", "unsupported-type"])("%s shows the host's message with Remove only and never offers to embed", async (code) => {
    const { view } = await settled(fail(code, "Host says no"));
    expect(widget(view).dataset.state).toBe("error");
    expect(widget(view).querySelector(".page-upload-msg").textContent).toBe("Host says no");
    expect(buttons(view)).toEqual(["remove"]);
  });

  test.each(["timeout", "network", "bad-response"])("%s offers Retry and Remove, and never embeds", async (code) => {
    const { view } = await settled(fail(code, "Broke"));
    expect(buttons(view)).toEqual(["retry", "remove"]);
    expect(names(view)).toEqual(["P", "", "Z"]);
  });

  test("a timeout says the upload may have arrived", async () => {
    const { view } = await settled(fail("timeout"));
    expect(widget(view).querySelector(".page-upload-msg").textContent).toMatch(/may have arrived/);
  });

  test("Retry runs the upload again and a second answer places the block", async () => {
    const { view, up } = await settled(fail("network"));
    click(view, "retry");
    expect(widget(view).dataset.state).toBe("uploading");
    expect(up.calls.length).toBe(2);
    up.calls[1].resolve(ok("/again.png")); await tick();
    expect(names(view)).toEqual(["P", "/again.png", "Z"]);
  });

  test("Remove drops the bookmark and leaves the empty paragraph and the record untouched", async () => {
    const { view } = await settled(fail("too-large"));
    click(view, "remove");
    expect(items(view)).toEqual([]);
    expect(names(view)).toEqual(["P", "", "Z"]);
  });

  test("each file of several keeps its own state", async () => {
    const { view, up } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [file("1.png"), file("2.png")]);
    up.calls[0].resolve(fail("forbidden", "No")); up.calls[1].resolve(ok("/2.png")); await tick();
    expect(items(view).map((it) => it.state)).toEqual(["error"]);
    expect(names(view)).toEqual(["P", "/2.png", "", "Z"]);
  });
});

describe("paste, drop and the picker", () => {
  const clip = (files, html = "", text = "") => ({ files, getData: (t) => (t === "text/html" ? html : t === "text/plain" ? text : "") });
  const paste = (view, data) => !!view.someProp("handlePaste", (f) => f(view, { clipboardData: data, preventDefault() {} }, null));

  test("pasting an image file puts a bookmark in", () => {
    const { view } = page();
    select(view, posOf(view, "e"));
    expect(paste(view, clip([file()]))).toBe(true);
    expect(items(view).length).toBe(1);
  });

  test("a copied image whose html is only an img tag, and a Finder copy with a file name as text, upload", () => {
    const { view } = page();
    select(view, posOf(view, "e"));
    expect(paste(view, clip([file()], '<meta charset="utf-8"><img src="https://a.io/p.png">'))).toBe(true);
    expect(paste(view, clip([file("note.txt", "text/plain")], "", "note.txt"))).toBe(true);
    expect(items(view).length).toBe(2);
  });

  test("a clipboard with files and real html text, as a spreadsheet copy has, takes the normal paste", () => {
    const { view } = page();
    select(view, posOf(view, "e"));
    expect(paste(view, clip([file()], "<table><tr><td>12</td></tr></table>", "12"))).toBe(false);
    expect(items(view)).toEqual([]);
  });

  test("a file paste in a code block, and a paste with no files, take the normal paste", () => {
    const { view } = page([["c", "code_block", ""]]);
    select(view, posOf(view, "c"));
    expect(paste(view, clip([file()]))).toBe(false);
    select(view, posOf(view, "c"));
    expect(paste(view, clip([]))).toBe(false);
  });

  test("dropping files puts bookmarks at the nearer edge of the block under the pointer", () => {
    const { view } = page([["a", "paragraph", "A"], ["b", "paragraph", "B"]]);
    view.posAtCoords = () => ({ pos: posOf(view, "a"), inside: -1 });
    view.nodeDOM(0).getBoundingClientRect = () => ({ top: 0, bottom: 20, left: 0, right: 100, height: 20, width: 100 });
    const drop = (clientY) => view.someProp("handleDrop", (f) => f(view, { dataTransfer: { files: [file()] }, clientX: 5, clientY, preventDefault() {} }, null, false));
    expect(drop(15)).toBe(true);
    expect(items(view)[0].pos).toBe(view.state.doc.child(0).nodeSize);
    expect(drop(2)).toBe(true);
    expect(items(view)[1].pos).toBe(0);
  });

  test("a drop that moves content, or has no files, is left to ProseMirror", () => {
    const { view } = page();
    const drop = (files, moved) => !!view.someProp("handleDrop", (f) => f(view, { dataTransfer: { files }, clientX: 0, clientY: 0, preventDefault() {} }, null, moved));
    expect(drop([file()], true)).toBe(false);
    expect(drop([], false)).toBe(false);
  });

  test("the menu's picker sets the accept filter, opens the system dialog, and uploads what was chosen at the given place", async () => {
    const { view, up } = page();
    const input = view.dom.parentElement.querySelector(".page-file-input");
    input.click = jest.fn();
    expect(pickFiles(view, "image/*", hostPlace(view.state, 1))).toBe(true);
    expect([input.accept, input.click.mock.calls.length]).toEqual(["image/*", 1]);
    Object.defineProperty(input, "files", { configurable: true, value: [file("pick.png")] });
    input.dispatchEvent(new Event("change"));
    expect(items(view)[0].replaceId).toBe("e");
    up.calls[0].resolve(ok("/pick.png")); await tick();
    expect(names(view)).toEqual(["P", "/pick.png", "Z"]);
  });

  test("destroying the view aborts uploads in flight and removes the picker", () => {
    const { view, up } = page();
    select(view, posOf(view, "e"));
    insertFiles(view, [file()]);
    const input = view.dom.parentElement.querySelector(".page-file-input");
    view.destroy();
    expect(up.calls[0].opts.signal.aborted).toBe(true);
    expect(input.isConnected).toBe(false);
  });
});

describe("without an upload option", () => {
  test("with no clay.upload the image is not uploaded and never offered for embedding", async () => {
    const view = editor([["e", "paragraph", ""]]);
    select(view, posOf(view, "e"));
    insertFiles(view, [file()]);
    await tick();
    expect(items(view)[0].state).toBe("error");
    expect(items(view)[0].code).toBe("unavailable");
    expect(items(view)[0].message).toBe("File uploads are not available in this editor");
  });

  test("the editor uses clay.upload when the upload plugin is loaded", async () => {
    const calls = [];
    globalThis.clay = { upload: (f) => { calls.push(f); return Promise.resolve(ok("/via-clay.png")); } };
    try {
      const view = editor([["e", "paragraph", ""]]);
      select(view, posOf(view, "e"));
      insertFiles(view, [file()]);
      await tick();
      expect(calls.length).toBe(1);
      expect(view.state.doc.child(0).attrs.src).toBe("/via-clay.png");
    } finally {
      delete globalThis.clay;
    }
  });
});

test.each(["javascript:void(0)", "data:text/html,canary", "file:///canary", null, 42])("F5 upload address %j is refused before insertion", async (url) => {
  const view = editor([["p", "paragraph", ""]], { upload: async () => ok(url) });
  try {
    insertFiles(view, [file("a.txt", "text/plain")]);
    await tick();
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild.type.name).toBe("paragraph");
    expect(items(view)[0]).toMatchObject({ state: "error", code: "bad-response" });
  } finally { view.destroy(); }
});

describe("review upload regressions", () => {
  test("F7 cancelling removes the widget immediately and ignores a late success", async () => {
    let finish;
    const view = editor([["p", "paragraph", ""]], { upload: () => new Promise((resolve) => { finish = resolve; }) });
    try {
      insertFiles(view, [file("a.txt", "text/plain")]);
      cancelUpload(view, items(view)[0].id);
      expect(items(view).length).toBe(0);
      expect(widget(view)).toBeNull();
      finish(ok("/late.txt"));
      await tick();
      expect(view.state.doc.firstChild.attrs.id).toBe("p");
      expect(view.state.doc.childCount).toBe(1);
    } finally { view.destroy(); }
  });

  test("F7 rejected upload adapters enter a retryable error state", async () => {
    const view = editor([["p", "paragraph", ""]], { upload: async () => { throw new Error("adapter failed"); } });
    try {
      insertFiles(view, [file("a.txt", "text/plain")]);
      await tick();
      expect([items(view)[0].state, items(view)[0].code]).toEqual(["error", "network"]);
      expect(view.dom.querySelector('[data-act="retry"]')).not.toBeNull();
    } finally { view.destroy(); }
  });

  test("F7 destroying a pending upload releases its preview once", async () => {
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => "blob:preview");
    URL.revokeObjectURL = jest.fn();
    let finish;
    const view = editor([["p", "paragraph", ""]], { upload: () => new Promise((resolve) => { finish = resolve; }) });
    try {
      insertFiles(view, [file()]);
      view.destroy();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
      finish(ok("/late.png"));
      await tick();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    } finally {
      if (!view.isDestroyed) view.destroy();
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    }
  });

  test("F7 joining away an upload boundary preserves batch order", async () => {
    const { view, up } = page([["a", "paragraph", "aaaa"], ["b", "paragraph", "bbbb"]]);
    try {
      insertFiles(view, [file("one.txt", "text/plain"), file("two.txt", "text/plain")], hostPlace(view.state, 0));
      view.dispatch(view.state.tr.join(view.state.doc.firstChild.nodeSize));
      up.calls[0].resolve(ok("/one.txt")); await tick();
      up.calls[1].resolve(ok("/two.txt")); await tick();
      expect(names(view)).toEqual(["aaaabbbb", "/one.txt", "/two.txt"]);
    } finally { view.destroy(); }
  });

  test.each(["image/avif", "image/svg+xml", "image/bmp", "image/heic", "image/x-icon", "image/tiff"])("F20 %s has no embed offer that paste would discard", async (type) => {
    const view = editor([["p", "paragraph", ""]], { upload: async () => fail("unsupported") });
    try {
      insertFiles(view, [file("image", type)]);
      await tick();
      expect(items(view)[0].state).toBe("error");
      expect(view.dom.querySelector('[data-act="embed"]')).toBeNull();
      expect(items(view)[0].message).toBe("This host doesn't store files.");
    } finally { view.destroy(); }
  });
});

test("F10 a file chooser follows its host through a remote insertion", async () => {
  const { view, up } = page([["a", "paragraph", "AAAA"], ["b", "paragraph", "BBBB"]]);
  try {
    pickFiles(view, "", hostPlace(view.state, 0));
    view.dispatch(view.state.tr.insert(0, view.state.schema.nodes.paragraph.create({ id: "r", pos: "A" }, view.state.schema.text("RRRR"))).setMeta(REMOTE, true));
    const input = view.dom.parentElement.querySelector(".page-file-input");
    Object.defineProperty(input, "files", { value: [file("a.txt", "text/plain")] });
    input.dispatchEvent(new Event("change"));
    up.calls[0].resolve(ok("/a.txt"));
    await tick();
    expect(names(view)).toEqual(["RRRR", "AAAA", "/a.txt", "BBBB"]);
  } finally { view.destroy(); }
});

test("F10 accepting a chooser removes only its mapped slash query", async () => {
  const { view, up } = page([["a", "paragraph", "/image"], ["b", "paragraph", "B"]]);
  try {
    pickFiles(view, "image/*", hostPlace(view.state, 0), { from: 1, to: 7 });
    view.dispatch(view.state.tr.insertText("prefix ", 1).setMeta(REMOTE, true));
    const input = view.dom.parentElement.querySelector(".page-file-input");
    Object.defineProperty(input, "files", { value: [file()] });
    input.dispatchEvent(new Event("change"));
    up.calls[0].resolve(ok("/a.png"));
    await tick();
    expect(names(view)).toEqual(["prefix ", "/a.png", "B"]);
  } finally { view.destroy(); }
});
