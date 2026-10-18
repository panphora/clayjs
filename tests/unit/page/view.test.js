import { gzipSync } from "node:zlib";
import { RECORD } from "./fixtures/all-kinds.js";
import { blocksOfValues, project, renderModel, revOf } from "../../../src/page/projection.js";

const fileOf = (blocks) => {
  const model = project(blocks);
  return `<!DOCTYPE html><html><body><main><article class="page" clay="freeze" data-page="1" data-rev="${revOf(model)}">\n${renderModel(model)}\n</article></main></body></html>`;
};

let view;
let stopView;
let build;
beforeAll(async () => {
  // esbuild's API checks `new TextEncoder().encode("") instanceof Uint8Array` as
  // it loads. The setup file installs node's outer-realm TextEncoder, whose
  // bytes are not the sandbox's Uint8Array; re-wrap them in this realm's.
  const NativeTextEncoder = globalThis.TextEncoder;
  globalThis.TextEncoder = class extends NativeTextEncoder {
    encode(...args) { return Uint8Array.from(super.encode(...args)); }
  };
  build = (await import("esbuild")).build;
  view = await import("../../../src/page/view.js");
});
afterAll(() => {
  stopView?.();
});

test("a newer file morphs into the frozen article; untouched blocks keep their nodes", () => {
  const base = blocksOfValues([RECORD]);
  document.documentElement.innerHTML = new DOMParser().parseFromString(fileOf(base), "text/html").documentElement.innerHTML;
  const before = {
    h: document.querySelector('[data-id="h"]'),
    tbl: document.querySelector('[data-id="tbl"]'),
    p1: document.querySelector('[data-id="p1"]'),
  };
  const next = { ...base, p1: { ...base.p1, c: "Changed by the writer", m: undefined }, n: { t: "paragraph", pos: "1V", c: "Inserted" } };
  delete next.after;
  stopView = view.startPageView(document);
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: fileOf(next), source: "disk" } }));
  const art = document.querySelector("article");
  expect(art.querySelector('[data-id="p1"]').textContent).toBe("Changed by the writer");
  expect(art.querySelector('[data-id="n"]').textContent).toBe("Inserted");
  expect(art.querySelector('[data-id="after"]')).toBeNull();
  expect(art.querySelector('[data-id="h"]')).toBe(before.h);
  expect(art.querySelector('[data-id="tbl"]')).toBe(before.tbl);
  expect(art.getAttribute("data-rev")).toBe(revOf(project(next)));
  // Whitespace between blocks may differ (the morph keeps a text node); the blocks may not.
  const squeeze = (s) => s.replace(/\n\s*/g, "\n").trim();
  expect(squeeze(art.innerHTML)).toBe(squeeze(new DOMParser().parseFromString(fileOf(next), "text/html").querySelector("article").innerHTML));
});

test("a file with the same rev changes nothing", () => {
  const art = document.querySelector("article");
  const html = "<!DOCTYPE html><html><body>" + art.outerHTML + "</body></html>";
  expect(view.applySavedArticle(html, document)).toBe(false);
});

test("a toggle the reader opened stays open across an update", async () => {
  const record = {
    blocks: {
      t: { t: "toggle", pos: "1", c: "Notes", open: false },
      x: { t: "paragraph", pos: "2", parent: "t", c: "Inside" },
      y: { t: "paragraph", pos: "3", c: "After" },
    },
    deleted: {},
  };
  const base = blocksOfValues([record]);
  document.documentElement.innerHTML = new DOMParser().parseFromString(fileOf(base), "text/html").documentElement.innerHTML;
  const stop = view.startPageView(document);
  const opened = document.querySelector('details[data-id="t"]');
  opened.querySelector("summary").click();
  // jsdom may not flip open on a summary click; a browser does.
  opened.open = true;
  await new Promise((resolve) => setTimeout(resolve, 0));
  const next = { ...base, y: { ...base.y, c: "After, edited" } };
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: fileOf(next), source: "disk" } }));
  const details = document.querySelector('details[data-id="t"]');
  expect(details.open).toBe(true);
  expect(document.querySelector('[data-id="y"]').textContent).toBe("After, edited");
  stop();
});

test("the reader code stays small and loads no ProseMirror", async () => {
  const result = await build({
    entryPoints: [new URL("../../../src/page/view.js", import.meta.url).pathname],
    bundle: true, minify: true, format: "esm", write: false, metafile: true,
    external: ["*hyper-morph.vendor.js"],
  });
  const inputs = Object.keys(result.metafile.inputs);
  expect(inputs.length).toBeGreaterThan(0);
  expect(inputs.some((p) => /prosemirror|page\/(schema|model|inline|blocks|editor|binding|replay|projection)\.js/.test(p))).toBe(false);
  expect(gzipSync(result.outputFiles[0].contents).length).toBeLessThanOrEqual(15 * 1024);
});
