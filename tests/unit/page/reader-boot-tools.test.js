import { seedValue } from "../../../src/page/ybind/seed.js";
import { jest } from "@jest/globals";
import { webcrypto } from "node:crypto";
import { renderFromTags } from "../../../src/page/save-projection.js";

/**
 * A reader mounts the article's tools from what the host served, before any file
 * arrives. A static host, an offline copy and a page opened from disk never open a
 * saved stream at all, and the article has to work anyway: the saved fallback is
 * replaced by the mounted tool at boot, exactly as it is when a file does arrive.
 */

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const artifact = (label) => ({
  title: label,
  html: "<button>Count</button><output></output>",
  css: "",
  javascript:
    "function mount(tool) { const out = tool.root.querySelector('output'); const draw = () => out.textContent = String(tool.state.data.count ?? 0); const click = () => tool.state.add(['count'], 1); tool.root.querySelector('button').addEventListener('click', click); const off = tool.on('change', draw); draw(); return () => { tool.root.querySelector('button')?.removeEventListener('click', click); off(); }; }",
  fallbackHtml: `<p>${label} fallback</p>`,
  summary: label,
});

const SERVED = (rev, label, state = { count: 1 }) => {
  const value = seedValue([{ id: "tool-1", t: "tool", attrs: { artifact: artifact(label), rev, state } }]);
  const rendered = renderFromTags([JSON.stringify(value)]);
  return `<!DOCTYPE html><html><head><script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script><script type="application/json" merge="page.tools" clay="live">${JSON.stringify({ "tool-1": { [rev]: state } })}</script></head><body><article class="page" clay="freeze" data-page="1" data-rev="${rendered.rev}">${rendered.html}</article></body></html>`;
};

const sources = [];

const flush = async (times = 10) => {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const META = { ok: true, status: 200, json: async () => ({ extensions: [] }), text: async () => "", headers: { get: () => null } };

const install = () => {
  jest.resetModules();
  sources.length = 0;
  document.documentElement.innerHTML = new DOMParser().parseFromString(SERVED("r1", "First"), "text/html").documentElement.innerHTML;
  window.clay = {};
  window.clayEditMode = false;
  globalThis.EventSource = class extends EventTarget {
    static CONNECTING = 0;
    static CLOSED = 2;
    readyState = 0;
    constructor(url) {
      super();
      this.url = String(url);
      sources.push(this);
    }
    close() { this.readyState = 2; }
  };
  globalThis.fetch = jest.fn(async (url) => (
    String(url).includes("/_/meta") ? META : Promise.reject(new Error("this host serves no saved file"))
  ));
};

test("tools mount from the served article at boot when no stream ever opens", async () => {
  install();

  const { boot } = await import("../../../src/loader.js");
  await boot("https://clayjs.com/v1", new URLSearchParams("plugins=page"), () => {});
  await flush();

  // The stream exists but never opened, so no file can arrive.
  expect(sources).toHaveLength(1);
  expect(sources[0].readyState).toBe(0);

  const tool = document.querySelector('section[data-type="tool"]');
  expect(tool.querySelector("button")).not.toBeNull();
  expect(tool.querySelector("output").textContent).toBe("1");
  expect(tool.textContent).not.toContain("First fallback");

  const pageView = await import("../../../src/plugins/page-view.js");
  pageView.stop();
});

test("a file:// page opens no stream, throws nothing, and its tools still mount", async () => {
  install();

  const { start } = await import("../../../src/page/view.js");
  let reader = null;
  expect(() => {
    reader = start({ documentURL: "file:///Users/me/note.html" });
  }).not.toThrow();
  await flush();

  expect(sources).toHaveLength(0);
  expect(reader.represented).toEqual({ bytes: null, etag: null, seq: null });
  const tool = document.querySelector('section[data-type="tool"]');
  expect(tool.querySelector("output").textContent).toBe("1");
  expect(tool.textContent).not.toContain("First fallback");
  expect(() => reader.stop()).not.toThrow();
});
