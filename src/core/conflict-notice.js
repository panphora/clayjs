import onDomReady from "../lib/dom-ready.js";
import { isEditMode } from "./is-edit-mode.js";

// The notice itself lives in conflict-notice-ui.js and is 6.8 KB Brotli: most edit
// boots have nothing for it to show, so this shell is what every one of them downloads
// instead. It watches the two events that can create something to show and, on the
// first one that does, fetches the notice once and hands it that event, which it
// replays as if it had been listening all along. From then on the notice owns every
// listener; this file adds no state and draws nothing.
const ledger = () => window.clay?.conflicts || null;

let loading = false;

function load(trigger) {
  if (loading) return;
  loading = true;
  document.removeEventListener("clay:sync-conflicts-changed", onLedgerChanged);
  document.removeEventListener("clay:save-conflict", onSaveConflict);
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
}

function onLedgerChanged(e) {
  if (!ledger()?.size) return;
  load(e);
}

function onSaveConflict(e) {
  load(e);
}

onDomReady(() => {
  if (!isEditMode) return;
  if (ledger()?.size) load(null);
  else arm();
});
