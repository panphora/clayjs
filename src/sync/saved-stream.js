/**
 * saved-stream.js — the receive-only transport a reader follows saved files with.
 *
 * A reader has no write half. It needs the saved lane's startup GET, its frames and
 * its reconnect repair, and nothing else: no POST, no PATCH, no live relay, no page
 * store to admit anything into, and no write credentials. So this is a transport of
 * its own rather than a mode of live-sync.js, and it imports neither the save lane,
 * the live lane, the snapshot pipeline, the merge engine nor the editor.
 *
 * It owns a REPRESENTED RECEIPT — `{ bytes, etag, seq }` — and moves it only when
 * `onSnapshot` acknowledges a complete apply. `bytes` is one unmodified HTML string
 * from an accepted frame or GET, `etag` belongs to those bytes, and `seq` is the
 * resume floor that apply is known to cover. Transport watermarks never become part
 * of it: a cursor says what the stream will replay, not what this page holds.
 *
 * Branches, spelled out because each one is a way to show a reader a file it does
 * not hold or to hide one it does:
 *
 *   - a full frame with a newer sequence validates and applies; a duplicate or an
 *     older one is ignored without moving the receipt;
 *   - a frame with no sequence (an unstamped legacy host) is processed in arrival
 *     order and keeps `seq: null` rather than inventing one;
 *   - a cursor with `resync: true`, the startup version check and any content-less
 *     external-change or ETag notice refetch the served file with `cache: 'no-store'`;
 *     a stamp alone never repairs missing bytes, and a notice never moves the receipt;
 *   - a cursor jump without resync is transport bookkeeping only: other lanes consume
 *     numbers, so a gap does not prove a content frame is missing;
 *   - after a GET the cursor is a covered replay floor, not an ordering of versions.
 *     Until a frame confirms that body's version, a differing frame refetches instead
 *     of overwriting bytes that may already be newer; a frame that names the body's
 *     own stamp establishes the match and direct application resumes. An unstamped
 *     host stays on the conservative GET path, which may fetch more often;
 *   - a bad frame, a refused apply or a failed GET keeps the article and the receipt
 *     and reports a recoverable status; it never pretends the file was acknowledged;
 *   - stop aborts and invalidates every outstanding continuation, and nothing calls
 *     back after it.
 */

import { SyncStream } from './stream.js';
import { resolveWireProfile } from './wire-profile.js';

const LANE = 'saved';
const MAX_REPAIR_ATTEMPTS = 3;

function mintClientId() {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

function mintResumeId() {
  try {
    const bytes = new Uint8Array(16);
    (globalThis.crypto || window.crypto).getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/**
 * The version a fetched served document names on its own root, or null. Read from
 * the body, never from discovery: discovery answers about a later moment than any
 * response. Parsed detached, so this touches the live page nowhere.
 */
function readBodyStamp(html) {
  if (typeof html !== 'string' || html === '') return null;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return parsed.documentElement?.getAttribute('documentetag') || null;
}

const stampOf = (value) => (typeof value === 'string' && value ? value : null);
const seqOf = (value) => (Number.isSafeInteger(value) ? value : null);

function normalizeReceipt(represented) {
  if (represented == null) return Object.freeze({ bytes: null, etag: null, seq: null });
  if (typeof represented.bytes !== 'string' || represented.bytes === '') {
    throw new TypeError('createSavedStream: represented.bytes must be a full HTML string');
  }
  return Object.freeze({
    bytes: represented.bytes,
    etag: stampOf(represented.etag),
    seq: seqOf(represented.seq),
  });
}

/**
 * Follow saved frames for one reader.
 *
 * `onSnapshot(candidate)` runs synchronously and returns true only after the whole
 * candidate applied, so the receipt moves on acknowledgement and nowhere else. The
 * page URL is resolved against the real origin, never `document.baseURI`: a `<base>`
 * in the authored document must not choose where the reader streams or fetches.
 *
 * @param {Object} options
 * @param {string} [options.documentURL] - The page whose saved file to follow.
 * @param {?string} [options.servedEtag] - The stamp this response was served with.
 * @param {?{bytes: string, etag: ?string, seq: ?number}} [options.represented]
 * @param {function({bytes: string, etag: ?string, seq: ?number}): boolean} options.onSnapshot
 * @param {function(Object)} [options.onStatus]
 * @returns {{start: function(): Object, stop: function(), ready: ?Promise, represented: Object}}
 */
export function createSavedStream({ documentURL, servedEtag = null, represented = null, onSnapshot, onStatus } = {}) {
  if (typeof onSnapshot !== 'function') {
    throw new TypeError('createSavedStream: onSnapshot must be a function');
  }

  const pageURL = new URL(documentURL || window.location.href, window.location.origin).href;
  const startupCheck = Boolean(stampOf(servedEtag));

  let receipt = normalizeReceipt(represented);
  // The stamp of the last frame applied straight from the stream. A fetched body
  // carrying this stamp is the version the stream is at, not a newer one.
  let frameEtag = null;
  // Whether the receipt's version is known to sit at the stream's position. A GET
  // body no frame has confirmed leaves this false until one names its stamp.
  let matched = true;
  let watermark = receipt.seq ?? 0;
  let arrivals = 0;
  let generation = 0;
  let stopped = false;
  let stream = null;
  let repairJob = null;
  let pendingRepair = null;
  let repairPaused = false;

  const active = (gen) => !stopped && gen === generation;

  function report(state, detail = {}) {
    if (stopped || typeof onStatus !== 'function') return;
    onStatus({ state, ...detail });
  }

  function closeStream() {
    if (!stream) return;
    const closing = stream;
    stream = null;
    closing.onopen = null;
    closing.onerror = null;
    closing.onmessage = null;
    closing.close();
  }

  function abortRepair() {
    if (!repairJob) return;
    const job = repairJob;
    repairJob = null;
    job.controller.abort();
  }

  /**
   * Record one accepted body. The only writer of `receipt`, and it writes only when
   * the candidate applied completely.
   */
  function accept(candidate) {
    if (stopped) return false;
    const next = {
      bytes: candidate.bytes,
      etag: stampOf(candidate.etag),
      seq: seqOf(candidate.seq),
    };
    if (typeof next.bytes !== 'string' || next.bytes === '') {
      report('recoverable', { reason: 'invalid-bytes', seq: next.seq });
      return false;
    }
    if (next.bytes === receipt.bytes && next.etag === receipt.etag && next.seq === receipt.seq) {
      return true;
    }
    let applied = false;
    try {
      applied = onSnapshot(Object.freeze(next)) === true;
    } catch {
      applied = false;
    }
    if (!applied) {
      report('recoverable', { reason: 'refused', seq: next.seq, etag: next.etag });
      return false;
    }
    receipt = Object.freeze(next);
    report('applied', { seq: receipt.seq, etag: receipt.etag });
    return true;
  }

  function latestSeq(reason, kind) {
    if (kind === 'startup') return null;
    const candidate = Math.max(reason.seq ?? 0, watermark);
    return candidate > 0 ? candidate : null;
  }

  function deferRepair(reason, why) {
    pendingRepair = reason;
    repairPaused = true;
    report('recoverable', { reason: why, seq: reason.seq ?? null });
  }

  function requestRepair(reason) {
    if (stopped) return;
    pendingRepair = { kind: reason.kind, seq: seqOf(reason.seq), attempt: reason.attempt ?? 0 };
    repairPaused = false;
    runRepair();
  }

  function runRepair() {
    if (stopped || repairJob || repairPaused || !pendingRepair) return;
    const gen = generation;
    const reason = pendingRepair;
    pendingRepair = null;
    const controller = new AbortController();
    repairJob = { controller };
    const arrivalsAtStart = arrivals;
    const watermarkAtStart = watermark;

    const settle = (html) => {
      if (repairJob && repairJob.controller === controller) repairJob = null;
      if (!active(gen) || controller.signal.aborted) return;
      if (arrivals !== arrivalsAtStart || watermark !== watermarkAtStart) {
        // Something arrived while this body was read, so it may describe a page
        // this reader has already left. A reason queued by the arrival is newer
        // and owns the next attempt; otherwise ask again from the latest watermark.
        if (!pendingRepair) {
          const tried = (reason.attempt ?? 0) + 1;
          const next = { kind: reason.kind, seq: latestSeq(reason, reason.kind), attempt: tried };
          if (tried < MAX_REPAIR_ATTEMPTS) pendingRepair = next;
          else {
            deferRepair(next, 'repair-superseded');
            return;
          }
        }
      } else if (html == null) {
        deferRepair(reason, 'repair-failed');
        return;
      } else {
        acceptBody(html, reason);
      }
      runRepair();
    };

    fetch(pageURL, { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.text() : null))
      .then(settle)
      .catch(() => settle(null));
  }

  function acceptBody(html, reason) {
    const bodyStamp = readBodyStamp(html);
    // A missing stamp is null in the receipt, and a discovery stamp is never
    // attached. Identical bytes already named by a stamp keep that name.
    const etag = bodyStamp ?? (html === receipt.bytes ? receipt.etag : null);
    const seq = reason.kind === 'startup' ? receipt.seq : reason.seq ?? receipt.seq;
    if (!accept({ bytes: html, etag, seq })) return;
    // The body's version is matched only when a frame has already named it. Until
    // then, a differing frame refetches instead of overwriting newer fetched bytes.
    matched = bodyStamp !== null && bodyStamp === frameEtag;
    repairPaused = false;
    report('current', { seq: receipt.seq, etag: receipt.etag });
  }

  function onFrame(bytes, rawEtag, seq) {
    const etag = stampOf(rawEtag);
    if (seq !== null && receipt.seq !== null && seq <= receipt.seq) return;
    if (bytes === receipt.bytes) {
      // The same file with a newer stamp is a receipt advance, not a DOM write,
      // and a frame that names the receipt's own version establishes the match.
      if (etag !== null) {
        if (etag !== receipt.etag) accept({ bytes, etag, seq: seq ?? receipt.seq });
        matched = true;
      }
      return;
    }
    if (!matched) {
      if (etag !== null && etag === receipt.etag) {
        matched = true;
      } else {
        requestRepair({ kind: 'unmatched', seq });
        return;
      }
    }
    if (accept({ bytes, etag, seq })) {
      frameEtag = etag;
      matched = true;
    }
  }

  function onNotification(data, seq) {
    const info = data.data;
    if (info && info.kind === 'external-change') {
      if (typeof info.html === 'string') onFrame(info.html, info.etag, seq);
      else requestRepair({ kind: 'notice', seq });
      return;
    }
    if (typeof data.msg === 'string' && data.msg.endsWith('changed on disk outside this tab')) {
      requestRepair({ kind: 'notice', seq });
    }
  }

  function onMessage(raw, gen) {
    if (!active(gen)) return;
    arrivals++;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      report('recoverable', { reason: 'bad-json' });
      return;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      report('recoverable', { reason: 'bad-frame' });
      return;
    }
    const seq = seqOf(data.seq);
    if (seq !== null && seq > watermark) watermark = seq;
    if (data.type === 'notification') {
      onNotification(data, seq);
      return;
    }
    if (data.error) {
      report('recoverable', { reason: 'server-error', seq });
      return;
    }
    if (typeof data.html !== 'string') {
      // A stamp with no document proves nothing about these bytes: refetch instead.
      if (stampOf(data.etag)) requestRepair({ kind: 'notice', seq });
      else report('recoverable', { reason: 'bad-frame', seq });
      return;
    }
    onFrame(data.html, data.etag, seq);
  }

  function onCursor(raw, gen) {
    if (!active(gen)) return;
    arrivals++;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;
    const seq = seqOf(data.seq);
    if (seq !== null && seq > watermark) watermark = seq;
    if (data.resync === true) {
      requestRepair({ kind: 'resync', seq });
      return;
    }
    if (data.startup === true) requestRepair({ kind: 'startup', seq: null });
  }

  function onOpen(gen) {
    if (!active(gen)) return;
    report('open', { seq: receipt.seq, etag: receipt.etag });
    if (repairPaused) {
      repairPaused = false;
      runRepair();
      return;
    }
    // No served stamp means no provenance to check, so nothing here asks the
    // version question. A reader with no bytes at all has to ask for them, or a
    // quiet file would leave it with nothing to show.
    if (receipt.bytes === null && !startupCheck) requestRepair({ kind: 'startup', seq: null });
  }

  const handle = {
    ready: null,
    get represented() {
      return receipt;
    },
    start() {
      stopped = false;
      const gen = ++generation;
      closeStream();
      abortRepair();
      pendingRepair = null;
      repairPaused = false;
      arrivals = 0;
      matched = true;
      watermark = receipt.seq ?? 0;
      handle.ready = resolveWireProfile().then((resolved) => {
        if (!active(gen)) return handle;
        const resumeId = mintResumeId();
        const clientId = mintClientId();
        const path = resolved.profile.streamPath(pageURL, LANE, resumeId, clientId);
        // Resolved against the real origin: a <base href> would otherwise point
        // the reader's stream at an origin the authored document chose.
        const opened = new SyncStream(new URL(path, window.location.origin).href, {
          shared: resolved.sharedSync,
          sharedData: resolved.sharedData,
          documentURL: pageURL,
          lane: LANE,
          clientId,
          startupCheck,
        });
        stream = opened;
        opened.onopen = () => onOpen(gen);
        opened.onerror = () => { if (active(gen)) report('reconnecting'); };
        opened.onmessage = (event) => onMessage(event.data, gen);
        opened.addEventListener('cursor', (event) => onCursor(event.data, gen));
        return handle;
      });
      return handle;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      generation++;
      closeStream();
      abortRepair();
      pendingRepair = null;
      repairPaused = false;
    },
  };

  return handle;
}
