/**
 * @jest-environment jsdom
 */

import { readFileSync } from "node:fs";
import { CORE_WAVES, MODULES, PLUGIN_PATHS, resolveModules } from "../../../src/loader-logic.js";
import { MODULE_SUPPORT, supportFor } from "../../../src/core/mode-support.js";

/**
 * The support table is the whole answer to "may this document switch live": one row per
 * module the loader can resolve, and an absent path is unsupported. The inventory half of
 * this file fails when a new module or plugin arrives with no lifecycle decision, so the
 * decision has to be made on purpose rather than by omission. The plan half proves the
 * check reads the resolution itself, implications, defaults, Sap roots and template
 * metadata included, and that the three templates are still kept on the guarded reload.
 */

// The paths with no support row, each with the reason it has none yet. A path the loader
// can resolve has to be a row in MODULE_SUPPORT or an entry here; this is the "not yet"
// half of the table.
const UNSUPPORTED = {
  // Imported by the loader before any plan exists, and never a resolved plan path.
  "core/is-edit-mode.js": "the mode facts every plan is resolved from, read before the plan",
  "core/draft-mode.js": "the boot params and the draft fact, read before the plan",
  "lib/region-policy.js": "the one policy both roads read, read before the plan",
  // Core paths whose session belongs to a later step.
  // Plugins: every one stays on the guarded reload until its own step lands.
  "plugins/page-view.js": "the reader the transition will own; 17b-7a",
  "plugins/cms.js": "the vendor auto-opens at import; 17b-9",
  "plugins/quickcrop.js": "reached through cms and unreviewed; 17b-9",
  "plugins/menu.js": "a persistent UI service nobody has reviewed yet",
  "plugins/wire.js": "no admission lease yet; 17b-9",
  "plugins/message.js": "unreviewed",
  "plugins/ai-edit.js": "init() returns early in view, so it cannot prepare live; 17b-9",
  "plugins/demo.js": "its own destination, not a host edit session",
  "plugins/source.js": "the accepted-byte service, unreviewed",
  "plugins/visitor-drafts.js": "the draft plan keeps its own startup",
  "plugins/bind-text.js": "its bindings belong to the application's own participant",
  "plugins/derive.js": "paints from the Sap boot hooks; a later step",
  "plugins/upgrade.js": "runs under the document-operation slot; a later step",
};

const KINDS = ["neutral", "export", "reader"];

// A row is one of those three, or a function of the module namespace that answers the
// participant for a reader-loaded module whose participant lives in its edit chunk.
const isRow = (kind) => KINDS.includes(kind) || typeof kind === "function";

const inventory = () => [
  ...new Set([
    ...Object.keys(MODULES),
    ...CORE_WAVES.always,
    ...CORE_WAVES.editOnly,
    ...Object.values(PLUGIN_PATHS).flatMap((spec) => [spec.path, spec.ownerPath]).filter(Boolean),
  ]),
];

test("every module the loader can resolve has a support row or a reasoned refusal", () => {
  const paths = inventory();
  expect(paths.length).toBeGreaterThan(0);

  // No module is left unclassified: a new plugin or core path fails here until someone
  // decides its lifecycle, and unsupported is an acceptable decision as long as it is said.
  expect(paths.filter((path) => supportFor(path) === null && !UNSUPPORTED[path])).toEqual([]);

  // A row and a refusal for the same path would be two answers to one question.
  expect(Object.keys(MODULE_SUPPORT).filter((path) => UNSUPPORTED[path] !== undefined)).toEqual([]);

  // A refusal names a path the loader can actually resolve.
  expect(Object.keys(UNSUPPORTED).filter((path) => !paths.includes(path))).toEqual([]);

  // Every row says one of the things the decision understands.
  for (const [path, kind] of Object.entries(MODULE_SUPPORT)) {
    expect({ path, kind: isRow(kind) }).toEqual({ path, kind: true });
  }

  // And an absent path is unsupported, never assumed supported.
  expect(supportFor("plugins/nothing.js")).toBeNull();
});

test("every export row's module exports a function modeParticipant", async () => {
  const rows = Object.entries(MODULE_SUPPORT).filter(([, kind]) => kind === "export");
  expect(rows.length).toBeGreaterThan(0);
  for (const [path] of rows) {
    const mod = await MODULES[path]();
    expect({ path, participant: typeof mod.modeParticipant }).toEqual({ path, participant: "function" });
  }
});

test("a row may be a function of the module, for a participant in an edit chunk", () => {
  // Generic sync is loaded by a reader, but its participant is edit-only code: the row
  // answers a promise of the participant from the module's own edit chunk, so a reader
  // never fetches it.
  const row = supportFor("sync/live-sync.js");
  expect(typeof row).toBe("function");
});

test("an empty resolution is supported, and an absent path in it is not", async () => {
  const { liveAllowed, unsupportedPaths } = await import("../../../src/core/mode-switch.js");

  expect(unsupportedPaths({ edit: { core: [], plugins: [], late: [] }, view: { plugins: [], late: [] } })).toEqual([]);
  expect(liveAllowed({ edit: { core: [], plugins: [], late: [] }, view: { plugins: [], late: [] } })).toBe(true);

  const missing = { edit: { core: [], plugins: ["plugins/nothing.js"], late: [] }, view: { plugins: [], late: [] } };
  expect(unsupportedPaths(missing)).toEqual(["plugins/nothing.js"]);
  expect(liveAllowed(missing)).toBe(false);
});

test("a plugin an implication pulls in is checked like a named one", async () => {
  const edit = resolveModules(new URLSearchParams("plugins=cms"), true, { canEdit: true });

  // `cms` was named; quickcrop arrived through IMPLIES and is in the resolution all the same.
  expect(edit.plugins).toContain("plugins/quickcrop.js");
  expect(new URLSearchParams("plugins=cms").get("plugins")).not.toContain("quickcrop");

  const { unsupportedPaths } = await import("../../../src/core/mode-switch.js");
  const blocked = unsupportedPaths({ edit, view: { plugins: [], late: [] } });
  expect(blocked).toEqual(expect.arrayContaining(["plugins/cms.js", "plugins/quickcrop.js"]));
});

test("a Sap root and template metadata are part of the resolution too", () => {
  const params = new URLSearchParams("exclude=richclay");
  const edit = resolveModules(params, true, { canEdit: true, hasSap: true, templateSource: "https://hyperclay.com/templates/kanban/hosted/latest.html" });
  expect(edit.plugins).toEqual(expect.arrayContaining(["plugins/derive.js", "plugins/upgrade.js"]));
});

const FIXTURE_DIR = new URL("../../fixtures/load/", import.meta.url);

// The fixture is the page, resolved the way the loader resolves it: root attributes, head
// metas and the query string of its own clay.js script.
function readFixture(name) {
  const html = readFileSync(new URL(name, FIXTURE_DIR), "utf8");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const clayScript = parsed.querySelector('script[src*="clay.js"]');
  const params = clayScript
    ? new URL(clayScript.getAttribute("src"), "https://clayjs.com/").search.replace(/^\?/, "")
    : "";
  const sourceMeta = parsed.querySelector('meta[name="hyper-source"]');
  return {
    params: new URLSearchParams(params),
    hasSap: Boolean(parsed.querySelector("[sap]")),
    templateSource: sourceMeta ? sourceMeta.getAttribute("content") : null,
  };
}

test.each(["document.html", "kanban.html", "journal.html"])(
  "the %s plans are still unsupported, and the test says what blocks them",
  async (name) => {
    const fixture = readFixture(name);
    const options = { hasSap: fixture.hasSap, canEdit: true, templateSource: fixture.templateSource };
    const edit = resolveModules(fixture.params, true, options);
    const view = resolveModules(fixture.params, false, options);

    const { unsupportedPaths } = await import("../../../src/core/mode-switch.js");
    const blocked = unsupportedPaths({ edit, view });

    console.log(`mode-support: ${name} is blocked by ${blocked.join(", ")}`);
    expect(blocked.length).toBeGreaterThan(0);
  }
);
