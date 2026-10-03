import { jest } from "@jest/globals";
import { resolveModules } from "../../src/loader-logic.js";

function params(obj = {}) {
  return new URLSearchParams(obj);
}

describe("resolveModules", () => {
  test("edit mode: default plugins (richclay, source) + full core waves", () => {
    const { core, plugins } = resolveModules(params(), true);
    expect(core[0]).toBe("lib/mutation.js");
    expect(core).toContain("core/edit-mode.js");
    expect(core).toContain("core/snapshot.js");
    expect(core).toContain("core/save.js");
    expect(core).toContain("lib/cache-bust.js");
    expect(plugins).toEqual([
      "plugins/richclay.js",
      "plugins/source.js",
    ]);
  });

  test("view mode: drops editOnly core wave and editOnly plugins, keeps always core", () => {
    const { core, plugins } = resolveModules(params(), false);
    expect(core).toEqual(["lib/mutation.js", "core/edit-mode.js", "core/stale-host-notice.js", "core/page-data.js"]);
    expect(plugins).toEqual([]); // richclay is editOnly, dropped in view mode
  });

  test("view mode keeps sync + cms (not editOnly) while dropping richclay", () => {
    const { plugins } = resolveModules(params({ plugins: "sync,cms" }), false);
    expect(plugins).toEqual([
      "plugins/quickcrop.js",
      "plugins/cms.js",
      "sync/live-sync.js",
    ]);
  });

  test("upload is opt-in, edit-mode only, and loads before cms", () => {
    const { plugins } = resolveModules(params({ plugins: "upload,cms" }), true);
    expect(plugins.indexOf("plugins/upload.js")).toBeGreaterThan(-1);
    // The loader attaches each plugin's member as it lands, and cms reads what
    // earlier plugins attached during its own evaluation.
    expect(plugins.indexOf("plugins/upload.js"))
      .toBeLessThan(plugins.indexOf("plugins/cms.js"));
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
      .toBeLessThan(plugins.indexOf("plugins/cms.js"));
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
    expect(plugins).toContain("plugins/cms.js");
  });

  // hypercms looks the cropper up as clay.quickcrop and silently uploads the raw
  // file when it is absent, so cms must pull quickcrop in rather than degrade.
  test("cms implies quickcrop, ahead of cms in load order", () => {
    const { plugins } = resolveModules(params({ plugins: "cms" }), true);
    expect(plugins).toEqual([
      "plugins/richclay.js",
      "plugins/quickcrop.js",
      "plugins/upload.js",
      "plugins/cms.js",
      "plugins/source.js",
    ]);
  });

  test("excluding quickcrop overrides the implication", () => {
    const { plugins } = resolveModules(params({ plugins: "cms", exclude: "quickcrop" }), true);
    expect(plugins).toEqual([
      "plugins/richclay.js",
      "plugins/upload.js",
      "plugins/cms.js",
      "plugins/source.js",
    ]);
  });

  test("quickcrop loads on its own request, in view mode too", () => {
    expect(resolveModules(params({ plugins: "quickcrop" }), false).plugins)
      .toEqual(["plugins/quickcrop.js"]);
  });

  test("plugins CSV adds listed plugins in canonical order", () => {
    const { plugins } = resolveModules(params({ plugins: "indicator,sortable,undo" }), true);
    expect(plugins).toEqual([
      "plugins/richclay.js",
      "plugins/indicator.js",
      "plugins/sortable.js",
      "plugins/undo.js",
      "plugins/source.js",
    ]);
  });

  test("exclude CSV removes a default-on plugin", () => {
    const { plugins } = resolveModules(params({ exclude: "richclay" }), true);
    expect(plugins).toEqual(["plugins/source.js"]);
  });

  test("exclude=source opts a page out of the source-preserving save", () => {
    // The whole escape hatch for a default-on plugin, and the one a page uses when it
    // does not want the parser downloaded or the extra boot request made.
    expect(resolveModules(params({ exclude: "source" }), true).plugins)
      .toEqual(["plugins/richclay.js"]);
  });

  // ai-edit is a consumer of clay.wire: it asks `clay.wire.helpers()` whether the
  // host runs it and sends through `clay.wire.send`. Asking for it has to bring the
  // wire, and the wire has to load first, or the plugin evaluates against nothing.
  test("plugins=ai-edit implies wire, which loads before it", () => {
    const { plugins } = resolveModules(params({ plugins: "ai-edit" }), true);
    expect(plugins).toContain("plugins/wire.js");
    expect(plugins.indexOf("plugins/wire.js"))
      .toBeLessThan(plugins.indexOf("plugins/ai-edit.js"));
  });

  // editOnly, like upload: the comment box is an editing gesture, and no host lists
  // a ready helper to a page that cannot edit. The wire it implies stays, because
  // the wire itself works in view mode.
  test("ai-edit is dropped in view mode, leaving the wire it implied", () => {
    expect(resolveModules(params({ plugins: "ai-edit" }), false).plugins)
      .toEqual(["plugins/wire.js"]);
  });

  // Excluding the wire takes ai-edit out with it, since the plugin cannot run
  // without it, and nothing ai-edit would have implied comes in.
  test("exclude=wire drops ai-edit and what it implied", () => {
    expect(resolveModules(params({ plugins: "ai-edit", exclude: "wire" }), true).plugins)
      .toEqual(["plugins/richclay.js", "plugins/source.js"]);
    expect(resolveModules(params({ exclude: "wire" }), true).plugins)
      .toEqual(["plugins/richclay.js", "plugins/source.js"]);
    expect(resolveModules(params({ exclude: "ai-edit" }), true).plugins)
      .toEqual(["plugins/richclay.js", "plugins/source.js"]);
  });

  test("unknown plugin name warns and is skipped (plugins param)", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { plugins } = resolveModules(params({ plugins: "bogus,indicator" }), true);
    expect(warn).toHaveBeenCalledWith('clayjs: unknown plugin "bogus"');
    expect(plugins).toEqual([
      "plugins/richclay.js",
      "plugins/indicator.js",
      "plugins/source.js",
    ]);
    warn.mockRestore();
  });

  test("unknown plugin name warns and is skipped (exclude param)", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    resolveModules(params({ exclude: "nope" }), true);
    expect(warn).toHaveBeenCalledWith('clayjs: unknown plugin "nope"');
    warn.mockRestore();
  });

  test("ai-edit is off unless asked for, and the wire with it", () => {
    expect(resolveModules(params(), true).plugins).toEqual([
      "plugins/richclay.js",
      "plugins/source.js",
    ]);
    expect(resolveModules(params(), false).plugins).toEqual([]);
  });

  test("ai-edit does not bring undo, which would take Cmd+Z in every text field", () => {
    expect(resolveModules(params(), true).plugins).not.toContain("plugins/undo.js");
    expect(resolveModules(params({ plugins: "ai-edit" }), true).plugins).not.toContain("plugins/undo.js");
  });
});
