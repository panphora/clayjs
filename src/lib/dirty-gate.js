/**
 * dirty-gate.js — "might this page hold unsaved edits?" as a cheap counter.
 *
 * Scoped live sync must decide, on every incoming frame, whether to pay for a
 * full capture-and-diff (the oracle) or apply the frame directly. This gate is
 * the cheap side of that decision. It may over-report (a false "dirty" just
 * runs the oracle, which then finds nothing), but it must never under-report:
 * a false "clean" full-morphs over a real unsaved edit.
 *
 * Two feeds, because neither alone sees everything:
 *   - the mutation hub (require: 'autosave'), which sees DOM changes but not
 *     value-property writes on form controls (typing fires no MutationRecord
 *     for .value), and
 *   - capture-phase input/change listeners on ALL form controls, not just
 *     [persist] ones, plus contenteditable hosts.
 *
 * The one hole left is a PROGRAMMATIC value write on a [persist] control: no
 * event, no MutationRecord. persistProbeDirty() closes it by comparing each
 * [persist] control's live state against its serialized default state, with a
 * per-element cache so a value the oracle or a save has already verified stops
 * costing a probe miss on every frame.
 *
 * Clearing is generation-checked: a save records the counter at capture time
 * and clears only if nothing changed while the request was on the wire, so
 * keystrokes during an in-flight save keep the gate dirty.
 */

import Mutation from './mutation.js';
import { isEditMode } from '../core/is-edit-mode.js';
import { STRIP_FROM_COMPARISON, SNAPSHOT_REMOVE_SELECTOR } from './region-policy.js';

let changes = 0;
let clearedAt = 0;
let paused = false;
let started = false;

const PERSIST_CONTROLS = 'input[persist], textarea[persist], select[persist]';

// Regions the comparison never sees. The hub feed already skips them, through
// `require: 'autosave'`, and the input feed has to skip them for the same
// reason: their content is stripped from the comparison clone, so an edit inside
// one can never produce a dirty root, and counting it marks the page dirty with
// nothing for the oracle to find — permanently, since only a save clears the
// counter and churn in these regions triggers none.
//
// This is not a relaxation of "never under-report". A control here is absent
// from the clone by definition, so there is nothing about it to under-report.
// It matters because a mounted tool (redpen's answer field, any panel that
// marks itself no-save) is a real <textarea> in the document: one keystroke in
// it used to freeze the live-sync save baseline for the rest of the session,
// after which every incoming disk change was diffed against a stale base, and
// the previous change was spliced back over the newer one and written to disk.
const GATE_IGNORE = `${STRIP_FROM_COMPARISON}, ${SNAPSHOT_REMOVE_SELECTOR}`;
const probeCache = new WeakMap();

function onUserInput(event) {
  // Deliberately NOT gated on `paused`: a morph never dispatches input or
  // change events, so anything arriving here is the user — including typing
  // during a morph's async resource wait, which must keep the page dirty.
  const el = event.target;
  if (!el || el.nodeType !== 1) return;
  if (!(el.matches('input, textarea, select') || el.isContentEditable)) return;
  if (el.closest(GATE_IGNORE)) return;
  changes++;
}

export function startDirtyGate() {
  if (started) return;
  started = true;
  Mutation.onAnyChange(
    { omitChangeDetails: true, require: 'autosave' },
    () => {
      if (!paused) changes++;
    }
  );
  document.addEventListener('input', onUserInput, true);
  document.addEventListener('change', onUserInput, true);
}

/** The morph-apply window: nothing that happens inside it is a user edit. */
export function pauseGate() { paused = true; }
export function resumeGate() { paused = false; }

function controlSignature(el) {
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.selectedOptions, (o) => o.value).join('\u0000');
  }
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return el.checked ? '1' : '0';
  }
  return el.value;
}

// True when the control's live state matches its serialized (attribute-level)
// state — i.e. a snapshot taken right now would carry nothing new for it.
// persist's own listeners keep attributes current for USER input; only
// programmatic writes diverge here.
function serializedStateMatches(el) {
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.options).every((o) => o.selected === o.defaultSelected);
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      return el.checked === el.defaultChecked;
    }
    return el.value === el.defaultValue;
  }
  if (el instanceof HTMLTextAreaElement) {
    if (el.hasAttribute('data-value')) {
      return el.value === el.getAttribute('data-value');
    }
    return el.value === el.defaultValue;
  }
  return true;
}

export function persistProbeDirty() {
  for (const el of document.querySelectorAll(PERSIST_CONTROLS)) {
    const sig = controlSignature(el);
    if (probeCache.get(el) === sig) continue;
    if (serializedStateMatches(el)) {
      probeCache.set(el, sig);
      continue;
    }
    return true;
  }
  return false;
}

/** Call after the oracle verified the whole page clean against its baseline. */
export function probeMarkClean() {
  for (const el of document.querySelectorAll(PERSIST_CONTROLS)) {
    probeCache.set(el, controlSignature(el));
  }
}

export function pageMaybeDirty() {
  return changes > clearedAt || persistProbeDirty();
}

/**
 * Record the gate state at capture time. The save flow takes a token when it
 * clones the DOM and hands it back on success (or on a verified "no changes"),
 * so a clear can never swallow edits made while the save was in flight.
 */
export function gateCaptureToken() {
  const probe = [];
  for (const el of document.querySelectorAll(PERSIST_CONTROLS)) {
    probe.push([el, controlSignature(el)]);
  }
  return { gen: changes, probe };
}

export function gateClearIfUnchanged(token) {
  if (!token) return;
  if (changes === token.gen) {
    clearedAt = token.gen;
  }
  // Probe entries clear per element, and only if the element still holds the
  // exact value the capture carried — a programmatic write between capture
  // and completion stays dirty.
  for (const [el, sig] of token.probe) {
    if (controlSignature(el) === sig) probeCache.set(el, sig);
  }
}

if (typeof document !== 'undefined' && isEditMode) {
  startDirtyGate();
}
