import { resolveModules, MODULES } from "./loader-logic.js";
import onDomReady from "./lib/dom-ready.js";

function domReady() {
  return new Promise((resolve) => onDomReady(resolve));
}

// `base` has been unused since 1.1.0 (the loader imports through MODULES) and
// stays anyway: /v1/clay.js and /v1/src/loader.js are cached independently, so
// for a while after a deploy a browser can pair either file with the other's
// previous release. A call shape that differs between them leaves the page with
// no clayjs at all.
export async function boot(base, params, readyResolve) {
  await domReady();                                    // Mutation observes document.body
                                                       // unconditionally, and a <head> placement
                                                       // would otherwise observe null

  const editMode = await MODULES["core/is-edit-mode.js"]();
  const { isEditMode, isOwner } = editMode;

  // richclay's vendor build detects edit mode via this legacy global; set it
  // before any plugin import so its autoInit sees the right value. Overwrite
  // even a pre-set value: resolution already consumed it (lowest precedence),
  // and a conflicting leftover would make richclay disable itself.
  window.__hyperclayEditMode = isEditMode;

  const regionPolicy = await MODULES["lib/region-policy.js"]();

  const plan = resolveModules(params, isEditMode);
  const loaded = {};

  for (const path of plan.core) {
    loaded[path] = await MODULES[path](); // sequential: order is load-bearing
  }

  assembleCore(loaded, { isEditMode, isOwner }, regionPolicy); // window.clay MUST be assembled
                                                               // before any plugin import

  for (const path of plan.plugins) {
    // A plugin that throws on evaluation degrades to absent. Unguarded, its
    // rejection propagated out of boot() and left clay.ready pending forever, so
    // every `await clay.ready` on the page hung: one broken optional module took
    // the whole client with it. (The allSettled below covers the plugins' async
    // `ready` exports, never their evaluation.)
    let mod;
    try {
      mod = await MODULES[path]();
    } catch (err) {
      console.error(`clayjs: plugin "${path}" failed to load, continuing without it:`, err);
      continue;
    }
    loaded[path] = mod;
    attachPluginMember(path, mod);   // immediately, not after the loop: hypercms's ?cms=true
                                     // auto-open runs as a microtask queued during ITS evaluation
                                     // (before boot resumes) and reads clay.RichClay and clay.undo,
                                     // which earlier plugins must have attached by then
  }

  // Plugins with async setup (sortable's vendor fetch) export `ready`; hold
  // clay.ready until they finish. allSettled: a failed plugin degrades, never blocks boot.
  await Promise.allSettled(plan.plugins.map((path) => loaded[path]?.ready).filter(Boolean));

  installViewModeNotice(isEditMode);
  readyResolve(window.clay);
  document.dispatchEvent(new CustomEvent("clay:ready", { detail: { clay: window.clay } }));
}

function assembleCore(loaded, { isEditMode, isOwner }, regionPolicy) {
  const clay = window.clay;

  const mutation = loaded["lib/mutation.js"];
  const editModeMod = loaded["core/edit-mode.js"];

  Object.assign(clay, {
    toggleEditMode: editModeMod.toggleEditMode,
    isEditMode,
    isOwner,
    Mutation: mutation.default,
    region: regionPolicy.windowRegionShape,
  });

  const snapshot = loaded["core/snapshot.js"];
  const save = loaded["core/save.js"];
  const cacheBustMod = loaded["lib/cache-bust.js"];

  if (save) {
    const saveFn = save.savePage || save.default;
    saveFn.force = save.savePageForce;
    clay.save = saveFn;
  }
  if (snapshot) {
    clay.getHTML = snapshot.getPageContents;
    clay.addDocumentTransform = snapshot.addDocumentTransform;
    clay.onSnapshot = snapshot.onSnapshot;
  }
  if (cacheBustMod) {
    clay.cacheBust = cacheBustMod.default;
  }
}

function attachPluginMember(path, mod) {
  const clay = window.clay;

  if (path === "plugins/undo.js") {
    clay.undo = mod.undo || mod.default;
  } else if (path === "sync/live-sync.js") {
    clay.morph = mod.morph;
  } else if (path === "vendor/hypercms.vendor.js") {
    clay.cms = mod.cms || mod.default;
  } else if (path === "plugins/upload.js") {
    clay.upload = mod.upload || mod.default;
  } else if (path === "plugins/wire.js") {
    clay.wire = mod.wire || mod.default;
  } else if (path === "plugins/demo.js") {
    clay.demo = mod.demo;
  } else if (path === "vendor/richclay.vendor.js") {
    clay.RichClay = mod.RichClay || mod.default;
  } else if (path === "vendor/quickcrop.vendor.js") {
    clay.quickcrop = mod.quickcrop || mod.default;
  }
}

function installViewModeNotice(isEditMode) {
  if (isEditMode) return;
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[trigger-save]")) return;
    console.info("clayjs: you're not the owner of this page; changes stay local");
    document.dispatchEvent(new CustomEvent("clay:view-save-attempt"));
  });
}
