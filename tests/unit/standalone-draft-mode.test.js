/**
 * The single-file build boots its satellites before boot() reads the query. The
 * internals satellite reaches core/is-edit-mode.js, which freezes its draft-mode
 * answer as it evaluates, so a page that opted into visitor drafts was decided
 * before `plugins=visitor-drafts` was known: a visitor got view mode, with no
 * editing UI, and the owner edited the original by default.
 *
 * This runs the real bundle, built the way tests/unit/standalone-build.test.js
 * builds it, in the page a free document is.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const RULES = '{"title":"#title"}';

let bundle;
beforeAll(() => {
  execFileSync("node", ["build.js", "--standalone"], { cwd: ROOT, stdio: "pipe" });
  bundle = readFileSync(join(ROOT, "dist/clay.standalone.js"), "utf8");
}, 60000);

function bootStandalone({ params }) {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("visitor-drafts", "standalone-v1");
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
  document.body.innerHTML = '<h1 id="title">owner title</h1>';
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  localStorage.clear();
  window.history.replaceState({}, "", "/notes.html");
  window.scrollTo = () => {};
  window.scrollBy = () => {};
  window.clay = {};
  window.fetch = async () => ({ ok: false, status: 404, statusText: "Not Found", text: async () => "" });
  Object.defineProperty(document, "currentScript", {
    value: { src: "http://localhost/clay.standalone.js?" + params },
    configurable: true,
  });
  (0, eval)(bundle);
  return window.clay.ready;
}

test("a standalone page that opted in boots in draft mode, not view mode", async () => {
  const clay = await bootStandalone({ params: "plugins=visitor-drafts" });

  expect(clay.isDraftMode).toBe(true);
  expect(clay.isEditMode).toBe(true);
  expect(clay.isOwner).toBe(false);
  expect(clay.visitorDrafts.active).toBe(true);
  expect(document.documentElement.getAttribute("draftmode")).toBe("true");
});
