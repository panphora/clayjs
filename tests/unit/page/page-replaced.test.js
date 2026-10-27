/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { buildPageValue, seedClientId } from "../../../src/page/ybind/migrate.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { renderFromTags } from "../../../src/page/save-projection.js";

/**
 * A page tab whose page was replaced. A host keeps the page editor's merge state
 * beside the file and composes it back only while it still belongs to the article,
 * so a document with no page tag and a new article rev is a page this tab no
 * longer edits. It stops sending page edits, stops saving, and says so. A tagless
 * document whose article rev is unchanged is an outside edit to something else and
 * is ignored, as today; a tag-bearing document is handled as today. A room that
 * answers the page store's frames with unknown-store is the same news.
 */

const BLOCKS = [
  { id: "h", t: "heading", text: "Notes" },
  { id: "p", t: "paragraph", text: "Hello" },
];
const TAG_SEL = 'script[type="application/json"][merge="page"][clay~="live"]';
const TOOLS_SEL = 'script[type="application/json"][merge="page.tools"][clay~="live"]';
const REPLACED_TEXT = "This page was changed outside the editor. Reload to see it.";
const clone = (v) => JSON.parse(JSON.stringify(v));
const flushAsync = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const until = async (done, timeout = 500) => {
  const deadline = Date.now() + timeout;
  while (!done() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
};

const pageHtml = (value = seedValue(BLOCKS)) => {
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const tagHtml = (value, { name = "page" } = {}) =>
  `<script type="application/json" merge="${name}" clay="live">${JSON.stringify(value)}</script>`;
const revOf = (html) => new DOMParser().parseFromString(html, "text/html").querySelector("article[data-page]").getAttribute("data-rev");
const docOf = (head, body) => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const outsideEdit = (rev, text) =>
  docOf("", `<article data-page="1" data-rev="${rev}"><h1 data-id="h">Notes</h1><p data-id="p">${text}</p></article>`);
const blockStart = (view, id) => {
  let pos = null;
  view.state.doc.forEach((node, offset) => {
    if (node.attrs.id === id) pos = offset + 1;
  });
  return pos;
};
const textEnd = (view, id) => blockStart(view, id) + view.state.doc.nodeAt(blockStart(view, id) - 1).content.size;
const replaceText = (view, id, from, to, text) => {
  const start = blockStart(view, id);
  view.dispatch(view.state.tr.insertText(text, start + from, start + to));
};

const toastText = () => document.querySelector("[data-clay-toast]")?.textContent ?? "";
const toastActions = () => [...(document.querySelector("[data-clay-toast]")?.querySelectorAll("button") ?? [])]
  .filter((b) => b.textContent).map((b) => b.textContent);
// The toast stack arrives on the first toast, so a notice is waited for rather than
// assumed to be in the same tick.
const waitForToast = (fragment = "") => until(() => toastText().includes(fragment));

const syncFromDisk = async (html) => {
  let adopted = 0;
  const onAdopted = () => { adopted += 1; };
  document.addEventListener("clay:page-adopted", onAdopted);
  try {
    document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { source: "disk", html } }));
    await until(() => adopted > 0);
    await flushAsync();
    return adopted;
  } finally {
    document.removeEventListener("clay:page-adopted", onAdopted);
  }
};

const roomState = (room) => ({
  epoch: room.epoch, seq: room.seq, writer: room.writer, conn: 0,
  stores: clone(room.stores),
});

let current = null;

async function load({ html = pageHtml(), head = "", liveData = false, answer = () => ({ status: 200, body: { msg: "Saved", etag: "stamp-2" } }) } = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  document.documentElement.removeAttribute("documentetag");
  document.head.innerHTML = head;
  document.body.innerHTML = html;

  const saves = [];
  const sent = [];
  const handlersRef = { h: null };
  const room = { epoch: "e1", seq: 0, writer: null, stores: {} };

  const extensions = liveData ? ["page", "live-data"] : ["page"];

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions, document: { etag: "stamp-1" } }),
    hostSupports: async (name) => extensions.includes(name),
    hostMetaOutcome: () => "ok",
    querySaveOutcome: () => null,
    resetHostMeta: () => ({}),
  }));

  await jest.unstable_mockModule("../../../src/live/local-lane.js", () => ({
    localLaneSupported: () => false,
    localTransport: () => ({}),
  }));

  await jest.unstable_mockModule("../../../src/live/server-lane.js", () => ({
    serverTransport: () => ({
      start(handlers) {
        handlersRef.h = handlers;
        handlers.open({ clientId: "tab-1", lane: "live" });
        handlers.state(roomState(room));
        return () => {};
      },
      async send(clientId, frame) {
        sent.push(clone(frame));
        room.seq += 1;
        if (room.writer === null) room.writer = clientId;
        handlersRef.h?.writer({ epoch: room.epoch, writer: room.writer, landed: null });
        return { status: 200, body: { seq: room.seq, epoch: room.epoch } };
      },
      async fetchState() {
        return roomState(room);
      },
    }),
  }));

  global.fetch = jest.fn(async (url, options) => {
    const reply = answer(saves.length);
    saves.push({ url: String(url), headers: options?.headers ?? {}, body: String(options?.body ?? "") });
    const status = reply.status ?? 200;
    return {
      ok: status < 400,
      status,
      statusText: "",
      headers: { get: () => null },
      text: async () => JSON.stringify(reply.body ?? {}),
    };
  });

  const { live, storeOf } = await import("../../../src/plugins/live.js");
  window.clay = { live };
  const { page } = await import("../../../src/plugins/page.js");
  current = page;
  return { page, storeOf, saves, sent, room };
}

afterEach(() => {
  try { current?.dispose(); } catch {}
  current = null;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("with rooms (live-data), a tagless incoming document with a new article rev stops the tab and offers reload and download", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const { page, storeOf, saves, sent } = await load({ html, head: tagHtml(value), liveData: true });

  await page.ready;
  expect(page.view).toBeTruthy();
  const store = storeOf("page");
  const before = JSON.stringify(store.value);

  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { source: "peer", html: docOf("", pageHtml(seedValue([{ id: "p", t: "paragraph", text: "Replaced" }]))) },
  }));

  await waitForToast(REPLACED_TEXT);
  expect(toastText()).toContain(REPLACED_TEXT);
  expect(toastActions()).toEqual(["Reload", "Download your copy"]);
  expect(page.view.editable).toBe(false);

  // The editor is read-only and detached: a local edit makes no page frame and
  // changes nothing the next save could carry.
  page.view.dispatch(page.view.state.tr.insertText("!", 6));
  await flushAsync();
  expect(JSON.stringify(store.value)).toBe(before);
  expect(sent.filter((frame) => frame.name === "page")).toHaveLength(0);

  // And no save leaves the tab, even one asked for explicitly.
  const save = await import("../../../src/core/save.js");
  await expect(save.savePageForce()).resolves.toMatchObject({ ok: false, msgType: "skipped" });
  expect(saves).toHaveLength(0);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("a tagless incoming document with the same article rev is an outside edit elsewhere: editing continues", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const rev = revOf(html);
  const { page, storeOf, saves } = await load({ html, head: tagHtml(value) });

  await page.ready;
  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { source: "peer", html: docOf("", `<main><article data-page="1" data-rev="${rev}"><h1 data-id="h">Notes</h1><p data-id="p">Hello</p></article><footer>Footer</footer></main>`) },
  }));

  expect(toastText()).toBe("");
  expect(page.view.editable).toBe(true);

  page.view.dispatch(page.view.state.tr.insertText("!", 6));
  await flushAsync();
  expect(blocksFromYValue(storeOf("page").value).h.c).toBe("Notes!");
  expect(saves).toHaveLength(0);
});

// Its seed is another page's history, so the tab stops editing rather than merge two
// unrelated pages; the same page's tag arriving again changes nothing.
test("an incoming document that carries another page's tag is a replacement", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  // Seeded the way a page built from its article is: its Yjs client comes from its content.
  const otherBlocks = { p: { t: "paragraph", pos: "00000001", c: "Elsewhere" } };
  const other = buildPageValue([{ blocks: otherBlocks }], seedClientId(otherBlocks));
  const { page } = await load({ html, head: tagHtml(value) });

  await page.ready;
  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { source: "peer", html: docOf(tagHtml(value), pageHtml(value)) },
  }));
  await flushAsync();
  expect(toastText()).toBe("");
  expect(page.view.editable).toBe(true);

  document.dispatchEvent(new CustomEvent("clay:sync-applied", {
    detail: { source: "peer", html: docOf(tagHtml(other), pageHtml(other)) },
  }));
  await flushAsync();
  await waitForToast("Download your copy");
  expect(toastText()).toContain("Download your copy");
  expect(page.view.editable).toBe(false);
});

test("an unknown-store refusal of the page store's frames shows the notice", async () => {
  const value = seedValue(BLOCKS);
  const { page, storeOf } = await load({ html: pageHtml(value), head: tagHtml(value) });

  await page.ready;
  storeOf("page").deliver({ phase: "left", code: "no-store", n: 1 });

  await waitForToast(REPLACED_TEXT);
  expect(toastText()).toContain(REPLACED_TEXT);
  expect(toastActions()).toEqual(["Reload", "Download your copy"]);
  expect(page.view.editable).toBe(false);
});

test("a downloaded copy carries no page merge state, and keeps the article and the tool store", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const { page } = await load({ html, head: tagHtml(value) + tagHtml({}, { name: "page.tools" }) });

  await page.ready;
  expect(document.querySelector(TAG_SEL)).toBeTruthy();

  const blobs = [];
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  URL.createObjectURL = jest.fn((blob) => { blobs.push(blob); return "blob:page-copy"; });
  URL.revokeObjectURL = jest.fn();
  try {
    const { downloadPageCopy } = await import("../../../src/page/save-states.js");
    expect(downloadPageCopy()).toBe(true);
    expect(blobs).toHaveLength(1);

    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blobs[0]);
    });
    const copy = new DOMParser().parseFromString(text, "text/html");
    expect(copy.querySelector(TAG_SEL)).toBe(null);
    expect(text).not.toContain('merge="page"');
    expect(copy.querySelector(TOOLS_SEL)).toBeTruthy();
    expect(copy.querySelector("article[data-page]").innerHTML).toContain("Hello");
  } finally {
    click.mockRestore();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  }
});

test("on a host with no rooms, an outside edit to one block merges into the tab", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const { page, storeOf } = await load({ html, head: tagHtml(value) });

  await page.ready;
  await syncFromDisk(outsideEdit(revOf(html), "Hello from outside"));
  await until(() => blocksFromYValue(storeOf("page").value).p.c === "Hello from outside");

  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello from outside");
  expect(toastText()).toBe("");
  expect(page.view.editable).toBe(true);
});

test("an outside edit and the tab's own typing in another block are both kept", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const { page, storeOf } = await load({ html, head: tagHtml(value) });

  await page.ready;
  page.view.dispatch(page.view.state.tr.insertText("!", 6));
  await flushAsync();
  expect(blocksFromYValue(storeOf("page").value).h.c).toBe("Notes!");

  await syncFromDisk(outsideEdit(revOf(html), "Hello from outside"));
  await until(() => blocksFromYValue(storeOf("page").value).p.c === "Hello from outside");

  expect(blocksFromYValue(storeOf("page").value).h.c).toBe("Notes!");
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello from outside");
  expect(toastText()).toBe("");
});

test("the tab's own save coming back changes nothing and shows no notice", async () => {
  const value = seedValue(BLOCKS);
  const { page, storeOf } = await load({ html: pageHtml(value), head: tagHtml(value) });

  await page.ready;
  page.view.dispatch(page.view.state.tr.insertText("!", 6));
  await flushAsync();
  expect(blocksFromYValue(storeOf("page").value).h.c).toBe("Notes!");

  await syncFromDisk(pageHtml(storeOf("page").value));

  expect(blocksFromYValue(storeOf("page").value).h.c).toBe("Notes!");
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello");
  expect(toastText()).toBe("");
  expect(page.view.editable).toBe(true);
});

test("an untouched older copy leaves the page as it is", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const { page, storeOf } = await load({ html, head: tagHtml(value) });

  await page.ready;
  await syncFromDisk(outsideEdit(revOf(html), "Hello from outside"));
  await until(() => blocksFromYValue(storeOf("page").value).p.c === "Hello from outside");
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello from outside");

  await syncFromDisk(pageHtml(value));

  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello from outside");
  expect(toastText()).toBe("");
});

test("a second outside save that kept the rev merges against the first, not the boot file", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const rev = revOf(html);
  const { page, storeOf } = await load({ html, head: tagHtml(value) });

  await page.ready;
  await syncFromDisk(outsideEdit(rev, "Hello outside"));
  await until(() => blocksFromYValue(storeOf("page").value).p.c === "Hello outside");
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello outside");

  // The tab types over the adopted text.
  replaceText(page.view, "p", 0, "Hello outside".length, "Hello there");
  await flushAsync();
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello there");

  // A second outside save, the first edit plus a new block, with the rev kept.
  const second = docOf("", `<article data-page="1" data-rev="${rev}"><h1 data-id="h">Notes</h1><p data-id="p">Hello outside</p><p data-id="q">New from outside</p></article>`);
  await syncFromDisk(second);
  await until(() => blocksFromYValue(storeOf("page").value).q?.c === "New from outside");

  const blocks = Object.values(blocksFromYValue(storeOf("page").value));
  expect(blocks.map((b) => b.c)).toEqual(["Notes", "Hello there", "New from outside"]);
  expect(toastText()).toBe("");
});

test("an outside edit made on the tab's own saved file merges without duplicating what it typed", async () => {
  const value = seedValue(BLOCKS);
  const html = pageHtml(value);
  const { page, storeOf, saves } = await load({ html, head: tagHtml(value) });

  await page.ready;
  page.view.dispatch(page.view.state.tr.insertText(" world", textEnd(page.view, "p")));
  await flushAsync();
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello world");

  const save = await import("../../../src/core/save.js");
  const result = await save.savePageForce();
  expect(result.ok).toBe(true);
  expect(saves).toHaveLength(1);

  // The tab keeps typing after its own save.
  replaceText(page.view, "p", 6, 11, "there");
  await flushAsync();
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello there");

  // An outside edit made on the saved file: another block, its rev kept.
  const savedDoc = new DOMParser().parseFromString(saves[0].body, "text/html");
  const article = savedDoc.querySelector("article[data-page]");
  const savedRev = article.getAttribute("data-rev");
  expect(article.querySelector('[data-id="p"]').textContent).toBe("Hello world");
  article.querySelector('[data-id="h"]').textContent = "Notes from outside";
  await syncFromDisk(docOf("", article.outerHTML));

  await until(() => blocksFromYValue(storeOf("page").value).h.c === "Notes from outside");
  const blocks = Object.values(blocksFromYValue(storeOf("page").value));
  expect(blocks.map((b) => b.c)).toEqual(["Notes from outside", "Hello there"]);
  expect(toastText()).toBe("");
  expect(savedRev).toBeTruthy();
});

test("a file with no page article on a host with no rooms shows the notice", async () => {
  const value = seedValue(BLOCKS);
  const { page } = await load({ html: pageHtml(value), head: tagHtml(value) });

  await page.ready;
  await syncFromDisk(docOf("", "<main><p>Not a page</p></main>"));

  expect(toastText()).toContain(REPLACED_TEXT);
  expect(page.view.editable).toBe(false);
});

const readDownload = async (click) => {
  const blobs = [];
  URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:copy"; };
  URL.revokeObjectURL = () => {};
  const anchor = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  click();
  anchor.mockRestore();
  const text = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blobs[0]); });
  return new DOMParser().parseFromString(text, "text/html").querySelector("article[data-page]").textContent;
};
const toastButton = (label) => [...(document.querySelector("[data-clay-toast]")?.querySelectorAll("button") ?? [])].find((b) => b.textContent === label);
const appendToPage = (view, text) => {
  let end = null;
  view.state.doc.forEach((node, offset) => { if (node.attrs.id === "p") end = offset + 1 + node.content.size; });
  view.dispatch(view.state.tr.insertText(text, end));
};

// A replaced tab's store holds the replacement, so its copy is rendered from the tab's own document.
test("a tab stopped by another page's history downloads its own edits", async () => {
  const value = seedValue(BLOCKS);
  const { page, storeOf } = await load({ html: pageHtml(value), head: tagHtml(value) });
  await page.ready;
  appendToPage(page.view, " UNIQUE UNSAVED");
  await flushAsync();
  const otherBlocks = { p: { t: "paragraph", pos: "00000001", c: "Replacement article" } };
  storeOf("page").setMode("fast");
  storeOf("page").rebase(buildPageValue([{ blocks: otherBlocks }], seedClientId(otherBlocks)), { source: "state" });
  await flushAsync();
  expect(page.view.editable).toBe(false);
  await waitForToast("Download your copy");
  const text = await readDownload(() => toastButton("Download your copy").click());
  expect(text).toContain("UNIQUE UNSAVED");
  expect(text).not.toContain("Replacement article");
});

// The room refused a page update for its size: the tab stops editing and says so, and its copy keeps the edit.
test("a page update refused as too large stops the tab with a notice and keeps the edit in its copy", async () => {
  const value = seedValue(BLOCKS);
  const { page, storeOf } = await load({ html: pageHtml(value), head: tagHtml(value) });
  await page.ready;
  appendToPage(page.view, " BIG EDIT");
  await flushAsync();
  storeOf("page").deliver({ phase: "refused", code: "too-large" });
  await flushAsync();
  expect(page.view.editable).toBe(false);
  await waitForToast("That change is too large to share, so it was not saved.");
  expect(toastText()).toContain("That change is too large to share, so it was not saved.");
  const text = await readDownload(() => toastButton("Download your copy").click());
  expect(text).toContain("BIG EDIT");
});
