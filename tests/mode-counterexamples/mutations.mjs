/**
 * The six defects the corpus is supposed to feel.
 *
 * Each entry is one guard, removed: `find` is the exact snippet that implements it in the
 * checkout, `replace` the smallest edit that takes the guard away, and `why` says in one
 * line what the guard buys and where it lives. A corpus copy is patched with exactly this
 * find and replace, so an edit that no longer matches once is a loud failure rather than a
 * mutation that presumably ran: `selftest` refuses the id instead of reporting a catch.
 *
 * These are planted only in scratch runtime copies. The checkout's `src/` is never changed.
 */
export const MUTATIONS = [
  {
    id: "skip-flush",
    file: "src/core/mode-transition.js",
    find: "        result = await flushSave({ keepalive, timeoutMs: Math.max(0, deadline - Date.now()), permit });",
    replace: "        result = { state: \"saved\", etag: null };",
    why: "src/core/mode-transition.js:87 writes the session's bytes at the exit barrier; without it a leave commits view over unsaved input",
  },
  {
    id: "drop-generation-checks",
    file: "src/core/save.js",
    find: "  return !!permit && livePermits.has(permit) && permit.generation === saveGenerationAt;",
    replace: "  return !!permit && livePermits.has(permit);",
    why: "src/core/save.js:673 admits a write only under a permit minted for the generation that owns the page, so a stale exit cannot write",
  },
  {
    id: "rebaseline-current-dom",
    file: "src/core/save.js",
    find: "    setLastSavedBaselines(forComparison, forDirty);",
    replace: "    const live = captureForComparisonAndDirty();\n    setLastSavedBaselines(live.forComparison, live.forDirty);",
    why: "src/core/save.js:706 advances both baselines from the pre-request capture, so an edit made while the write was on the wire stays unsaved",
  },
  {
    id: "route-draft-to-host",
    file: "src/core/save-core.js",
    find: "  return (isDraftMode ? sendToDraftStore(content) : fetch(url, options))",
    replace: "  return fetch(url, options)",
    why: "src/core/save-core.js:639 sends a draft save to the visitor's own store and a host save to its host, and never the other way round",
  },
  {
    id: "announce-view-before-acceptance",
    file: "src/core/mode-lifecycle.js",
    find: "    const barrier = await transition.runSaveBarrier({ operation, timeoutMs: deadline.remaining() });\n    if (!barrier.ok) throw Object.assign(fault(\"the exit barrier refused\", barrier.code || \"save-failed\"), barrier);",
    replace: "    commitModeFacts({ mode: \"view\", isEditMode: false, phase: \"idle\", reason: null });\n    announceMode();\n    const barrier = await transition.runSaveBarrier({ operation, timeoutMs: deadline.remaining() });\n    if (!barrier.ok) throw Object.assign(fault(\"the exit barrier refused\", barrier.code || \"save-failed\"), barrier);",
    why: "src/core/mode-lifecycle.js:470 commits and announces view only after the barrier accepted the bytes, so a refused exit never reads as a view",
  },
  {
    id: "leak-one-listener",
    file: "src/core/conflict-notice.js",
    find: "        dispose() {\n          disarm();\n          loading = false;",
    replace: "        dispose() {\n          loading = false;",
    why: "src/core/conflict-notice.js:138 aborts the notice's handlers on dispose, so a hundred cycles end with the listeners they started with",
  },
];
