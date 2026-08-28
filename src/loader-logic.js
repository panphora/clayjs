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

// One literal import per module the loader can ask for, so a bundler can see the
// whole graph. The loader used to build each specifier at runtime
// (`import(base + "/src/" + path)`), which no bundler can follow, and that alone
// stood between clayjs and the single-file build. A relative specifier resolves
// against this file, so on clayjs.com the URLs fetched are exactly the ones the
// computed form produced. The thunks keep every import lazy: nothing evaluates
// until the loader asks, in the loader's order, which is load-bearing.
// tests/unit/loader-modules.test.js proves every path in CORE_WAVES and
// PLUGIN_PATHS has an entry here and that each entry imports the file it names.
export const MODULES = {
  "core/is-edit-mode.js":       () => import("./core/is-edit-mode.js"),
  "lib/region-policy.js":       () => import("./lib/region-policy.js"),
  "lib/mutation.js":            () => import("./lib/mutation.js"),
  "core/edit-mode.js":          () => import("./core/edit-mode.js"),
  "core/snapshot.js":           () => import("./core/snapshot.js"),
  "core/save-core.js":          () => import("./core/save-core.js"),
  "core/save.js":               () => import("./core/save.js"),
  "core/unsaved-warning.js":    () => import("./core/unsaved-warning.js"),
  "core/persist.js":            () => import("./core/persist.js"),
  "core/admin-attrs.js":        () => import("./core/admin-attrs.js"),
  "core/autosave.js":           () => import("./core/autosave.js"),
  "attrs/save-freeze.js":       () => import("./attrs/save-freeze.js"),
  "attrs/onaftersave.js":       () => import("./attrs/onaftersave.js"),
  "attrs/refetch-on-save.js":   () => import("./attrs/refetch-on-save.js"),
  "lib/cache-bust.js":          () => import("./lib/cache-bust.js"),
  "vendor/richclay.vendor.js":  () => import("./vendor/richclay.vendor.js"),
  "plugins/indicator.js":       () => import("./plugins/indicator.js"),
  "sync/live-sync.js":          () => import("./sync/live-sync.js"),
  "plugins/sortable.js":        () => import("./plugins/sortable.js"),
  "plugins/undo.js":            () => import("./plugins/undo.js"),
  "vendor/hypercms.vendor.js":  () => import("./vendor/hypercms.vendor.js"),
  "vendor/quickcrop.vendor.js": () => import("./vendor/quickcrop.vendor.js"),
  "plugins/upload.js":          () => import("./plugins/upload.js"),
  "plugins/wire.js":            () => import("./plugins/wire.js"),
  "plugins/demo.js":            () => import("./plugins/demo.js"),
};

const PLUGIN_ORDER = ["richclay", "indicator", "sortable", "undo", "quickcrop", "upload", "cms", "sync", "wire", "demo"];

// A plugin that cannot do its whole job alone. hypercms reads the cropper through
// a capability lookup (`clay.quickcrop`) and silently uploads the raw file when it
// finds nothing, so `plugins=cms` has to bring quickcrop with it or image crop is
// dead with no error and no log. quickcrop loads BEFORE cms in the order above,
// because the loader attaches each plugin's member as it lands and cms reads what
// earlier plugins attached during its own evaluation.
// `upload` rides the same reasoning one step further. Without it the cms has no
// uploader to look up, so it embeds every picked image in the document as a data:
// URL: a two megabyte photo costs 2.7 MB of base64 on that save, on every future
// save, and in every stored version. With it the cms asks the host first and
// embeds only when the host does not store files, which is still the right answer
// on a plain file server.
//
// This is the only line in the capability that changes how an already-published
// page behaves, which is why it shipped alone, one release after the plugin it
// enables. Reverting it is reverting this line.
const IMPLIES = { cms: ["quickcrop", "upload"] };

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
