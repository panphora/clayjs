import { seedValue } from "../../../src/page/ybind/seed.js";
import { jest } from "@jest/globals";
import { webcrypto } from "node:crypto";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { startPageView } from "../../../src/page/view.js";

const artifact = (label) => ({
  title: label, html: "<button>Count</button><output></output>", css: "",
  javascript: "function mount(tool) { const out = tool.root.querySelector('output'); const draw = () => out.textContent = String(tool.state.data.count ?? 0); const click = () => tool.state.add(['count'], 1); tool.root.querySelector('button').addEventListener('click', click); const off = tool.on('change', draw); draw(); return () => { tool.root.querySelector('button')?.removeEventListener('click', click); off(); }; }",
  fallbackHtml: `<p>${label} fallback</p>`, summary: label,
});
const page = (rev, label, state = { count: 1 }) => {
  const value = seedValue([{ id: "tool-1", t: "tool", attrs: { artifact: artifact(label), rev, state } }]);
  const rendered = renderFromTags([JSON.stringify(value)]);
  return `<!DOCTYPE html><html><head><script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script><script type="application/json" merge="page.tools" clay="live">${JSON.stringify({ "tool-1": { [rev]: state } })}</script></head><body><article data-page="1" data-rev="${rendered.rev}">${rendered.html}</article></body></html>`;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

test("saved tools mount for readers, stay local, and remount on revision changes", async () => {
  document.documentElement.innerHTML = new DOMParser().parseFromString(page("r1", "First"), "text/html").documentElement.innerHTML;
  const stop = startPageView(document);
  await settle();
  const first = document.querySelector('section[data-type="tool"]');
  expect(first.querySelector("output").textContent).toBe("1");
  first.querySelector("button").click();
  expect(first.querySelector("output").textContent).toBe("2");
  expect(JSON.parse(document.querySelector('script[merge="page.tools"]').textContent)["tool-1"].r1.count).toBe(1);
  const button = first.querySelector("button");
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: page("r1", "First") } }));
  await settle();
  expect(document.querySelector('section[data-type="tool"] button')).toBe(button);
  expect(document.querySelector('section[data-type="tool"] output').textContent).toBe("2");
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: page("r2", "Second", { count: 5 }) } }));
  await settle();
  expect(document.querySelector('section[data-type="tool"] output').textContent).toBe("5");
  stop();
});

test("decode failure leaves the saved fallback", async () => {
  const html = page("r1", "First").replace(/"v":1/, '"v":2');
  document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const stop = startPageView(document);
  await settle();
  expect(document.querySelector('section[data-type="tool"]').textContent).toContain("First fallback");
  expect(document.querySelector('section[data-type="tool"] button')).toBeNull();
  stop(); warn.mockRestore();
});

test("a page without tool sections does not load the decoder", () => {
  document.body.innerHTML = '<article data-page="1"><p>Plain</p></article>';
  const stop = startPageView(document);
  expect(document.querySelector("article").textContent).toBe("Plain");
  stop();
});
