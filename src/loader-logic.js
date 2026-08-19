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
  quickcrop: { path: "vendor/quickcrop.vendor.js", editOnly: false, default: false },
  // editOnly, because a file picker only ever appears in edit mode: the cms
  // injects its own editing toggle there and clayjs's edit-mode signal is a
  // superset of the cms's, so the plugin is present exactly when it can be used.
  upload:    { path: "plugins/upload.js",          editOnly: true,  default: false },
  wire:      { path: "plugins/wire.js",            editOnly: false, default: false },
  demo:      { path: "plugins/demo.js",            editOnly: false, default: false },
};

const PLUGIN_ORDER = ["richclay", "indicator", "sortable", "undo", "quickcrop", "upload", "cms", "sync", "wire", "demo"];

// A plugin that cannot do its whole job alone. hypercms reads the cropper through
// a capability lookup (`clay.quickcrop`) and silently uploads the raw file when it
// finds nothing, so `plugins=cms` has to bring quickcrop with it or image crop is
// dead with no error and no log. quickcrop loads BEFORE cms in the order above,
// because the loader attaches each plugin's member as it lands and cms reads what
// earlier plugins attached during its own evaluation.
// `upload` is deliberately NOT implied by cms yet. Adding it flips how an
// existing page behaves, from embedding an image to storing it, and that is
// isolated into its own one-line release so it can be reverted alone.
const IMPLIES = { cms: ["quickcrop"] };

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
  // Between the two: exclude still wins, so `plugins=cms&exclude=quickcrop` opts
  // back out of the cropper.
  for (const name of [...enabled]) {
    for (const implied of IMPLIES[name] || []) enabled.add(implied);
  }
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
