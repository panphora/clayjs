import onDomReady from "../lib/dom-ready.js";
import { isEditMode } from "./is-edit-mode.js";
import { isSaveConflicted } from "./save.js";
import { storage } from "../lib/doc-storage.js";

// The notice itself lives in conflict-notice-ui.js and is 6.8 KB Brotli: most edit
// boots have nothing for it to show, so this shell is what every one of them downloads
// instead. It watches the events that can create something to show and, on the first
// one, fetches the notice once and hands it that event, which it replays as if it had
// been listening all along. From then on the notice owns every listener; this file
// adds no state and draws nothing. Conflicts a reload left in the recovery store have
// no event to announce them, so a boot that holds some asks for the notice at once.
const ledger = () => window.clay?.conflicts || null;

let loading = false;
let notice = null;    // the notice module, once it has been fetched
let listeners = null; // the armed handlers, all of them on one controller

function load(trigger) {
  if (loading) return;
  loading = true;
  disarm();
  import("./conflict-notice-ui.js").then(
    (module) => {
      notice = module;
      module.start(trigger);
    },
    (error) => {
      console.error("clayjs: the conflict notice could not be downloaded; it will try again on the next conflict", error);
      loading = false;
      arm();
    }
  );
}

// Arming twice is arming once, so a boot, an event that arrived while the notice was
// being fetched and a mode lease can all ask for the same handlers.
function arm() {
  listeners ||= new AbortController();
  const { signal } = listeners;
  document.addEventListener("clay:sync-conflicts-changed", onLedgerChanged, { signal });
  document.addEventListener("clay:save-conflict", onSaveConflict, { signal });
  document.addEventListener("clay:document-upgraded", onUpgraded, { signal });
}

function disarm() {
  listeners?.abort();
  listeners = null;
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

// A conflict this tab held before a reload lives in the recovery store, not in the
// ledger. That store keeps one small count key for exactly this question: it is read
// here, and the module behind it is fetched only when the count says something is
// stored, so a boot with nothing stored downloads no recovery code.
const HINT_KEY = "conflicts";

function keptFromEarlier() {
  if (!(storage.local.get(HINT_KEY)?.count > 0)) return;
  import("../recovery/conflicts.js").then(
    (module) => {
      if (!loading && module.pendingConflicts() > 0) load(null);
    },
    () => {}
  );
}

// A conflict still unresolved when the page leaves edit would go with the session:
// saving is blocked until it is answered, and the answer needs the editor. A save the
// host refused is one of those, and so is a loss the ledger is still holding for this
// tab. A change the recovery store kept from an earlier session is a copy this page can
// still hand back, not input it is holding, so it never stands in the way.
function unresolved() {
  const held = (ledger()?.list?.() ?? []).filter((record) => !record.claimedBy).map((record) => record.id);
  if (held.length) return held;
  return isSaveConflicted() ? ["save"] : [];
}

/**
 * The lazy notice as a mode lease.
 *
 * The shell and the notice it fetches are editor-only: they exist to answer a conflict,
 * and the answer needs the editing lane. `quiesce` refuses an exit over a conflict that
 * is still unresolved and leaves the notice standing exactly as it is, which is what a
 * refusal has to keep showing; `resume` has nothing to reopen. `dispose` (after the
 * barrier) takes back the shell's handlers and stops the notice, so a later frame in
 * view draws nothing.
 */
export function conflictNoticeParticipant() {
  return {
    id: "clay:conflict-notice",
    order: 960, // last: it reads the save lane's refusal and every peer's losses
    prepare() {
      return {
        enable() {
          if (!notice && !loading) arm();
        },
        quiesce() {
          const pending = unresolved();
          if (!pending.length) return;
          throw Object.assign(new Error("clay.conflict-notice: a conflict here is still unresolved"), {
            code: "conflict",
            pending,
          });
        },
        resume() {},
        dispose() {
          disarm();
          loading = false;
          notice?.stop?.();
          notice = null;
        },
      };
    },
  };
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
