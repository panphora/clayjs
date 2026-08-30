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
    expect(core).toEqual(["lib/mutation.js", "core/edit-mode.js", "core/stale-host-notice.js"]);
    expect(plugins).toEqual([]); // richclay is editOnly, dropped in view mode
  });

  test("view mode keeps sync + cms (not editOnly) while dropping richclay", () => {
    const { plugins } = resolveModules(params({ plugins: "sync,cms" }), false);
    expect(plugins).toEqual([
      "vendor/quickcrop.vendor.js",
      "vendor/hypercms.vendor.js",
      "sync/live-sync.js",
    ]);
  });

  test("upload is opt-in, edit-mode only, and loads before cms", () => {
    const { plugins } = resolveModules(params({ plugins: "upload,cms" }), true);
    expect(plugins.indexOf("plugins/upload.js")).toBeGreaterThan(-1);
    // The loader attaches each plugin's member as it lands, and cms reads what
    // earlier plugins attached during its own evaluation.
    expect(plugins.indexOf("plugins/upload.js"))
      .toBeLessThan(plugins.indexOf("vendor/hypercms.vendor.js"));
  });

  test("upload is dropped in view mode, where no file picker can appear", () => {
    const { plugins } = resolveModules(params({ plugins: "upload" }), false);
    expect(plugins).not.toContain("plugins/upload.js");
  });

  // The cms has no uploader to look up without this, so it embeds every picked
  // image in the document as a data: URL. Edit mode only, and ahead of cms in the
  // order, because cms reads what earlier plugins attached during its own
  // evaluation.
  test("cms implies upload, in edit mode, ahead of cms", () => {
    const { plugins } = resolveModules(params({ plugins: "cms" }), true);
    expect(plugins).toContain("plugins/upload.js");
    expect(plugins.indexOf("plugins/upload.js"))
      .toBeLessThan(plugins.indexOf("vendor/hypercms.vendor.js"));
  });

  // A cms page in VIEW mode still has no picker, so the uploader stays out. The
  // implication does not override editOnly.
  test("cms in view mode does not pull in upload", () => {
    const { plugins } = resolveModules(params({ plugins: "cms" }), false);
    expect(plugins).not.toContain("plugins/upload.js");
  });

  // The escape hatch, unchanged: exclude runs after the implications, so a page
  // that wants the cms without the uploader can still say so.
  test("exclude=upload opts a cms page back out", () => {
    const { plugins } = resolveModules(params({ plugins: "cms", exclude: "upload" }), true);
    expect(plugins).not.toContain("plugins/upload.js");
    expect(plugins).toContain("vendor/hypercms.vendor.js");
  });

  // hypercms looks the cropper up as clay.quickcrop and silently uploads the raw
  // file when it is absent, so cms must pull quickcrop in rather than degrade.
  test("cms implies quickcrop, ahead of cms in load order", () => {
    const { plugins } = resolveModules(params({ plugins: "cms" }), true);
    expect(plugins).toEqual([
      "vendor/richclay.vendor.js",
      "vendor/quickcrop.vendor.js",
      "plugins/upload.js",
      "vendor/hypercms.vendor.js",
    ]);
  });

  test("excluding quickcrop overrides the implication", () => {
    const { plugins } = resolveModules(params({ plugins: "cms", exclude: "quickcrop" }), true);
    expect(plugins).toEqual(["vendor/richclay.vendor.js", "plugins/upload.js", "vendor/hypercms.vendor.js"]);
  });

  test("quickcrop loads on its own request, in view mode too", () => {
    expect(resolveModules(params({ plugins: "quickcrop" }), false).plugins)
      .toEqual(["vendor/quickcrop.vendor.js"]);
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
