/**
 * Whether this page autosaves, as decided once at boot by core/autosave.js.
 *
 * Kept in its own module so live sync can ask without importing autosave.js,
 * whose import alone would boot autosave into builds that left it out. An
 * <html autosave> attribute a frame carries later changes nothing here, the
 * same as it changes nothing in autosave.js.
 */
let active = false;

export function setAutosaveActive(value) {
  active = !!value;
}

export function autosaveActive() {
  return active;
}

// Live sync registers whether a lost conflict is still waiting on the person's save.
// Autosave asks when it fires, not when it was queued: a frame can land in between.
let hold = () => false;

export function setAutosaveHold(fn) {
  hold = fn;
}

export function autosaveHeld() {
  return hold();
}
