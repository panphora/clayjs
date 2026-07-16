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
  // before any plugin import so its autoInit sees the right value.
  if (window.__hyperclayEditMode === undefined) window.__hyperclayEditMode = isEditMode;

  const regionPolicy = await import(base + "/src/lib/region-policy.js");

  const plan = resolveModules(params, isEditMode);
  const loaded = {};

  for (const path of plan.core) {
    loaded[path] = await import(base + "/src/" + path); // sequential: order is load-bearing
  }

  assembleCore(loaded, { isEditMode, isOwner }, regionPolicy); // window.clay + shim MUST exist
                                                               // before any plugin import

  for (const path of plan.plugins) {
    loaded[path] = await import(base + "/src/" + path);
  }

  attachPluginMembers(loaded);                          // clay.undo / clay.morph / clay.cms + shim mirrors
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

function attachPluginMembers(loaded) {
  const clay = window.clay;

  const undoMod = loaded["plugins/undo.js"];
  const syncMod = loaded["sync/live-sync.js"];
  const cmsMod = loaded["vendor/hypercms.vendor.js"];
  const richclayMod = loaded["vendor/richclay.vendor.js"];

  if (undoMod) {
    clay.undo = undoMod.undo || undoMod.default;
    window.hyperclay.undo = clay.undo;
  }
  if (syncMod) {
    clay.morph = syncMod.morph;
  }
  if (cmsMod) {
    clay.cms = cmsMod.cms || cmsMod.default;
    window.hyperclay.hypercms = clay.cms;
  }
  if (richclayMod) {
    window.hyperclay.RichClay = richclayMod.RichClay || richclayMod.default;
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
