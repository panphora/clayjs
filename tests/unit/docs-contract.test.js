import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The site's reference tables are derived from the library, not maintained
 * alongside it.
 *
 * `wire` and `upload` both reached a published release without a single mention
 * anywhere on clayjs.com, and nothing caught it: a plugin is only "shipped" from
 * the library's point of view, and the docs are a separate act of remembering.
 * These tests do the remembering.
 */

const ROOT = new URL("../../", import.meta.url).pathname;
const site = readdirSync(join(ROOT, "website"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => readFileSync(join(ROOT, "website", f), "utf8"))
  .join("\n");

test("every loadable plugin is named somewhere on the site", async () => {
  const { PLUGIN_PATHS } = await import("../../src/loader-logic.js");

  const missing = Object.keys(PLUGIN_PATHS).filter(
    (name) => !new RegExp(`<code>${name}</code>|>${name} <span class="tag"`).test(site)
  );

  expect(missing).toEqual([]);
});

test("every clay.* member the loader attaches has a mention on the site", () => {
  const loader = readFileSync(join(ROOT, "src/loader.js"), "utf8");

  const names = new Set();
  for (const m of loader.matchAll(/\bclay\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) {
    names.add(m[1]);
  }
  const assign = loader.match(/Object\.assign\(clay,\s*\{([\s\S]*?)\}\);/);
  if (assign) {
    for (const m of assign[1].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,:]/gm)) {
      names.add(m[1]);
    }
  }

  // A guard against the regexes above silently matching nothing and the test
  // passing on an empty set.
  expect(names.size).toBeGreaterThan(10);

  const missing = [...names].filter((name) => !site.includes(`clay.${name}`));
  expect(missing).toEqual([]);
});

test("the region axes the docs list are the axes the policy returns", async () => {
  const { resolveRegionPolicy } = await import("../../src/lib/region-policy.js");
  const axes = Object.keys(resolveRegionPolicy(document.createElement("div"))).sort();

  const docs = readFileSync(join(ROOT, "website/docs.html"), "utf8");
  const row = docs.match(/The resolved region axes for a node: <code>\{([^}]*)\}<\/code>/);
  expect(row).not.toBeNull();

  const documented = row[1].split(",").map((s) => s.trim()).sort();
  expect(documented).toEqual(axes);
});

test("the region tokens the docs list are the tokens the policy defines", async () => {
  const { TOKENS } = await import("../../src/lib/region-policy.js");
  const docs = readFileSync(join(ROOT, "website/docs.html"), "utf8");

  const missing = TOKENS.filter((t) => !docs.includes(`<code>${t}</code>`));
  expect(missing).toEqual([]);
});

// The README is the npm-facing surface, and it drifted on its own: no-dirty
// landed on all three site pages while the package README still listed six
// tokens. Checking only the site is what let that through.
test("the region tokens the README lists are the tokens the policy defines", async () => {
  const { TOKENS } = await import("../../src/lib/region-policy.js");
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");

  const missing = TOKENS.filter((t) => !readme.includes(`\`${t}\``));
  expect(missing).toEqual([]);
});

// The region reference table, not just the attribute index: a token can be
// listed in the summary line and still have no row explaining what it does.
test("every region token has a row in the site's region reference", async () => {
  const { TOKENS } = await import("../../src/lib/region-policy.js");
  const advanced = readFileSync(join(ROOT, "website/advanced.html"), "utf8");

  const missing = TOKENS.filter((t) => !advanced.includes(`<td><code>${t}</code></td>`));
  expect(missing).toEqual([]);
});
