import { jest } from "@jest/globals";
import { resolveModules } from "../../src/loader-logic.js";

function params(obj = {}) {
  return new URLSearchParams(obj);
}

describe("resolveModules", () => {
  test("edit mode: default plugins (richclay) + full core waves", () => {
    const { core, plugins } = resolveModules(params(), true);
    expect(core[0]).toBe("lib/mutation.js");
    expect(core).toContain("core/edit-mode.js");
    expect(core).toContain("core/snapshot.js");
    expect(core).toContain("core/save.js");
    expect(core).toContain("lib/cache-bust.js");
    expect(plugins).toEqual(["vendor/richclay.vendor.js"]);
  });

  test("view mode: drops editOnly core wave and editOnly plugins, keeps always core", () => {
    const { core, plugins } = resolveModules(params(), false);
    expect(core).toEqual(["lib/mutation.js", "core/edit-mode.js"]);
    expect(plugins).toEqual([]); // richclay is editOnly, dropped in view mode
  });

  test("view mode keeps sync + cms (not editOnly) while dropping richclay", () => {
    const { plugins } = resolveModules(params({ plugins: "sync,cms" }), false);
    expect(plugins).toEqual(["vendor/hypercms.vendor.js", "sync/live-sync.js"]);
  });

  test("plugins CSV adds listed plugins in canonical order", () => {
    const { plugins } = resolveModules(params({ plugins: "indicator,sortable,undo" }), true);
    expect(plugins).toEqual([
      "vendor/richclay.vendor.js",
      "plugins/indicator.js",
      "plugins/sortable.js",
      "plugins/undo.js",
    ]);
  });

  test("exclude CSV removes a default-on plugin", () => {
    const { plugins } = resolveModules(params({ exclude: "richclay" }), true);
    expect(plugins).toEqual([]);
  });

  test("unknown plugin name warns and is skipped (plugins param)", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { plugins } = resolveModules(params({ plugins: "bogus,indicator" }), true);
    expect(warn).toHaveBeenCalledWith('clayjs: unknown plugin "bogus"');
    expect(plugins).toEqual(["vendor/richclay.vendor.js", "plugins/indicator.js"]);
    warn.mockRestore();
  });

  test("unknown plugin name warns and is skipped (exclude param)", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    resolveModules(params({ exclude: "nope" }), true);
    expect(warn).toHaveBeenCalledWith('clayjs: unknown plugin "nope"');
    warn.mockRestore();
  });
});
