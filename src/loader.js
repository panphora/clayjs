import { resolveModules } from "./loader-logic.js";
import onDomReady from "./lib/dom-ready.js";

function domReady() {
  return new Promise((resolve) => onDomReady(resolve));
}

export async function boot(base, params, readyResolve) {
  await domReady();                                    // Mutation observes document.body
                                                       // unconditionally, and a <head> placement
                                                       // would otherwise observe null

  const editMode = await import(base + "/src/core/is-edit-mode.js");
  const { isEditMode, isOwner } = editMode;

  // richclay's vendor build detects edit mode via this legacy global; set it
  // before any plugin import so its autoInit sees the right value. Overwrite
  // even a pre-set value: resolution already consumed it (lowest precedence),
  // and a conflicting leftover would make richclay disable itself.
  window.__hyperclayEditMode = isEditMode;

  const regionPolicy = await import(base + "/src/lib/region-policy.js");

  const plan = resolveModules(params, isEditMode);
  const loaded = {};

  for (const path of plan.core) {
    loaded[path] = await import(base + "/src/" + path); // sequential: order is load-bearing
  }

  assembleCore(loaded, { isEditMode, isOwner }, regionPolicy); // window.clay + shim MUST exist
                                                               // before any plugin import

  for (const path of plan.plugins) {
    const mod = await import(base + "/src/" + path);
    loaded[path] = mod;
    attachPluginMember(path, mod);   // immediately, not after the loop: hypercms's ?cms=true
                                     // auto-open runs as a microtask queued during ITS evaluation
                                     // (before boot resumes) and reads window.hyperclay.RichClay
                                     // and .undo, which earlier plugins must have mirrored by then
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
    clay.beforeSave = snapshot.beforeSave;
    clay.onSnapshot = snapshot.onSnapshot;
  }
  if (cacheBustMod) {
    clay.cacheBust = cacheBustMod.default;
  }

  // vendor-compat shim: richclay, hypercms, and hyper-undo read window.hyperclay;
  // remove when the vendors migrate to window.clay.
  window.hyperclay = window.hyperclay || {};
  Object.assign(window.hyperclay, {
    Mutation: clay.Mutation,
    isEditMode: clay.isEditMode,
    region: regionPolicy.windowRegionShape,
  });
  if (clay.beforeSave) {
    window.hyperclay.beforeSave = clay.beforeSave;        // richclay's save-cleanup hook
    window.hyperclay.onPrepareForSave = clay.beforeSave;  // hypercms uses this name
  }
  if (clay.save) {
    window.hyperclay.savePage = clay.save;
  }
}

function attachPluginMember(path, mod) {
  const clay = window.clay;

  if (path === "plugins/undo.js") {
    clay.undo = mod.undo || mod.default;
    window.hyperclay.undo = clay.undo;
  } else if (path === "sync/live-sync.js") {
    clay.morph = mod.morph;
  } else if (path === "vendor/hypercms.vendor.js") {
    clay.cms = mod.cms || mod.default;
    window.hyperclay.hypercms = clay.cms;
  } else if (path === "plugins/demo.js") {
    clay.demo = mod.demo;
  } else if (path === "vendor/richclay.vendor.js") {
    window.hyperclay.RichClay = mod.RichClay || mod.default;
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
