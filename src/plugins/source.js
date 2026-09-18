/**
 * source.js — wire the source map into the save pipeline.
 *
 * On by default in edit mode; `exclude=source` turns it off. The mechanism lives in
 * core/source-map.js; this file is the
 * lifecycle around it: fetch the bytes this document was loaded from, pair them to
 * the page, render the save through them, verify, and re-pair when the file moves
 * under us.
 *
 * FOUR MOMENTS
 *
 *   boot          fetch the source, model it, refuse anything that is not this
 *                 document, and pair it against a save clone.
 *   save          render; verify; send the render if it verifies and today's full
 *                 serialization if it does not, counting the second case.
 *   accepted      re-model against the bytes the host took, so the next save is
 *                 measured from what is on disk rather than from what was there at
 *                 boot.
 *   sync-applied  re-pair, because a morph replaces live nodes and the map is keyed
 *                 by node identity.
 *
 * The last two share one deferred, coalesced refresh, so neither sits between a save
 * landing and the page hearing about it, and a burst of frames costs one walk.
 *
 * NOTHING HERE BLOCKS BOOT. The install is async and the loader does not wait for
 * it, because a save before it finishes is a save exactly as it is today. Waiting
 * would trade a guaranteed delay on every page for a better outcome on the rare save
 * that lands in the first few hundred milliseconds.
 *
 * WHEN IT DOES NOTHING
 *
 * Any of these leaves the save pipeline untouched, and each says so once in the
 * console rather than repeatedly at save time:
 *
 *   the source fetch fails, redirects, or is not text/html
 *   the fetched bytes disagree with the live document outside <html>
 *   the render throws
 *   the render does not verify
 */

import {
  model,
  checkSource,
  locate,
  pair,
  render,
  verify
} from '../core/source-map.js';
import {
  captureSaveClone,
  originalSnapshotNode,
  setSaveRenderer
} from '../core/snapshot.js';
import { onSaveAccepted } from '../core/save-core.js';

const state = {
  installed: false,
  refused: null,
  model: null,
  map: null,
  stats: null,
  saves: 0,
  reprints: 0,
  lastReprint: null,
  lastRenderMs: null,
  lastBytes: null,
  timing: { fetch: null, model: null, pair: null, refresh: null },
  refreshes: 0,
  refreshQueued: false,
  pendingBytes: null,
};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The bytes this document was loaded from.
 *
 * Every guard here is about one failure: writing somebody else's page into this
 * file. `redirect: 'manual'` and the `redirected` check catch a host that answers a
 * logged-out request with a login page at another URL; the content-type check
 * catches one that answers with JSON or an error page; `cache: 'no-store'` keeps a
 * stale cached copy of an older version of this document out of the model. The
 * shape check in checkSource is the backstop for whatever gets past all three.
 */
async function fetchSource(url) {
  const res = await fetch(url, { cache: 'no-store', redirect: 'manual', credentials: 'same-origin' });
  if (!res.ok) throw new Error(`source fetch: status ${res.status}`);
  if (res.redirected || res.type === 'opaqueredirect') throw new Error('source fetch: redirected');
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('text/html')) throw new Error(`source fetch: content-type ${type || 'missing'}`);
  return res.text();
}

/**
 * Pair the model against the page.
 *
 * Over a SAVE CLONE, not the live DOM. The clone is in the file's own domain: edit
 * mode deactivated back to the inert attribute forms, [no-save] regions gone, every
 * document transform run. Pairing the live DOM instead would compare
 * `contenteditable="true"` against the file's `inert-contenteditable="true"` and lose
 * the two strongest signature tiers on every activated element and every ancestor of
 * one. The map is keyed through snapshot provenance to the LIVE node, because the
 * clone is rebuilt on every save and its nodes are new objects each time.
 *
 * This capture is an INSPECTION, not a save, and it happens at boot and again on every
 * incoming live-sync frame. So it takes neither of the two things a save capture does
 * on its way past: it does not close the undo batch, which at boot and mid-typing
 * would split the user's undo history at a point they did not make, and it does not
 * run the page's own [onbeforesave] and [onbeforesnapshot] handlers, which are author
 * JavaScript that can do anything and are meant to run once per save. The cost is that
 * a page using those handlers pairs against a tree slightly behind the one it will
 * save, which costs some formatting fidelity on the nodes a handler touches and
 * nothing else, because the render is verified either way.
 */
function pairAgainstPage(m) {
  const clone = captureSaveClone({ flushUndo: false, authored: false });
  return pair(clone, m, originalSnapshotNode);
}

function install(sourceUrl) {
  const t0 = now();
  return fetchSource(sourceUrl).then((src) => {
    const t1 = now();
    const m = model(src);
    const refused = checkSource(m, document);
    if (refused) throw new Error(`source refused: ${refused}`);
    const t2 = now();
    const { map, stats } = pairAgainstPage(m);
    const t3 = now();

    state.model = m;
    state.map = map;
    state.stats = stats;
    state.timing = { fetch: t1 - t0, model: t2 - t1, pair: t3 - t2, refresh: null };
    state.installed = true;
    setSaveRenderer(renderSave);
    return summary();
  }).catch((err) => {
    // Not an error the page can do anything about, and not a failure of the save:
    // saves go out exactly as they would without this plugin. Said once.
    state.refused = String(err && err.message ? err.message : err);
    console.info(`clayjs: source map off (${state.refused}); saves use the full serialization`);
    return null;
  });
}

/**
 * Render one save, or hand back today's bytes.
 *
 * Exported so a test can drive the whole path, including the fallback, without a
 * server: `renderSave(clone, today, { breakText: true })` makes every text node
 * reprint, which changes the bytes while leaving the tree identical, and the verifier
 * must still pass it — a tree comparison is the right answer there, and reading that
 * pass as "the verifier is blind" is a mistake this project has already made once.
 * `{ corrupt: 'drop-first-text' }` is the one that must be REJECTED: it changes the
 * tree, which is exactly what the verifier is for.
 */
export function renderSave(clone, today, opts = {}) {
  if (!state.installed) return today;
  state.saves++;
  let out;
  try {
    out = render(clone, state.map, state.model, originalSnapshotNode, opts);
  } catch (err) {
    return reprint('render threw: ' + (err && err.message ? err.message : err), today);
  }
  const v = verify(out.text, today, document, clone, state.model.parseErrors);
  if (!v.ok) return reprint(v.diff, today);
  state.lastRenderMs = out.ms;
  state.lastBytes = out.text.length;
  return out.text;
}

/**
 * The fallback, and the alarm.
 *
 * Both halves matter. The bytes are today's, so the floor of this whole mechanism is
 * the behaviour it replaces. The event and the counter are how a reprint gets fixed
 * in the renderer or in the page, which is the only place it should ever be fixed: a
 * verifier loosened to make this counter look better would pass exactly the writes it
 * exists to stop.
 */
function reprint(reason, today) {
  state.reprints++;
  state.lastReprint = reason;
  console.warn('clayjs: source map did not verify, saving the full serialization instead:', reason);
  document.dispatchEvent(new CustomEvent('clay:save-reprinted', { detail: { reason } }));
  return today;
}

/**
 * The host took these bytes, so this is what the file holds now.
 *
 * Deferred, like the re-pair below and for the same reason: re-modelling walks the
 * whole document, and doing it inline would put that walk between the save landing
 * and the page being told about it. Only the most recent accepted bytes matter, so a
 * burst of saves costs one refresh.
 *
 * One caveat, worth knowing rather than working around: a host that rewrites on the
 * way in leaves this model describing something slightly different from disk.
 * htmlclay strips the save token from the root tag, which was never meant to reach
 * disk, so the model carries one attribute the file does not. It is self-correcting
 * rather than cumulative — the next render copies the token's bytes back out of the
 * model and the host strips them again — so the file stays put and only the model's
 * idea of the root tag is one attribute long.
 */
function adopt(bytes) {
  if (!state.installed) return;
  state.pendingBytes = bytes;
  scheduleRefresh();
}

/**
 * A morph replaced live nodes, so the map is keyed by objects that are no longer in
 * the page. Re-pair against the same model: for a peer frame the bytes on disk did
 * not change, and for a disk frame they changed to something this tab cannot see, so
 * the model is the best available answer either way.
 */
function queueRepair() {
  if (!state.installed) return;
  scheduleRefresh();
}

/**
 * Re-model if a save was accepted, re-pair either way, once, off the critical path.
 *
 * Coalescing is what makes this safe as well as cheap. Saves are serialized, so the
 * most recent accepted bytes are the file; a refresh that skipped an intermediate
 * save would still land on the right answer, and one that ran them out of order could
 * not.
 */
function scheduleRefresh() {
  if (state.refreshQueued) return;
  state.refreshQueued = true;
  const run = () => {
    state.refreshQueued = false;
    if (!state.installed) return;
    const bytes = state.pendingBytes;
    state.pendingBytes = null;
    const t = now();
    // The two halves fail independently, so they are tried independently. A refused
    // re-model used to skip the re-pair with it, and the re-pair is the half that
    // cannot be skipped: a morph replaced live nodes, so the old map is keyed by
    // objects no longer in the page, and every save after that reprints the whole
    // document until something else queues a refresh. The previous model still
    // describes real bytes, so re-pairing against it is the right answer.
    let m = state.model;
    if (bytes !== null) {
      try {
        const next = model(bytes);
        const refused = checkSource(next, document);
        if (refused) throw new Error(refused);
        m = next;
      } catch (err) {
        console.warn('clayjs: source map kept the previous model, the accepted bytes did not model:', err);
      }
    }
    try {
      const { map, stats } = pairAgainstPage(m);
      state.model = m;
      state.map = map;
      state.stats = stats;
      state.refreshes++;
      state.timing.refresh = now() - t;
    } catch (err) {
      // The map is now stale rather than wrong: it still describes the pairing as of
      // the last successful refresh. Renders off a stale map verify or fall back like
      // any other, so this costs formatting fidelity and nothing else.
      console.warn('clayjs: source map could not re-pair, continuing on the previous map:', err);
    }
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 0);
}

function summary() {
  const s = state.stats;
  return {
    installed: state.installed,
    refused: state.refused,
    sourceBytes: state.model ? state.model.src.length : null,
    paired: s ? s.paired : 0,
    unresolved: s ? s.unresolved : 0,
    unmatchedLive: s ? s.unmatchedLive.length : 0,
    unmatchedSource: s ? s.unmatchedSource.length : 0,
    attrDiffs: s ? s.attrDiffs.length : 0,
    saves: state.saves,
    reprints: state.reprints,
    lastReprint: state.lastReprint,
    lastRenderMs: state.lastRenderMs,
    lastBytes: state.lastBytes,
    refreshes: state.refreshes,
    timing: state.timing,
  };
}

export const source = {
  ready: null,
  stats: summary,
  /** The bytes this module believes are on disk right now. */
  text: () => (state.model ? state.model.src : null),
  /**
   * Where a live element is in those bytes: `{ from, to, line, column }`, or null.
   *
   * Offsets and `column` are UTF-16 code units into `text()`, not bytes. Slice `text()` with them
   * and the answer is exact; hand them to something that counts bytes and it is wrong on any
   * document with non-ASCII content, which is the kind of mistake that shows up months later in
   * one customer's file.
   *
   * null whenever this module cannot answer, which includes the whole document when the plugin
   * never installed or refused it. `stats().installed` and `stats().refused` say which, and an
   * agent that cannot tell "this element is new" from "this document has no map" will eventually
   * write into a file it was never modelling.
   */
  locate: (node) => (state.installed && node ? locate(node, state.map, state.model) : null),
  /** What did not pair, for working out why a document reprints more than it should. */
  unpaired: () => (state.stats
    ? { live: state.stats.unmatchedLive.slice(0, 50), source: state.stats.unmatchedSource.slice(0, 50) }
    : null),
};

onSaveAccepted(adopt);
document.addEventListener('clay:sync-applied', queueRepair);
source.ready = install(window.location.href);

export default source;
