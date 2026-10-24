import { cms } from "../../src/vendor/hypercms.vendor.js";

// The vendored CMS refreshes its form from the mutation hub, which the loader
// installs on window.clay. These tests commit one field and assert, so a hub
// that subscribes and never fires is all the CMS needs.
const Mutation = { onAnyChange: () => () => {} };

const RULES = { theme: { accent: "html@--color-accent" }, title: "h1" };

function mountRules(attrs = {}) {
  const el = document.createElement("script");
  el.setAttribute("data-rules-name", "cms");
  el.setAttribute("data-rules-version", "1");
  el.setAttribute("type", "application/json");
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.textContent = JSON.stringify(RULES);
  document.head.appendChild(el);
  return el;
}

beforeAll(() => {
  window.clay = { ...(window.clay || {}), Mutation };
});

beforeEach(() => {
  document.documentElement.setAttribute("style", "--color-accent: #0284c7");
  document.body.innerHTML = "<h1>Hello</h1>";
});

afterEach(() => {
  cms.close();
  document.documentElement.removeAttribute("style");
  document.body.innerHTML = "";
  document.head.querySelectorAll('script[data-rules-name="cms"]').forEach((el) => el.remove());
});

test("a ClayJS page edits a theme property through the vendored CMS", () => {
  mountRules();
  cms.open();

  const field = document.querySelector('[data-hcms-page-style] [data-hcms-path="theme.accent"]');
  expect(field).not.toBeNull();

  const swatch = field.querySelector('button[title="sky-600"]');
  expect(swatch).not.toBeNull();
  swatch.click();

  expect(document.documentElement.getAttribute("style")).toContain("--color-accent: oklch(");
});

test("a rules tag declaring the inline view mounts the inline editor", () => {
  mountRules({ "data-cms-view": "inline" });
  cms.open();

  expect(document.querySelector("hypercms-inline")).not.toBeNull();
  expect(document.querySelector(".hcms-panel")).toBeNull();
});
