/**
 * unsaved-state.js: "this tab holds work its saved bytes cannot show".
 *
 * The close warning compares the page's bytes with the last save. Some work is
 * not in those bytes: text a live-sync merge replaced, kept in memory until the
 * person reviews it, or an editor's model ahead of the DOM it writes into. Its
 * owner registers a synchronous check here, and the close warning fires while
 * any check says pending. Checks run fresh each time, so a forgotten state can
 * never outlive what it describes, and a save never clears one.
 */
const sources = new Map();
let nextKey = 0;

export function registerUnsavedState({ id = '', isPending }) {
  const key = ++nextKey;
  sources.set(key, { id, isPending });
  let disposed = false;
  return {
    changed() {
      if (disposed) return;
      document.dispatchEvent(new CustomEvent('clay:unsaved-state-changed', {
        detail: { pending: pendingIds() },
      }));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sources.delete(key);
    },
  };
}

// A check that throws counts as pending: unknown is not clean.
function isPending(source) {
  try {
    return !!source.isPending();
  } catch (err) {
    console.error(`[clay] unsaved-state check "${source.id}" threw`, err);
    return true;
  }
}

export function pendingIds() {
  return [...sources.values()].filter(isPending).map((s) => s.id);
}

export function hasUnsavedState() {
  for (const source of sources.values()) if (isPending(source)) return true;
  return false;
}

if (typeof window !== 'undefined') {
  window.clay = window.clay || {};
  window.clay.registerUnsavedState = registerUnsavedState;
}
