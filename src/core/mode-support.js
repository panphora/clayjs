// Which resolved module a live switch can start and take back, keyed by the path the
// loader resolves. This module is data only — it imports nothing and evaluates nothing —
// and it is a dynamic target: a reader never fetches it.
//
// A path that is not a row here is unsupported, never assumed supported, so a plugin that
// arrives through an implication, a default, a `[sap]` root or template metadata is
// checked exactly like one the URL named. The caller takes the reload path before
// anything is prepared.
//
//   "neutral"  page-lifetime machinery that acts only under the committed mode or write
//              admission, so a live entry can import it and leave it alone
//   "export"   the module's namespace exports `modeParticipant`, prepared as a lease
//   "reader"   the view plan's reader, owned by the transition rather than a lease
export const MODULE_SUPPORT = {
  // The always wave: state mirrors, a key handler and the facades both modes read.
  "lib/mutation.js": "neutral",
  "core/preserve-authored.js": "neutral",
  "core/edit-mode.js": "neutral",
  "core/mode-key.js": "neutral",
  "core/stale-host-notice.js": "neutral",
  "core/page-data.js": "neutral",
  // Snapshot, save core and the facades over them: functions and transforms read at
  // capture and save time, never at evaluation.
  "core/snapshot.js": "neutral",
  "core/save-core.js": "neutral",
  "core/recovery.js": "neutral",
  "core/unsaved-warning.js": "neutral",
  // These run on a save capture or after a saved event, which only a committed edit
  // produces, and each handler rechecks the mode or admission at event time, so an old
  // edit event is never replayed after an exit.
  "attrs/onaftersave.js": "neutral",
  "attrs/refetch-on-save.js": "neutral",
  "lib/cache-bust.js": "neutral",
  "attrs/save-freeze.js": "neutral",
  "core/persist.js": "neutral",
  "attrs/add-from.js": "neutral",
  "core/etag.js": "neutral",
  // The modules that keep a session and hand the controller a lease.
  "core/save.js": "export",
  "core/conflict-notice.js": "export",
  "core/autosave.js": "export",
  "core/admin-attrs.js": "export",
  "plugins/indicator.js": "export",
  "plugins/richclay.js": "export",
  "plugins/sortable.js": "export",
  "plugins/undo.js": "export",
  "plugins/unsent.js": "export",
  "plugins/upload.js": "export",
};

export const supportFor = (path) =>
  Object.prototype.hasOwnProperty.call(MODULE_SUPPORT, path) ? MODULE_SUPPORT[path] : null;
