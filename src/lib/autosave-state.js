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

// Live sync registers whether a lost conflict is waiting for the person's save.
// That save is the acknowledgement, so it goes out even when the bytes match.
let ackPending = () => false;

export function setAckPending(fn) {
  ackPending = fn;
}

export function saveAckPending() {
  return ackPending();
}
