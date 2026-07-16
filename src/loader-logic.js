export const CORE_WAVES = {
  always: [
    "lib/mutation.js",     // first: everything hangs off the hub; cms/sync need it in view mode too
    "core/edit-mode.js",   // both modes — matches today: 'edit-mode' is NOT in EDIT_MODE_ONLY
                           // (hyperclay.js:251-273 lists 'edit-mode-helpers', not 'edit-mode');
                           // toggleEditMode must exist in view mode, it's the way IN
  ],
  editOnly: [
    "core/snapshot.js", "core/save-core.js", "core/save.js",
    "core/unsaved-warning.js", "core/persist.js",
    "core/admin-attrs.js", "core/autosave.js",
    "attrs/save-freeze.js", "attrs/onaftersave.js", "attrs/refetch-on-save.js",
    "lib/cache-bust.js",
  ],
};

export const PLUGIN_PATHS = {
  richclay:  { path: "vendor/richclay.vendor.js",  editOnly: true,  default: true },
  indicator: { path: "plugins/indicator.js",       editOnly: true,  default: false },
  sync:      { path: "sync/live-sync.js",          editOnly: false, default: false },
  sortable:  { path: "plugins/sortable.js",        editOnly: true,  default: false },
  undo:      { path: "plugins/undo.js",            editOnly: true,  default: false },
  cms:       { path: "vendor/hypercms.vendor.js",  editOnly: false, default: false },
};

const PLUGIN_ORDER = ["richclay", "indicator", "sortable", "undo", "cms", "sync"];

function parseCsv(params, key, enabled, apply) {
  const raw = params.get(key);
  if (!raw) return;
  for (const token of raw.split(",")) {
    const name = token.trim();
    if (!name) continue;
    if (!PLUGIN_PATHS[name]) {
      console.warn(`clayjs: unknown plugin "${name}"`);
      continue;
    }
    apply(enabled, name);
  }
}

export function resolveModules(params, isEditMode) {
  const core = [...CORE_WAVES.always];
  if (isEditMode) core.push(...CORE_WAVES.editOnly);

  const enabled = new Set();
  for (const [name, spec] of Object.entries(PLUGIN_PATHS)) {
    if (spec.default) enabled.add(name);
  }
  parseCsv(params, "plugins", enabled, (set, name) => set.add(name));
  parseCsv(params, "exclude", enabled, (set, name) => set.delete(name));

  const plugins = [];
  for (const name of PLUGIN_ORDER) {
    if (!enabled.has(name)) continue;
    const spec = PLUGIN_PATHS[name];
    if (spec.editOnly && !isEditMode) continue;
    plugins.push(spec.path);
  }

  return { core, plugins };
}
