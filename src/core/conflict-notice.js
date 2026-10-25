import onDomReady from "../lib/dom-ready.js";
import { isEditMode } from "./is-edit-mode.js";

// The notice itself lives in conflict-notice-ui.js and is 6.8 KB Brotli: most edit
// boots have nothing for it to show, so this shell is what every one of them downloads
// instead. It watches the events that can create something to show and, on the first
// one that does, fetches the notice once and hands it that event, which it replays as
// if it had been listening all along. From then on the notice owns every listener;
// this file adds no state and draws nothing. A boot whose document already has
// conflicts stored for review asks for it at once, because those records live in the
// recovery store rather than in the ledger and no event will announce them.
const ledger = () => window.clay?.conflicts || null;

let loading = false;

function load(trigger) {
  if (loading) return;
  loading = true;
  document.removeEventListener("clay:sync-conflicts-changed", onLedgerChanged);
  document.removeEventListener("clay:save-conflict", onSaveConflict);
  document.removeEventListener("clay:document-upgraded", onUpgraded);
  import("./conflict-notice-ui.js").then(
    (ui) => ui.start(trigger),
    (error) => {
      console.error("clayjs: the conflict notice could not be downloaded; it will try again on the next conflict", error);
      loading = false;
      arm();
    }
  );
}

function arm() {
  document.addEventListener("clay:sync-conflicts-changed", onLedgerChanged);
  document.addEventListener("clay:save-conflict", onSaveConflict);
  document.addEventListener("clay:document-upgraded", onUpgraded);
}

function onLedgerChanged(e) {
  if (!ledger()?.size) return;
  load(e);
}

function onSaveConflict(e) {
  load(e);
}

// The document itself was upgraded somewhere else: the notice is drawn for this
// too, because it is the one thing on the page that can offer a reload.
function onUpgraded(e) {
  load(e);
}

// A conflict this tab held before a reload is in the recovery store, not in the
// ledger, so the ledger being empty is not proof that there is nothing to show. The
// hint that says otherwise is one small key, and the module that reads it is fetched
// rather than imported so no recovery code is in this file's own graph: the database
// still opens only when the hint says there is something in it to read.
function keptFromEarlier() {
  import("../recovery/conflicts.js").then(
    (module) => {
      if (!loading && module.pendingConflicts() > 0) load(null);
    },
    () => {}
  );
}

onDomReady(() => {
  if (!isEditMode) return;
  if (ledger()?.size) load(null);
  else {
    // Armed first, always: a conflict can arrive while the hint is still being read.
    arm();
    keptFromEarlier();
  }
});
