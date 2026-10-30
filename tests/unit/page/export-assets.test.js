/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { RECORD } from "./fixtures/all-kinds.js";
import { blocksOfValues, project } from "../../../src/page/projection.js";
import { renderExportHtml } from "../../../src/page/export-html.js";
import { canonicalUrl, inlineExportResources, isAllowedMime, remoteDependencies } from "../../../src/page/export-assets.js";
import * as exportHtml from "../../../src/page/features/export-html.js";
import { COMMAND_FEATURES } from "../../../src/page/features/registry.js";
import { runPageCommand } from "../../../src/page/editor.js";
import { editor } from "./view-helpers.js";

const exportPanel = () => document.querySelector('clay-editor-ui[data-clay-ui="page-export"]')?.shadowRoot.querySelector(".page-export-panel") ?? null;

afterEach(() => { document.body.innerHTML = ""; });

/**
 * The readable snapshot made self-contained: one request per canonical address, the
 * page's own credentials for its own origin and none for another, a streamed limit per
 * resource and in total, a timeout and a cancel that leave nothing pending. Everything
 * that cannot be carried — a cross-origin read the other origin refuses, a host that is
 * not reachable, a missing attachment, a type a reading copy does not carry, an embed
 * with no static rendering — is a named entry in the loss list, never a silent hole. A
 * complete copy holds no address in it that a browser would fetch again.
 */

const BASE = "https://example.com/notes.html";
const PNG = "image/png";
const encode = (text) => new TextEncoder().encode(text);
const dataUrl = (type, text) => `data:${type};base64,${btoa(text)}`;

const docOf = (html) => new DOMParser().parseFromString(html, "text/html");

// A response as the download transport hands it over: counted as it streams, so a
// resource is refused at the chunk that crosses its limit.
const respond = (body = "", { type = PNG, status = 200, length = null } = {}) => {
  const parts = (Array.isArray(body) ? body : [body]).map((part) => encode(part));
  let at = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => {
        const key = String(name).toLowerCase();
        if (key === "content-type") return type;
        if (key === "content-length") return length == null ? null : String(length);
        return null;
      },
    },
    body: {
      getReader: () => ({
        read: () => (at < parts.length ? Promise.resolve({ done: false, value: parts[at++] }) : Promise.resolve({ done: true, value: undefined })),
        cancel: () => { at = parts.length; return Promise.resolve(); },
      }),
    },
  };
};

// A fetch that answers from a route table and remembers every ask: the URL, the
// credentials it was owed and the signal it was given.
const serve = (routes = {}) => {
  const calls = [];
  const fetchImpl = (url, init = {}) => {
    calls.push({ url, credentials: init.credentials, signal: init.signal });
    const route = routes[url];
    if (typeof route === "function") return route(url, init);
    if (route) return Promise.resolve(route);
    return Promise.reject(new TypeError(`no route for ${url}`));
  };
  return { fetchImpl, calls };
};

const page = (body) => `<!DOCTYPE html><html><head><title>Notes</title></head><body><article data-page="1">${body}</article></body></html>`;
const inline = (html, resources, options = {}) => inlineExportResources(html, { resources, base: BASE, ...options });
const codes = (result) => result.losses.map((entry) => entry.code);

// The rich page: the snapshot renderer's own fixture, with an image, a cover, a
// picture named three ways in preserved markup and an attachment that has bytes.
const rich = () => {
  const record = JSON.parse(JSON.stringify(RECORD));
  record.blocks.h = { ...record.blocks.h, pageIcon: "\u{1F680}", pageCoverSrc: "/uploads/cover.jpg", pageCoverAlt: "The team" };
  record.blocks.img.src = "/uploads/dip.png";
  record.blocks.file = { t: "file", pos: "Z", src: "/uploads/relay.png", name: "relay.png", size: 12, mime: PNG };
  record.blocks.kept = {
    t: "preserved",
    pos: "a",
    html: '<img src="/uploads/kept.png" srcset="/uploads/kept.png 1x, /uploads/kept-2.png 2x"><link rel="stylesheet" href="https://cdn.test/theme.css"><script src="https://cdn.test/app.js"></script><p style="background:url(/uploads/kept.png)">With a picture behind it</p>',
  };
  return record;
};

const snapshot = (record = rich()) => renderExportHtml(project(blocksOfValues([record])));

// The page the export command is asked for: a title, a line, and one picture from the
// page's own origin.
const PAGE = [
  ["h", "heading", "Relay launch review", { level: 1 }],
  ["p", "paragraph", "Before the edit"],
  ["i", "image", "", { src: "/uploads/dip.png", alt: "Dip", caption: "" }],
];
const HOSTILE = [["h", "heading", "Relay launch review", { level: 1 }], ["i", "image", "", { src: "javascript:alert(1)", alt: "", caption: "" }]];

// One held answer: the fetch the test releases when it decides the peer has edited.
let openAnswer = null;
const held = () => new Promise((resolve) => { openAnswer = resolve; });
const release = () => openAnswer?.(respond("dip"));

const open = ({ routes = UPLOADS, download = () => true, now = () => new Date("2026-10-27T09:30:00Z"), blocks = PAGE } = {}) => {
  const view = editor(blocks);
  const feature = exportHtml.createFeature({ view, fetch: serve(routes).fetchImpl, download, now });
  return { view, feature };
};
const UPLOADS = {
  "https://example.com/uploads/cover.jpg": () => respond("cover", { type: "image/jpeg" }),
  "https://example.com/uploads/dip.png": () => respond("dip"),
  "https://example.com/uploads/kept.png": () => respond("kept"),
  "https://example.com/uploads/kept-2.png": () => respond("kept-2"),
  "https://example.com/uploads/relay.png": () => respond("relay"),
};

test("one address is one request, whatever spelling the document uses", async () => {
  const { fetchImpl, calls } = serve({ "https://example.com/uploads/one.png": () => respond("one") });
  const result = await inline(page('<img src="/uploads/one.png"><img src="/uploads/./one.png#top"><img src="https://example.com/uploads/one.png">'), [
    { kind: "image", url: "/uploads/one.png", blockId: "a", inline: false },
    { kind: "image", url: "/uploads/./one.png#top", blockId: "b", inline: false },
    { kind: "image", url: "https://example.com/uploads/one.png", blockId: "c", inline: false },
  ], { fetch: fetchImpl });

  expect(calls.length).toBe(1);
  expect(calls[0].url).toBe("https://example.com/uploads/one.png");
  expect(result.losses).toEqual([]);
  expect(result.embedded).toBe(1);
  const srcs = [...docOf(result.html).querySelectorAll("img")].map((el) => el.getAttribute("src"));
  expect(srcs).toEqual([dataUrl(PNG, "one"), dataUrl(PNG, "one"), dataUrl(PNG, "one")]);
});

test("an address is canonical before the duplicate check", () => {
  expect(canonicalUrl("/a/../b/./c.png", BASE)).toBe("https://example.com/b/c.png");
  expect(canonicalUrl("c.png#frag", "https://example.com/dir/notes.html")).toBe("https://example.com/dir/c.png");
  expect(canonicalUrl("//cdn.test/x.png", BASE)).toBe("https://cdn.test/x.png");
  expect(canonicalUrl("  /uploads/a.png  ", BASE)).toBe("https://example.com/uploads/a.png");
  expect(canonicalUrl("", BASE)).toBeNull();
  expect(canonicalUrl("#frag", BASE)).toBeNull();
});

test("the page's own image is read with its credentials, another origin's without", async () => {
  const { fetchImpl, calls } = serve({
    "https://example.com/uploads/private.png": () => respond("mine"),
    "https://cdn.test/public.png": () => respond("theirs"),
  });
  const result = await inline(page('<img src="/uploads/private.png"><img src="https://cdn.test/public.png">'), [
    { kind: "image", url: "/uploads/private.png", blockId: "mine", inline: false },
    { kind: "image", url: "https://cdn.test/public.png", blockId: "theirs", inline: false },
  ], { fetch: fetchImpl });

  expect(result.losses).toEqual([]);
  const byUrl = Object.fromEntries(calls.map((call) => [call.url, call.credentials]));
  expect(byUrl["https://example.com/uploads/private.png"]).toBe("include");
  expect(byUrl["https://cdn.test/public.png"]).toBe("omit");
});

test("a cross-origin read the other origin refuses is a named loss, not a broken image", async () => {
  const { fetchImpl } = serve({ "https://cdn.test/locked.png": () => Promise.reject(new TypeError("Failed to fetch")) });
  const result = await inline(page('<img src="https://cdn.test/locked.png" alt="Locked">'), [
    { kind: "image", url: "https://cdn.test/locked.png", blockId: "img", inline: false },
  ], { fetch: fetchImpl });

  expect(codes(result)).toEqual(["cross-origin-cors"]);
  expect(result.losses[0].message).toContain("cdn.test");
  expect(result.losses[0].blockId).toBe("img");
  expect(docOf(result.html).querySelector("img").hasAttribute("src")).toBe(false);
});

test("an offline local host names the host that was not reachable", async () => {
  const { fetchImpl } = serve({ "http://localhost:8787/uploads/a.png": () => Promise.reject(new TypeError("Failed to fetch")) });
  const result = await inlineExportResources(page('<img src="/uploads/a.png">'), {
    resources: [{ kind: "image", url: "/uploads/a.png", blockId: "img", inline: false }],
    base: "http://localhost:8787/page.html",
    fetch: fetchImpl,
  });

  expect(codes(result)).toEqual(["offline-host"]);
  expect(result.losses[0].message).toContain("not reachable");
  expect(result.losses[0].url).toBe("http://localhost:8787/uploads/a.png");
});

test("a resource over its streamed limit stops at the chunk that crossed it", async () => {
  const { fetchImpl, calls } = serve({ "https://example.com/uploads/big.png": () => respond(["aaaa", "bbbbbbbb", "cccc"]) });
  const result = await inline(page('<img src="/uploads/big.png">'), [
    { kind: "image", url: "/uploads/big.png", blockId: "img", inline: false },
  ], { fetch: fetchImpl, limits: { perResource: 8 } });

  expect(calls.length).toBe(1);
  expect(codes(result)).toEqual(["too-large"]);
  expect(result.losses[0].message).toContain("8");
  expect(result.embedded).toBe(0);
});

test("a declared length over the limit is refused before a byte is read", async () => {
  const { fetchImpl } = serve({ "https://example.com/uploads/big.png": () => respond("aaaa", { length: 40 }) });
  const result = await inline(page('<img src="/uploads/big.png">'), [
    { kind: "image", url: "/uploads/big.png", blockId: "img", inline: false },
  ], { fetch: fetchImpl, limits: { perResource: 16 } });

  expect(codes(result)).toEqual(["too-large"]);
});

test("the total limit holds across resources, not only inside each one", async () => {
  const { fetchImpl } = serve({
    "https://example.com/uploads/a.png": () => respond("aaaaaa"),
    "https://example.com/uploads/b.png": () => respond("bbbbbb"),
  });
  const result = await inline(page('<img src="/uploads/a.png"><img src="/uploads/b.png">'), [
    { kind: "image", url: "/uploads/a.png", blockId: "a", inline: false },
    { kind: "image", url: "/uploads/b.png", blockId: "b", inline: false },
  ], { fetch: fetchImpl, limits: { total: 10, inFlight: 1 } });

  expect(codes(result)).toEqual(["total-too-large"]);
  expect(result.embedded).toBe(1);
  const srcs = [...docOf(result.html).querySelectorAll("img")].map((el) => el.getAttribute("src"));
  expect(srcs.filter(Boolean)).toEqual([dataUrl(PNG, "aaaaaa")]);
});

test("a type a reading copy does not carry is named, and the types it does carry go in", async () => {
  expect(isAllowedMime("image/png")).toBe(true);
  expect(isAllowedMime("image/jpeg; charset=binary")).toBe(true);
  expect(isAllowedMime("font/woff2")).toBe(true);
  expect(isAllowedMime("audio/mpeg")).toBe(true);
  expect(isAllowedMime("video/mp4")).toBe(true);
  expect(isAllowedMime("image/svg+xml")).toBe(false);
  expect(isAllowedMime("text/html")).toBe(false);
  expect(isAllowedMime("application/pdf")).toBe(false);
  expect(isAllowedMime("")).toBe(false);
  expect(isAllowedMime("application/pdf", "attachment")).toBe(true);
  expect(isAllowedMime("application/zip", "attachment")).toBe(true);
  expect(isAllowedMime("text/plain", "attachment")).toBe(true);
  expect(isAllowedMime("text/html", "attachment")).toBe(false);
  expect(isAllowedMime("image/svg+xml", "attachment")).toBe(false);
  expect(isAllowedMime("application/xhtml+xml", "attachment")).toBe(false);
  expect(isAllowedMime("application/javascript", "attachment")).toBe(false);
  expect(isAllowedMime("", "attachment")).toBe(false);

  const { fetchImpl } = serve({
    "https://example.com/uploads/page.html": () => respond("<script>alert(1)</script>", { type: "text/html" }),
    "https://example.com/uploads/pic.png": () => respond("pic"),
    "https://example.com/uploads/text.woff2": () => respond("font", { type: "font/woff2" }),
  });
  const result = await inline(page('<img src="/uploads/page.html"><img src="/uploads/pic.png"><img src="/uploads/text.woff2">'), [
    { kind: "image", url: "/uploads/page.html", blockId: "bad", inline: false },
    { kind: "image", url: "/uploads/pic.png", blockId: "pic", inline: false },
    { kind: "attachment", url: "/uploads/text.woff2", blockId: "font", inline: false },
  ], { fetch: fetchImpl });

  expect(codes(result)).toEqual(["mime-refused"]);
  expect(result.losses[0].message).toContain("text/html");
  expect(result.embedded).toBe(2);
  expect(result.html).toContain(dataUrl(PNG, "pic"));
  expect(result.html).toContain(dataUrl("font/woff2", "font"));
});

test("a resource that never arrives times out and leaves its request closed", async () => {
  const signals = [];
  const { fetchImpl } = serve({
    "https://example.com/uploads/slow.png": (url, init) => {
      signals.push(init.signal);
      return new Promise((_, no) => init.signal.addEventListener("abort", () => no(new Error("aborted"))));
    },
  });
  const result = await inline(page('<img src="/uploads/slow.png">'), [
    { kind: "image", url: "/uploads/slow.png", blockId: "img", inline: false },
  ], { fetch: fetchImpl, limits: { timeout: 10 } });

  expect(codes(result)).toEqual(["timeout"]);
  expect(signals[0].aborted).toBe(true);
});

test("a cancel closes every request still open and asks for nothing else", async () => {
  const signals = [];
  const { fetchImpl, calls } = serve({
    "https://example.com/uploads/a.png": (url, init) => {
      signals.push(init.signal);
      return new Promise((_, no) => init.signal.addEventListener("abort", () => no(new Error("aborted"))));
    },
    "https://example.com/uploads/b.png": (url, init) => { signals.push(init.signal); return Promise.resolve(respond("b")); },
  });
  const stop = new AbortController();
  const pending = inline(page('<img src="/uploads/a.png"><img src="/uploads/b.png"><img src="/uploads/c.png">'), [
    { kind: "image", url: "/uploads/a.png", blockId: "a", inline: false },
    { kind: "image", url: "/uploads/b.png", blockId: "b", inline: false },
    { kind: "image", url: "/uploads/c.png", blockId: "c", inline: false },
  ], { fetch: fetchImpl, signal: stop.signal, limits: { inFlight: 1 } });

  await new Promise((done) => setTimeout(done, 5));
  expect(calls.length).toBe(1);
  stop.abort();
  const result = await pending;

  expect(codes(result)).toEqual(["cancelled", "cancelled", "cancelled"]);
  expect(calls.length).toBe(1);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(result.embedded).toBe(0);
});

test("a missing attachment is named by its block, and its link is left with nothing to open", async () => {
  const { fetchImpl } = serve({ "https://example.com/uploads/relay.pdf": () => respond("gone", { status: 404, type: "application/pdf" }) });
  const record = rich();
  record.blocks.file.src = "/uploads/relay.pdf";
  const { html, resources } = snapshot(record);
  const result = await inline(html, resources, { fetch: fetchImpl });

  const missing = result.losses.filter((entry) => entry.code === "missing-resource");
  expect(missing.length).toBe(1);
  expect(missing[0].kind).toBe("attachment");
  expect(missing[0].blockId).toBe("file");
  expect(missing[0].message).toContain("404");
  const file = docOf(result.html).querySelector('[data-type="file"]');
  expect(file.querySelector("a[href]")).toBeNull();
  expect(file.hasAttribute("data-src")).toBe(false);
});

test("an embed with no static rendering is named and removed from the file", async () => {
  const result = await inline(page('<iframe src="https://example.com/embed"></iframe><p>After it</p>'), [
    { kind: "embed", url: "https://example.com/embed", blockId: "frame", inline: false },
  ]);

  expect(codes(result)).toEqual(["unsupported-embed"]);
  expect(result.losses[0].blockId).toBe("frame");
  expect(result.losses[0].message).toContain("frame");
  const doc = docOf(result.html);
  expect(doc.querySelector("iframe")).toBeNull();
  expect(doc.body.textContent).toContain("After it");
});

test("an attachment the host answers with is carried inside the file", async () => {
  const { html, resources } = snapshot();
  const result = await inline(html, resources, { fetch: serve(UPLOADS).fetchImpl });

  expect(result.losses).toEqual([]);
  expect(result.embedded).toBe(5);
  const file = docOf(result.html).querySelector('[data-type="file"]');
  expect(file.querySelector("a[href]").getAttribute("href")).toBe(dataUrl(PNG, "relay"));
  expect(file.getAttribute("data-src")).toBe(dataUrl(PNG, "relay"));
});

test("the parsed file has no automatic remote dependency", async () => {
  const { html, resources } = snapshot();
  const result = await inline(html, resources, { fetch: serve(UPLOADS).fetchImpl });
  expect(result.losses).toEqual([]);

  const doc = docOf(result.html);
  const found = [];
  for (const el of doc.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    for (const { name, value } of [...el.attributes]) {
      const attr = name.toLowerCase();
      const resource = ["src", "srcset", "poster", "data", "data-src", "xlink:href"].includes(attr)
        || (attr === "href" && ["link", "script", "base"].includes(tag));
      if (!resource) continue;
      const parts = attr === "srcset" ? String(value).split(",").map((part) => part.trim().split(/\s+/)[0]) : [value];
      for (const part of parts) if (part) found.push({ tag, attr, value: part });
    }
    const style = el.getAttribute("style");
    if (style) for (const at of style.matchAll(/url\s*\(\s*['"]?([^'")]+)/gi)) found.push({ tag, attr: "style", value: at[1] });
  }
  for (const el of doc.querySelectorAll("style")) {
    for (const at of String(el.textContent).matchAll(/(?:url\s*\(\s*['"]?|@import\s+['"])([^'")]+)/gi)) found.push({ tag: "style", attr: "text", value: at[1] });
  }

  expect(found.length).toBeGreaterThan(2);
  const remote = found.filter((entry) => !/^(?:data:|#)/i.test(entry.value));
  expect(remote).toEqual([]);
  expect(remoteDependencies(result.html)).toEqual([]);
});

test("the live snapshot is taken once: a peer's edit during the fetch never reaches the file", async () => {
  const downloads = [];
  const { feature, view } = open({
    routes: { "https://example.com/uploads/dip.png": () => held() },
    download: (file) => { downloads.push(file); return true; },
  });
  const pending = feature.run();
  await new Promise((done) => setTimeout(done, 5));
  expect(document.querySelector('clay-editor-ui[data-clay-ui="page-export"]')).toBeNull();
  view.dispatch(view.state.tr.insertText("after", view.state.doc.child(1).nodeSize - 1));
  release();
  const answer = await pending;

  expect(answer.ok).toBe(true);
  exportPanel().querySelector('[data-act="download"]').click();
  expect(downloads.length).toBe(1);
  const text = docOf(downloads[0].html).querySelector("article").textContent;
  expect(text).toContain("Before the edit");
  expect(text).not.toContain("Before the edit after");
  feature.dispose();
});

test("a complete copy shows its captured title and time, and downloads only when asked", async () => {
  const downloads = [];
  const { feature } = open({ download: (file) => { downloads.push(file); return true; }, now: () => new Date("2026-10-27T09:30:00Z") });
  const answer = await feature.run();

  expect(answer.ok).toBe(true);
  expect(answer.name).toBe("Relay launch review.html");
  expect(downloads).toEqual([]);
  const panel = exportPanel();
  expect(panel.textContent).toContain("Relay launch review");
  expect(panel.dataset.at).toBe("2026-10-27T09:30:00.000Z");
  expect(panel.querySelectorAll(".page-export-losses li").length).toBe(0);
  expect(panel.querySelectorAll("[data-act]").length).toBe(2);

  panel.querySelector('[data-act="download"]').click();
  expect(downloads.length).toBe(1);
  expect(downloads[0].name).toBe("Relay launch review.html");
  const doc = docOf(downloads[0].html);
  expect(doc.querySelector("figure[data-type=\"image\"] img").getAttribute("src")).toBe(dataUrl(PNG, "dip"));
  expect(remoteDependencies(downloads[0].html)).toEqual([]);
  expect(document.querySelector('clay-editor-ui[data-clay-ui="page-export"]')).toBeNull();
  feature.dispose();
});

test("every loss is listed before anything downloads, and nothing downloads", async () => {
  const downloads = [];
  const { feature } = open({
    routes: { "https://example.com/uploads/dip.png": () => respond("gone", { status: 404 }) },
    download: (file) => { downloads.push(file); return true; },
  });
  const answer = await feature.run();

  expect(answer.ok).toBe(false);
  expect(answer.code).toBe("resource-losses");
  expect(answer.losses.map((entry) => entry.code)).toEqual(["missing-resource"]);
  const panel = exportPanel();
  const said = [...panel.querySelectorAll(".page-export-losses li")].map((li) => li.textContent);
  expect(said.length).toBe(1);
  expect(said[0]).toContain("https://example.com/uploads/dip.png");
  expect(said[0]).toContain("404");
  expect(panel.querySelector('[data-act="download"]')).toBeNull();
  expect(panel.querySelector('[data-act="retry"]')).not.toBeNull();
  expect(downloads).toEqual([]);
  feature.dispose();
});

test("a refusal to render is listed too, never a silent absence", async () => {
  const downloads = [];
  const { feature } = open({ download: (file) => { downloads.push(file); return true; }, blocks: HOSTILE });
  const answer = await feature.run();

  expect(answer.ok).toBe(false);
  expect(answer.code).toBe("unsafe-url");
  const panel = exportPanel();
  expect(panel.querySelectorAll(".page-export-losses li").length).toBe(1);
  expect(panel.querySelector('[data-act="download"]')).toBeNull();
  expect(downloads).toEqual([]);
  feature.dispose();
});

test("a command left while its resources are still arriving paints nothing", async () => {
  const downloads = [];
  const { feature } = open({
    routes: { "https://example.com/uploads/dip.png": () => held() },
    download: (file) => { downloads.push(file); return true; },
  });
  const pending = feature.run();
  await new Promise((done) => setTimeout(done, 5));
  feature.dispose();
  release();
  const answer = await pending;

  expect(answer).toEqual({ ok: false, code: "not-editing" });
  expect(document.querySelector('clay-editor-ui[data-clay-ui="page-export"]')).toBeNull();
  expect(downloads).toEqual([]);
});

test("the export command is its own lazy row, and the registry runs it on an editor", async () => {
  expect(Object.hasOwn(COMMAND_FEATURES, "exportHtml")).toBe(true);
  expect(COMMAND_FEATURES.exportHtml.module).toBe("page/features/export-html.js");

  const view = editor(PAGE);
  const original = globalThis.fetch;
  globalThis.fetch = serve({ "https://example.com/uploads/dip.png": () => respond("dip") }).fetchImpl;
  try {
    const answer = await runPageCommand(view, "exportHtml");
    expect(answer.ok).toBe(true);
    expect(answer.title).toBe("Relay launch review");
    expect(answer.name).toBe("Relay launch review.html");
    const panel = exportPanel();
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll(".page-export-losses li").length).toBe(0);
  } finally {
    globalThis.fetch = original;
  }
});
