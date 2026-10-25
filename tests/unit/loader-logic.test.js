import { jest } from "@jest/globals";
import { resolveModules } from "../../src/loader-logic.js";

function params(obj = {}) {
  return new URLSearchParams(obj);
}

describe("resolveModules", () => {
  test("edit mode: default plugins (richclay, source) + full core waves", () => {
    const { core, plugins, late } = resolveModules(params(), true);
    expect(core[0]).toBe("lib/mutation.js");
    expect(core).toContain("core/edit-mode.js");
    expect(core).toContain("core/snapshot.js");
    expect(core).toContain("core/save.js");
    expect(core).toContain("lib/cache-bust.js");
    expect(plugins).toEqual(["plugins/richclay.js"]);
    expect(late).toEqual(["plugins/source.js"]);
  });

  test("view mode: drops editOnly core wave and editOnly plugins, keeps always core", () => {
    const { core, plugins, late } = resolveModules(params(), false);
    expect(core).toEqual([
      "lib/mutation.js",
      "core/preserve-authored.js",
      "core/edit-mode.js",
      "core/mode-key.js",
      "core/stale-host-notice.js",
      "core/page-data.js",
    ]);
    expect(plugins).toEqual([]); // richclay is editOnly, dropped in view mode
    expect(late).toEqual([]);    // so is source
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
    const { plugins, late } = resolveModules(params({ plugins: "cms" }), true);
    expect(plugins).toEqual([
      "plugins/richclay.js",
      "plugins/quickcrop.js",
      "plugins/upload.js",
      "plugins/cms.js",
    ]);
    expect(late).toEqual(["plugins/source.js"]);
  });

  test("excluding quickcrop overrides the implication", () => {
    const { plugins, late } = resolveModules(params({ plugins: "cms", exclude: "quickcrop" }), true);
    expect(plugins).toEqual([
      "plugins/richclay.js",
      "plugins/upload.js",
      "plugins/cms.js",
    ]);
    expect(late).toEqual(["plugins/source.js"]);
  });

  test("quickcrop loads on its own request, in view mode too", () => {
    expect(resolveModules(params({ plugins: "quickcrop" }), false).plugins)
      .toEqual(["plugins/quickcrop.js"]);
  });

  test("plugins CSV adds listed plugins in canonical order", () => {
    const { plugins, late } = resolveModules(params({ plugins: "indicator,sortable,undo" }), true);
    expect(plugins).toEqual([
      "plugins/richclay.js",
      "plugins/indicator.js",
      "plugins/undo.js",
    ]);
    expect(late).toEqual(["plugins/sortable.js", "plugins/source.js"]);
  });

  // Nothing on first paint or on a keystroke waits for Sortable's vendor fetch, so
  // it loads in the late list in both modes a page can edit in, and not at all in
  // view mode, where no drag can happen.
  test("sortable is late in edit and draft mode, and absent in view mode", () => {
    const edit = resolveModules(params({ plugins: "sortable" }), true);
    expect(edit.late).toEqual(["plugins/sortable.js", "plugins/source.js"]);
    expect(edit.plugins).not.toContain("plugins/sortable.js");

    const draft = resolveModules(params({ plugins: "sortable" }), true, { isDraftMode: true });
    expect(draft.late).toEqual(["plugins/sortable.js"]);
    expect(draft.plugins).not.toContain("plugins/sortable.js");

    const view = resolveModules(params({ plugins: "sortable" }), false);
    expect(view.late).not.toContain("plugins/sortable.js");
    expect(view.plugins).not.toContain("plugins/sortable.js");
  });

  // The menu draws the Edit switch and claygoo, which nothing on first paint reads,
  // so a Document with `plugins=page,menu` loads it after the reader is ready in
  // both modes: a reader's first paint and first keystroke do not pay for it.
  test("menu is late in view and edit, and stays out of the boot list", () => {
    const view = resolveModules(params({ plugins: "page,menu" }), false);
    expect(view.plugins).not.toContain("plugins/menu.js");
    expect(view.late).toEqual(["plugins/menu.js"]);

    const edit = resolveModules(params({ plugins: "page,menu" }), true);
    expect(edit.plugins).not.toContain("plugins/menu.js");
    expect(edit.late).toEqual(["plugins/menu.js", "plugins/source.js"]);
  });

  test("exclude CSV removes a default-on plugin", () => {
    const { plugins, late } = resolveModules(params({ exclude: "richclay" }), true);
    expect(plugins).toEqual([]);
    expect(late).toEqual(["plugins/source.js"]);
  });

  test("exclude=source opts a page out of the source-preserving save", () => {
    // The whole escape hatch for a default-on plugin, and the one a page uses when it
    // does not want the parser downloaded or the extra boot request made.
    const { plugins, late } = resolveModules(params({ exclude: "source" }), true);
    expect(plugins).toEqual(["plugins/richclay.js"]);
    expect(late).toEqual([]);
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

  test("plugins=page implies live and sync, which load before it", () => {
    const { plugins } = resolveModules(params({ plugins: "page" }), true);
    expect(plugins).toContain("sync/live-sync.js");
    expect(plugins).toContain("plugins/live.js");
    expect(plugins.indexOf("sync/live-sync.js")).toBeLessThan(plugins.indexOf("plugins/page.js"));
    expect(plugins.indexOf("plugins/live.js")).toBeLessThan(plugins.indexOf("plugins/page.js"));
  });

  test("plugins=page implies upload, so its image blocks can store files", () => {
    const { plugins } = resolveModules(params({ plugins: "page" }), true);
    expect(plugins).toContain("plugins/upload.js");
    expect(plugins.indexOf("plugins/upload.js")).toBeLessThan(plugins.indexOf("plugins/page.js"));
  });

  test("exclude=upload still drops upload from a page", () => {
    const { plugins } = resolveModules(params({ plugins: "page", exclude: "upload" }), true);
    expect(plugins).not.toContain("plugins/upload.js");
  });

  // editOnly, like upload: the comment box is an editing gesture, and no host lists
  // a ready helper to a page that cannot edit. A plugin this mode does not load
  // brings nothing, so the wire it implies stays out too. A page that wants the
  // wire in view mode names it.
  test("plugins=ai-edit in view mode has no wire", () => {
    const { plugins } = resolveModules(params({ plugins: "ai-edit" }), false);
    expect(plugins).not.toContain("plugins/wire.js");
    expect(plugins).not.toContain("plugins/ai-edit.js");
  });

  test("plugins=ai-edit,wire in view mode has the wire", () => {
    const { plugins } = resolveModules(params({ plugins: "ai-edit,wire" }), false);
    expect(plugins).toContain("plugins/wire.js");
    expect(plugins).not.toContain("plugins/ai-edit.js");
  });

  test("plugins=ai-edit in edit mode has both the wire and ai-edit", () => {
    const { plugins } = resolveModules(params({ plugins: "ai-edit" }), true);
    expect(plugins).toContain("plugins/wire.js");
    expect(plugins).toContain("plugins/ai-edit.js");
  });

  // The editor half is editOnly, so in view mode `page` brings nothing with it:
  // neither the generic sync, the live data service nor the uploader. A reader is
  // its reader half alone, on a saved transport of its own.
  test("plugins=page in view mode brings neither live nor sync", () => {
    const { plugins, late } = resolveModules(params({ plugins: "page" }), false);
    expect(plugins).toEqual(["plugins/page-view.js"]);
    expect(late).toEqual([]);
  });

  test("plugins=page,sync in view mode keeps the sync the tag asked for", () => {
    const { plugins } = resolveModules(params({ plugins: "page,sync" }), false);
    expect(plugins).toEqual(["plugins/page-view.js", "sync/live-sync.js"]);
  });

  test("plugins=page,live in view mode keeps live and adds no sync", () => {
    const { plugins } = resolveModules(params({ plugins: "page,live" }), false);
    expect(plugins).toEqual(["plugins/page-view.js", "plugins/live.js"]);
  });

  // Excluding either transport leaves the reader its own, since the reader never
  // asked for them.
  test("exclude=sync or exclude=live leaves the view-mode reader in place", () => {
    for (const query of [
      { plugins: "page,sync", exclude: "sync" },
      { plugins: "page,live", exclude: "live" },
      { plugins: "page", exclude: "sync,live,upload" },
    ]) {
      expect(resolveModules(params(query), false).plugins).toEqual(["plugins/page-view.js"]);
    }
  });

  // Excluding the wire takes ai-edit out with it, since the plugin cannot run
  // without it, and nothing ai-edit would have implied comes in.
  test("exclude=wire drops ai-edit and what it implied", () => {
    for (const query of [{ plugins: "ai-edit", exclude: "wire" }, { exclude: "wire" }, { exclude: "ai-edit" }]) {
      const { plugins, late } = resolveModules(params(query), true);
      expect(plugins).toEqual(["plugins/richclay.js"]);
      expect(late).toEqual(["plugins/source.js"]);
    }
  });

  test("unknown plugin name warns and is skipped (plugins param)", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { plugins, late } = resolveModules(params({ plugins: "bogus,indicator" }), true);
    expect(warn).toHaveBeenCalledWith('clayjs: unknown plugin "bogus"');
    expect(plugins).toEqual([
      "plugins/richclay.js",
      "plugins/indicator.js",
    ]);
    expect(late).toEqual(["plugins/source.js"]);
    warn.mockRestore();
  });

  test("unknown plugin name warns and is skipped (exclude param)", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    resolveModules(params({ exclude: "nope" }), true);
    expect(warn).toHaveBeenCalledWith('clayjs: unknown plugin "nope"');
    warn.mockRestore();
  });

  test("ai-edit is off unless asked for, and the wire with it", () => {
    const edit = resolveModules(params(), true);
    expect(edit.plugins).toEqual(["plugins/richclay.js"]);
    expect(edit.late).toEqual(["plugins/source.js"]);
    const view = resolveModules(params(), false);
    expect(view.plugins).toEqual([]);
    expect(view.late).toEqual([]);
  });

  test("ai-edit does not bring undo, which would take Cmd+Z in every text field", () => {
    expect(resolveModules(params(), true).plugins).not.toContain("plugins/undo.js");
    expect(resolveModules(params({ plugins: "ai-edit" }), true).plugins).not.toContain("plugins/undo.js");
  });
});

test("draft mode puts visitor-drafts first and drops every host-facing plugin", () => {
  const { plugins, late } = resolveModules(
    params({ plugins: "sync,upload,sortable,undo,visitor-drafts" }),
    true,
    { isDraftMode: true }
  );
  expect(plugins[0]).toBe("plugins/visitor-drafts.js");
  expect(late).toContain("plugins/sortable.js");
  expect(plugins).toContain("plugins/undo.js");
  expect(plugins).toContain("plugins/richclay.js");
  expect(plugins).not.toContain("sync/live-sync.js");
  expect(plugins).not.toContain("plugins/upload.js");
  expect(plugins).not.toContain("plugins/source.js");
  expect(late).toEqual(["plugins/sortable.js"]);
});

test("draft mode drops the [refetch-on-save] hook, which GETs the host after every save", () => {
  const edit = resolveModules(params({ plugins: "visitor-drafts" }), true);
  expect(edit.core).toContain("attrs/refetch-on-save.js");

  const draft = resolveModules(params({ plugins: "visitor-drafts" }), true, { isDraftMode: true });
  expect(draft.core).not.toContain("attrs/refetch-on-save.js");
  expect(draft.core).toContain("core/save.js");
  expect(draft.core).toContain("attrs/onaftersave.js");
});

test("live is opt-in, loads in view mode, and brings nothing with it", () => {
  const off = resolveModules(new URLSearchParams(""), true);
  expect(off.plugins).not.toContain("plugins/live.js");
  const view = resolveModules(new URLSearchParams("plugins=live"), false);
  expect(view.plugins).toEqual(["plugins/live.js"]);
});

test("a page with a [sap] root loads the sapjs core, in view mode too, before source", () => {
  const { plugins: edit, late } = resolveModules(params(), true, { hasSap: true });
  expect(edit).toEqual(["plugins/richclay.js", "plugins/derive.js"]);
  expect(late).toEqual(["plugins/source.js"]);
  expect(resolveModules(params(), false, { hasSap: true }).plugins).toEqual(["plugins/derive.js"]);
  expect(resolveModules(params(), true).plugins).not.toContain("plugins/derive.js");
});

test("exclude=derive keeps the core off a page with a [sap] root", () => {
  expect(resolveModules(params({ exclude: "derive" }), true, { hasSap: true }).plugins).not.toContain("plugins/derive.js");
});

test("draft mode keeps the core: a visitor's tab paints the totals of its own draft", () => {
  expect(resolveModules(params(), false, { isDraftMode: true, hasSap: true }).plugins).toContain("plugins/derive.js");
});

describe("page-view, the reader half of page", () => {
  test("view mode adds it, and nothing else page would have implied", () => {
    const { plugins } = resolveModules(params({ plugins: "page" }), false);
    expect(plugins).not.toContain("plugins/page.js");
    expect(plugins).toEqual(["plugins/page-view.js"]);
  });

  // An explicitly requested sync still loads, and the reader comes before it so
  // the feed's listener exists first.
  test("view mode adds it before an explicitly requested live sync", () => {
    const { plugins } = resolveModules(params({ plugins: "page,sync" }), false);
    expect(plugins).toContain("sync/live-sync.js");
    expect(plugins.indexOf("plugins/page-view.js"))
      .toBeLessThan(plugins.indexOf("sync/live-sync.js"));
  });

  test("edit mode loads the editor half and no reader", () => {
    const { plugins } = resolveModules(params({ plugins: "page" }), true);
    expect(plugins).toContain("plugins/page.js");
    expect(plugins).not.toContain("plugins/page-view.js");
  });

  test("draft mode drops page, so it gets no reader either", () => {
    const { plugins } = resolveModules(params({ plugins: "page" }), false, { isDraftMode: true });
    expect(plugins).not.toContain("plugins/page.js");
    expect(plugins).not.toContain("plugins/page-view.js");
  });

  test("plugins=page-view is unknown: a URL cannot ask for the reader half", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { plugins } = resolveModules(params({ plugins: "page-view" }), false);
    expect(warn).toHaveBeenCalledWith('clayjs: unknown plugin "page-view"');
    expect(plugins).toEqual([]);
    warn.mockRestore();
  });
});

// A Document's editor owns its article's rich text, so richclay has nothing to do
// there; `plugins=page,richclay` still loads it for a page that asks by name. And
// nothing a first keystroke waits for includes `source`: its install is asynchronous
// and a save before it lands is the ordinary full serialization.
describe("a Document's plugin plan", () => {
  const everywhere = (plan) => [...plan.core, ...plan.plugins, ...plan.late];

  test("plugins=page: no richclay anywhere, source only in late", () => {
    const plan = resolveModules(params({ plugins: "page" }), true);
    expect(everywhere(plan)).not.toContain("plugins/richclay.js");
    expect(plan.plugins).not.toContain("plugins/source.js");
    expect(plan.late).toEqual(["plugins/source.js"]);
  });

  test("plugins=page,richclay: asking for it by name defeats the displacement", () => {
    const plan = resolveModules(params({ plugins: "page,richclay" }), true);
    expect(plan.plugins).toContain("plugins/richclay.js");
    expect(plan.late).toEqual(["plugins/source.js"]);
  });

  test("plugins=page,source: source stays late even when named", () => {
    const plan = resolveModules(params({ plugins: "page,source" }), true);
    expect(plan.plugins).not.toContain("plugins/source.js");
    expect(plan.late).toEqual(["plugins/source.js"]);
  });

  test("view mode plugins=page: neither richclay nor source", () => {
    const plan = resolveModules(params({ plugins: "page" }), false);
    expect(everywhere(plan)).not.toContain("plugins/richclay.js");
    expect(everywhere(plan)).not.toContain("plugins/source.js");
  });

  test("plugins=sync in edit mode: richclay as before, source only in late", () => {
    const plan = resolveModules(params({ plugins: "sync" }), true);
    expect(plan.plugins).toContain("plugins/richclay.js");
    expect(plan.plugins).not.toContain("plugins/source.js");
    expect(plan.late).toEqual(["plugins/source.js"]);
  });

  test("plugins=sync in view mode: nothing is late", () => {
    expect(resolveModules(params({ plugins: "sync" }), false).late).toEqual([]);
  });
});

// Plan 05 Step 3: a copy of a starter template carries its `hyper-source` meta, so
// its owner gets the update check with no authored tag, and copies shipped between
// the metas and this plugin upgrade too. Only the hyperclay template prefix does
// that; any other source asks for the plugin by name.
describe("the upgrade check", () => {
  const copy = "https://hyperclay.com/templates/kanban/owned/latest.html";

  test("an owner's template copy loads it with no authored tag", () => {
    const { plugins } = resolveModules(params(), false, { canEdit: true, templateSource: copy });
    expect(plugins).toContain("plugins/upgrade.js");
  });

  test("it loads in edit mode too", () => {
    const { plugins } = resolveModules(params(), true, { canEdit: true, templateSource: copy });
    expect(plugins).toContain("plugins/upgrade.js");
  });

  test("a reader of the same copy gets nothing", () => {
    const { plugins } = resolveModules(params(), false, { canEdit: false, templateSource: copy });
    expect(plugins).not.toContain("plugins/upgrade.js");
  });

  test("a draft gets nothing: the source would replace the wrong document", () => {
    const { plugins } = resolveModules(params(), true, { canEdit: true, isDraftMode: true, templateSource: copy });
    expect(plugins).not.toContain("plugins/upgrade.js");
  });

  test("another host's source is not a template copy", () => {
    const { plugins } = resolveModules(params(), false, {
      canEdit: true,
      templateSource: "https://example.com/templates/kanban/owned/latest.html",
    });
    expect(plugins).not.toContain("plugins/upgrade.js");
  });

  test("a copy with no source, made before the metas, gets nothing", () => {
    expect(resolveModules(params(), false, { canEdit: true }).plugins).not.toContain("plugins/upgrade.js");
  });

  test("exclude=upgrade turns it off", () => {
    const { plugins } = resolveModules(params({ exclude: "upgrade" }), false, { canEdit: true, templateSource: copy });
    expect(plugins).not.toContain("plugins/upgrade.js");
  });

  test("plugins=upgrade loads it for any source", () => {
    expect(resolveModules(params({ plugins: "upgrade" }), false).plugins).toContain("plugins/upgrade.js");
    expect(resolveModules(params({ plugins: "upgrade" }), true).plugins).toContain("plugins/upgrade.js");
  });
});

describe("late plugins start loading on their own", () => {
  test("with no page plugin, after clay:ready plus one microtask and no timer", async () => {
    jest.resetModules();
    jest.restoreAllMocks();
    document.documentElement.innerHTML =
      '<head><title>Notes</title></head><body><article clay="freeze" data-page="1"><p>Hi</p></article></body>';
    window.clay = {};
    window.clayEditMode = true;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      redirected: false,
      type: "basic",
      headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
      text: async () => '<!DOCTYPE html><html><head><title>Notes</title></head><body><p>Hi</p></body></html>',
    }));

    const events = [];
    const { MODULES } = await import("../../src/loader-logic.js");
    const load = MODULES["plugins/source.js"];
    MODULES["plugins/source.js"] = () => {
      events.push("source");
      return load();
    };
    document.addEventListener("clay:ready", () => {
      events.push("ready");
      setTimeout(() => events.push("timer"), 0);
    });

    const { boot } = await import("../../src/loader.js");
    await boot("https://clayjs.com/v1", new URLSearchParams({ exclude: "richclay" }), () => {});

    expect(events).toEqual(["ready", "source"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["ready", "source", "timer"]);
    expect(window.clay.source).toBeDefined();

    MODULES["plugins/source.js"] = load;
    delete window.clay;
    delete window.clayEditMode;
  });
});

test("only draft mode loads the draft store; readers and owners editing get the owner module", () => {
  const tag = params({ plugins: "sync,visitor-drafts,menu" });
  expect(resolveModules(tag, false).plugins).toContain("plugins/visitor-drafts-owner.js");
  expect(resolveModules(tag, false).plugins).not.toContain("plugins/visitor-drafts.js");
  expect(resolveModules(tag, true).plugins).toContain("plugins/visitor-drafts-owner.js");
  expect(resolveModules(params({ plugins: "sync" }), true, { isDraftMode: true }).plugins[0]).toBe("plugins/visitor-drafts.js");
});
