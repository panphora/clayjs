/**
 * live-sync.js — Real-time sync between admin users
 *
 * HOW IT WORKS:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  1. LISTEN            snapshot-ready event from save    │
 *   │                       (full document with form values)  │
 *   └─────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  2. SEND               POST html to /_/live-sync/save   │
 *   │                        (debounced, skip if unchanged)   │
 *   └─────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  3. RECEIVE            SSE stream from server           │
 *   │                        (other clients' changes)         │
 *   └─────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  4. MORPH              HyperMorph full documentElement  │
 *   │                        (preserves focus, input values)  │
 *   └─────────────────────────────────────────────────────────┘
 *
 * LANES: edit-mode tabs ride the 'live' lane (steps 1-4: they broadcast
 * pre-strip snapshots to peers and receive theirs). View-mode tabs ride the
 * 'saved' lane: receive-only (steps 3-4), fed post-strip on-disk HTML by the
 * server whenever the file is persisted (browser save, code editor, device
 * sync, template/restore, local external edits).
 *
 * INTEGRATES WITH: snapshot.js (receives snapshot-ready events)
 */

import { HyperMorph, morph } from "../vendor/hyper-morph.vendor.js";
import Mutation from "../lib/mutation.js";
import { isSnapshotRemoved } from "../lib/region-policy.js";
import { isEditMode } from "../core/is-edit-mode.js";
import { mergeTagRecognizers } from "./merge-tags.js";
import { serializeForSync, captureForComparison, captureSnapshot } from '../core/snapshot.js';
import { isTabLocalRootAttr } from '../lib/root-attrs.js';
import { protectPeerDoc, protectDiskDoc, activateIncomingDoc } from './splice-merge.js';
import { pageMaybeDirty, pauseGate, resumeGate } from '../lib/dirty-gate.js';
import { savePageThrottled, setLastSavedContents, setUnsavedChanges } from '../core/save.js';

class LiveSync {
  constructor() {
    this.sse = null;
    this.currentFile = null;
    this.lastHtml = null;
    this.clientId = this.generateClientId();

    // Per-stream resume id for the htmlclay replay server's wire contract.
    // Regenerated on every start() (see below) so an explicit stop/start is a
    // brand-new stream that never inherits the old baseline. Native
    // EventSource reuses the same URL — and thus this id — on its own
    // automatic reconnect. Deliberately NOT the sender clientId, which is the
    // durable per-tab identity used for echo suppression.
    this.resumeId = null;

    this.debounceMs = 150;
    this.debounceTimer = null;
    this._sendInFlight = false;
    this._queuedSend = null;
    this.isPaused = false;
    this.isDestroyed = false;
    this.debug = false;

    // Lane on the shared per-file SSE channel. Edit mode: 'live' (owner-gated,
    // pre-strip peer snapshots + notifications). View mode: 'saved' (receive-
    // only post-strip on-disk HTML). Overridable per-instance for tests.
    this.lane = isEditMode ? 'live' : 'saved';

    // Store handler reference for cleanup
    this._snapshotHandler = null;

    // High-water mark of server seqs we've seen on this channel (own echoes
    // count too). Server-broadcast payloads carry a monotonic seq
    // (Date.now()-based). We drop anything <= this to guard against rare
    // cases where a stale message lands after a newer one, e.g. buffered
    // replay, alt backend after reconnect, or an own-save echo arriving
    // after a peer's newer broadcast.
    this.lastSeenSeq = 0;

    // rAF-paced single-flight queue. Incoming updates overwrite a pending
    // slot; on each animation frame, if a slot is set and no morph is in
    // flight, run one morph against the latest pending payload. Burst
    // arrivals collapse to one morph per frame, keeping the receiver from
    // falling behind under load. A morph with external scripts returns a
    // Promise, so the in-flight flag prevents overlap.
    this._pendingHtml = null;
    this._pendingSeq = null;
    this._pendingIdentityMap = null;
    this._morphInFlight = false;
    this._rafHandle = null;

    // Disk-sourced external changes (htmlclay watcher content) get their own
    // one-deep slot so a peer frame arriving in the same window can't
    // displace them. Drained in seq order alongside the peer slot.
    this._pendingExternal = null;   // { html, seq, saveEpoch }

    // Newest external-change seq accepted for apply. Replayed or reordered
    // disk frames (and their fetch fallbacks) are dropped against this.
    this._lastExternalSeq = 0;

    // Bumped on every own save success. A queued disk frame older than our
    // own landed save is stale by construction: the save just made disk
    // equal our state.
    this._saveEpoch = 0;
    this._saveSavedHandler = null;

    // The identityMap that came with lastHtml, so the peer-lane dirty diff
    // can resolve synthetic identities on its base tree.
    this._lastIdentityMap = null;

    // Bumped whenever an APPLY (or a reset) rewrites lastHtml. A POST's
    // success callback carries no ordering guarantee against the SSE stream,
    // so a delayed response must not rewind lastHtml past a frame that
    // applied while it was on the wire.
    this._applyGen = 0;

    // Hold-retry timers, one per pending slot. A held frame's slot and seq
    // watermark have already advanced, so nothing redelivers it; the retry
    // re-queues the same payload so it applies if the blocking local edit is
    // undone, and is dropped by the seq/epoch checks if it went stale.
    this._holdRetryPeer = null;
    this._holdRetryExt = null;

    // Identity tracking for content-based morphing across live-sync updates.
    // Synthetic IDs (`<clientId>:<counter>`) live here only — never written to
    // the DOM, never serialized into saved HTML. The WeakMap holds them
    // against the live elements so that the next save can produce the same
    // identityMap, and afterNodeMorphed transfers IDs from incoming parsed
    // elements onto the live elements they morphed into.
    this.idCounter = 0;
    this.liveWeakMap = new WeakMap();

    // Callbacks
    this.onConnect = null;
    this.onDisconnect = null;
    this.onUpdate = null;
    this.onError = null;
    this.onNotification = null;
  }

  _log(message, data = null) {
    if (!this.debug) return;
    const prefix = `[LiveSync ${new Date().toISOString()}]`;
    if (data !== null) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }

  /**
   * Mint the per-tab sender identity used for echo suppression. Lives on the
   * instance, never in storage: sessionStorage is COPIED into a duplicated tab,
   * so a persisted id made the duplicate treat the original's edits as its own
   * echoes and the two tabs silently stopped syncing. Instance lifetime is the
   * durability that matters, since EventSource auto-reconnect reuses this same
   * instance.
   */
  generateClientId() {
    return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
  }

  /**
   * Generate a fresh per-stream resume id (URL-safe, well under the 128-byte
   * wire limit). Minted on every start(), never persisted: an explicit
   * stop/start must not reuse the previous stream's baseline.
   */
  generateResumeId() {
    try {
      const bytes = new Uint8Array(16);
      (globalThis.crypto || window.crypto).getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  /**
   * Start the LiveSync system
   * Can be called after stop() to restart with a new file
   */
  start(file = null) {
    // Reset destroyed flag to allow restart after stop()
    this.isDestroyed = false;

    // Prevent double-connect: clean up existing connection first
    if (this.sse || this._snapshotHandler) {
      this.cleanup();
    }

    this.currentFile = file || this.detectCurrentFile();

    if (!this.currentFile) {
      console.warn('[LiveSync] No file detected');
      return;
    }

    // Reset state for new connection. Resetting lastSeenSeq is a new baseline,
    // so mint a fresh resume id — this stream must not resume the previous one.
    this.lastHtml = null;
    this._lastIdentityMap = null;
    this._applyGen++;
    this.lastSeenSeq = 0;
    this._lastExternalSeq = 0;
    this._pendingExternal = null;
    this.resumeId = this.generateResumeId();

    console.log(`[LiveSync] Starting for: ${this.currentFile} (lane=${this.lane})`);
    this.connect();
    // View-mode tabs are receive-only: saves are edit-gated upstream, so a
    // snapshot listener would never fire — skip registering it.
    if (this.lane === 'live') {
      this.listenForSnapshots();
      this._saveSavedHandler = () => { this._saveEpoch++; };
      document.addEventListener('clay:save-saved', this._saveSavedHandler);
    }
  }

  /**
   * Clean up resources without marking as destroyed
   * Used internally by start() to prevent double-connect
   */
  cleanup() {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }

    if (this._snapshotHandler) {
      document.removeEventListener('clay:snapshot-ready', this._snapshotHandler);
      this._snapshotHandler = null;
    }

    if (this._saveSavedHandler) {
      document.removeEventListener('clay:save-saved', this._saveSavedHandler);
      this._saveSavedHandler = null;
    }

    clearTimeout(this.debounceTimer);
    this._queuedSend = null;

    // Cancel any pending frame and clear the queue. A morph already in
    // flight cannot be aborted; the isDestroyed check in _runPending guards
    // its post-morph rescheduling so the queue stops cleanly.
    if (this._rafHandle != null) {
      this._cancelFrame(this._rafHandle);
      this._rafHandle = null;
    }
    this._pendingHtml = null;
    this._pendingSeq = null;
    this._pendingIdentityMap = null;
    this._pendingExternal = null;
    clearTimeout(this._holdRetryPeer);
    clearTimeout(this._holdRetryExt);
    this._holdRetryPeer = null;
    this._holdRetryExt = null;
  }

  _mintId() {
    this.idCounter++;
    return `${this.clientId}:${this.idCounter}`;
  }

  /**
   * Walk the live DOM and the snapshot clone in lockstep. Path keys come
   * from the clone (= what the receiver will see, after [snapshot-remove]
   * and snapshotHooks). WeakMap lookup happens against the live element so
   * synthetic IDs persist across saves.
   *
   * The live walk filters [snapshot-remove] to mirror the clone's earlier
   * strip in captureSnapshot. If child counts diverge anywhere (an
   * onbeforesnapshot handler added/removed siblings on the clone), the
   * subtree is skipped — better to fall back to content scoring there than
   * emit misaligned IDs.
   *
   * @param {Element} liveRoot
   * @param {Element} cloneRoot
   * @returns {Object} identityMap keyed by dot-path
   */
  _buildIdentityMap(liveRoot, cloneRoot) {
    const map = {};
    if (!liveRoot || !cloneRoot) return map;

    const visit = (live, clone, path) => {
      let id = this.liveWeakMap.get(live);
      if (!id) {
        id = this._mintId();
        this.liveWeakMap.set(live, id);
      }
      map[path] = id;

      const liveKids = [];
      for (const c of live.children) {
        if (!isSnapshotRemoved(c)) liveKids.push(c);
      }
      const cloneKids = clone.children;

      if (liveKids.length !== cloneKids.length) {
        this._log(
          `identity map: subtree skipped at "${path}" (live=${liveKids.length}, clone=${cloneKids.length})`
        );
        return;
      }

      for (let i = 0; i < liveKids.length; i++) {
        visit(liveKids[i], cloneKids[i], path === '' ? String(i) : `${path}.${i}`);
      }
    };

    visit(liveRoot, cloneRoot, '');
    return map;
  }

  /**
   * Walk a single parsed tree, invoking cb(element, path) at each Element.
   * Paths use the same dot-segment scheme as _buildIdentityMap so the
   * receiver can look up IDs by the path the sender emitted.
   */
  _walkParsedTree(root, cb) {
    if (!root) return;
    const visit = (el, path) => {
      cb(el, path);
      const kids = el.children;
      for (let i = 0; i < kids.length; i++) {
        visit(kids[i], path === '' ? String(i) : `${path}.${i}`);
      }
    };
    visit(root, '');
  }

  /**
   * Fill liveWeakMap entries for live elements that the matcher's
   * afterNodeMorphed didn't reach. createNode's no-id-children
   * optimization (hyper-morph importNode path) inserts a clone of the
   * parsed element without invoking morphNode, so afterNodeMorphed never
   * fires for those subtrees and their synthetic IDs would be lost. On
   * the receiver's next save, _buildIdentityMap would mint fresh IDs for
   * the same logical elements, breaking convergence for newly-added
   * ambiguous siblings — exactly the case identity-map exists to fix.
   *
   * Walks live and parsed in lockstep, reading ids off the parsed NODES
   * (parsedWeakMap) rather than re-deriving dot-paths: a protected splice
   * shifts paths, but the WeakMap entries ride the nodes and stay correct.
   * Filters [snapshot-remove] from the live side to stay aligned with the
   * sender's clone view. Aborts a subtree on child-count divergence (e.g.
   * local save-ignore additions) — those elements fall through to content
   * scoring on the next round, which is the same fallback as a sender-side
   * lockstep skip.
   *
   * @param {Element} liveRoot - post-morph live tree root
   * @param {Element} parsedRoot - parsed-tree root
   * @param {WeakMap} parsedWeakMap - parsed node → synthetic id
   */
  _fillInIdsAfterMorph(liveRoot, parsedRoot, parsedWeakMap) {
    if (!liveRoot || !parsedRoot || !parsedWeakMap) return;
    const visit = (live, parsed) => {
      const id = parsedWeakMap.get(parsed);
      if (id && !this.liveWeakMap.has(live)) {
        this.liveWeakMap.set(live, id);
      }
      const liveKids = [];
      for (const c of live.children) {
        if (!isSnapshotRemoved(c)) liveKids.push(c);
      }
      const parsedKids = parsed.children;
      if (liveKids.length !== parsedKids.length) return;
      for (let i = 0; i < liveKids.length; i++) {
        visit(liveKids[i], parsedKids[i]);
      }
    };
    visit(liveRoot, parsedRoot);
  }

  /**
   * Auto-detect the current site file path from the URL
   * Returns the path including extension (e.g., card-canvas.html)
   *
   * Handles:
   * - /                           -> index.html
   * - /about.html                 -> about.html
   * - /about.htmlclay             -> about.htmlclay
   * - /about.html/dashboard       -> about.html  (SPA route stripped)
   * - /blog/app.htmlclay/settings -> blog/app.htmlclay  (SPA route stripped)
   */
  detectCurrentFile() {
    let pathname = window.location.pathname;

    if (pathname === '/') {
      return 'index.html';
    }

    pathname = pathname.replace(/^\//, '');

    const htmlMatch = pathname.match(/^(.*?\.html(?:clay)?)/);
    if (htmlMatch) return htmlMatch[1];

    return pathname;
  }

  /**
   * Connect to the SSE endpoint
   * Uses native EventSource reconnection behavior
   */
  connect() {
    if (this.isDestroyed) return;

    const pageUrl = encodeURIComponent(window.location.href);
    const path = `/_/live-sync/stream?page-url=${pageUrl}&lane=${this.lane}&resume-id=${this.resumeId}`;
    // Resolved against the real origin: a <base href> in the authored document
    // would otherwise point the sync stream at an origin the document chose.
    this.sse = new EventSource(new URL(path, window.location.origin).href);

    this.sse.onopen = () => {
      console.log('[LiveSync] Connected');
      if (this.onConnect) this.onConnect();
    };

    // The cursor frame is a NAMED SSE event, so it never reaches onmessage and
    // never looks like data. Its `resync` flag says the server could not retain
    // everything between where this client resumed and the baseline it is
    // sending: what this page holds is stale in a way no replay will fix.
    //
    // The repair is the token-free fetch of the served document this class
    // already runs for a change too large to send, so noticing the flag is the
    // whole of the work.
    this.sse.addEventListener('cursor', (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!data || data.resync !== true) return;
      console.log('[LiveSync] Server could not replay everything; refetching the document');
      // _fetchServedDocument, deliberately, and not _fetchExternalChange: that
      // one drops a fetch whose seq is at or below the external watermark, and
      // the cursor baseline routinely is, since it is the server's high-water
      // mark and our own last applied change may already have reached it. A
      // resync that skipped itself for being "already seen" would leave the page
      // permanently stale, which is the exact failure the flag exists to report.
      this._fetchServedDocument(typeof data.seq === 'number' ? data.seq : undefined, {
        repair: true,
      });
    });

    this.sse.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Staleness check + watermark advance run FIRST — before the notification
      // and error branches — against the high-water mark of seqs we've seen
      // (own echoes count too, see below). Notification frames now carry a seq,
      // so a conservative-cursor replay after reconnect must not duplicate a
      // toast or let a later stale data frame apply an older snapshot. `seq` is
      // optional for back-compat with older servers that don't stamp it.
      const { seq } = data;
      if (typeof seq === 'number' && seq <= this.lastSeenSeq) {
        this._log(`Dropping stale message: seq=${seq}, lastSeen=${this.lastSeenSeq}`);
        return;
      }

      // Advance the watermark before the notification/sender branches so that
      // our own save echoes count toward "seen". Without this, a later
      // buffered/replayed message with a smaller seq could rewind us past our
      // local edit.
      if (typeof seq === 'number') {
        this.lastSeenSeq = seq;
      }

      // External disk changes ride the notification channel as first-class
      // content (data.kind === 'external-change'). They apply silently —
      // Google-Docs-style — so a handled one never reaches the toast branch.
      if (data.type === "notification") {
        if (this._maybeAcceptExternalChange(data)) return;
        this.handleNotification(data);
        return;
      }

      // Handle error events from server
      if (data.error) {
        console.error('[LiveSync] Server error:', data.error);
        if (this.onError) this.onError(new Error(data.error));
        return;
      }

      const { html, sender, identityMap } = data;

      // Ignore own changes — already reflected in the DOM, nothing to morph
      if (sender === this.clientId) {
        this._log('Ignoring own message (sender matches clientId)');
        return;
      }

      // Guard against invalid html
      if (typeof html !== 'string') {
        console.error('[LiveSync] Received invalid html, ignoring');
        return;
      }

      this._log(`Received update from: ${sender} (my clientId: ${this.clientId}, seq=${seq})`);
      this.applyUpdate(html, seq, identityMap);
      if (this.onUpdate) this.onUpdate({ html, sender, seq, identityMap });
    };

    // Native EventSource auto-reconnects on transient errors
    // We just surface the status via callbacks
    this.sse.onerror = () => {
      if (this.sse.readyState === EventSource.CONNECTING) {
        console.log('[LiveSync] Reconnecting...');
      } else if (this.sse.readyState === EventSource.CLOSED) {
        console.log('[LiveSync] Connection closed');
        if (this.onError) this.onError(new Error('Connection closed'));
      }
      if (this.onDisconnect) this.onDisconnect();
    };
  }

  /**
   * Listen for snapshot-ready events from the save system.
   * Receives the full cloned documentElement and sends it.
   */
  listenForSnapshots() {
    this._snapshotHandler = (event) => {
      if (this.isPaused) {
        this._log('snapshot-ready received but isPaused, skipping');
        return;
      }

      const { documentElement: clone } = event.detail;
      if (!clone) return;

      // Capture both synchronously inside the event handler — captureSnapshot's
      // caller continues to mutate the clone (strip [save-remove], run hooks)
      // after dispatchEvent returns, so reading outerHTML and walking children
      // must happen now.
      this._log('snapshot-ready received, preparing to send');
      const html = serializeForSync(clone);
      const identityMap = this._buildIdentityMap(document.documentElement, clone);
      this.sendUpdate(html, identityMap);
    };

    document.addEventListener('clay:snapshot-ready', this._snapshotHandler);
  }

  /**
   * Send full HTML to the server (debounced, single-flight).
   *
   * One POST on the wire at a time, with at most one newer payload queued; a
   * fresher snapshot replaces the queued one, because peers only ever need the
   * latest state. Two concurrent fetches could reach the server in either order,
   * and last-write-wins then stored the OLDER snapshot for every peer.
   */
  sendUpdate(html, identityMap) {
    clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this._enqueueSend(html, identityMap);
    }, this.debounceMs);
  }

  _enqueueSend(html, identityMap) {
    if (this._sendInFlight) {
      this._queuedSend = { html, identityMap };
      return;
    }
    this._postUpdate(html, identityMap);
  }

  _postUpdate(html, identityMap) {
    // Skip if unchanged
    if (html === this.lastHtml) {
      this._log('Skipping send - HTML unchanged');
      return;
    }

    this._log(`Sending update (HTML length: ${html.length}, lastHtml length: ${this.lastHtml?.length || 0})`);

    this._sendInFlight = true;
    const gen = this._applyGen;

    // Absolute against the real origin, so a <base href> in the page cannot
    // redirect the whole document to an origin the author picked.
    fetch(new URL('/_/live-sync/save', window.location.origin).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Page-URL': window.location.href },
      body: JSON.stringify({
        html: html,
        sender: this.clientId,
        identityMap: identityMap
      })
    }).then(response => {
      if (response.ok) {
        // A frame that applied while this POST was on the wire has already
        // advanced lastHtml past this snapshot; assigning would rewind the
        // diff base to pre-frame state and misclassify the frame's content
        // as local edits on the next dirty apply.
        if (this._applyGen === gen) {
          this.lastHtml = html;
          this._lastIdentityMap = identityMap || null;
        } else {
          this._log('Skipping lastHtml advance: a frame applied during the POST');
        }
      } else {
        console.warn('[LiveSync] Save returned status:', response.status);
      }
    }).catch(err => {
      console.error('[LiveSync] Save failed:', err);
      if (this.onError) this.onError(err);
    }).finally(() => {
      this._sendInFlight = false;
      const queued = this._queuedSend;
      this._queuedSend = null;
      if (queued) this._postUpdate(queued.html, queued.identityMap);
    });
  }

  /**
   * Route an external disk change (htmlclay watcher) out of the notification
   * path. Returns true when the notification was consumed — the caller must
   * then skip the toast branch entirely (silent UX).
   *
   * New servers mark these with data.kind === 'external-change' and embed the
   * disk HTML (omitted only when it exceeds the server's size cap). Old
   * servers send a bare warning with the watcher's fixed message shape; both
   * content-less forms fall back to a token-free fetch of the served page.
   */
  _maybeAcceptExternalChange(data) {
    if (this.lane !== 'live') return false;
    const info = data.data;
    if (info && info.kind === 'external-change') {
      if (typeof info.html === 'string') {
        this._enqueueExternal(info.html, data.seq);
      } else {
        this._fetchExternalChange(data.seq);
      }
      return true;
    }
    if (typeof data.msg === 'string' && data.msg.endsWith('changed on disk outside this tab')) {
      this._fetchExternalChange(data.seq);
      return true;
    }
    return false;
  }

  _enqueueExternal(html, seq) {
    if (typeof seq === 'number') {
      if (seq <= this._lastExternalSeq) {
        this._log(`Dropping replayed external change: seq=${seq}`);
        return;
      }
      this._lastExternalSeq = seq;
    }
    this._pendingExternal = { html, seq, saveEpoch: this._saveEpoch };
    this._scheduleNextFrame();
  }

  /**
   * Content-less fallback: fetch the served document. The request carries no
   * Sec-Fetch-Dest: document, so htmlclay serves it token-free; the morph's
   * root-attribute veto keeps this tab's own token either way. The result is
   * stamped with the triggering notification's seq and dropped if a newer
   * external change (or our own save) landed while it was in flight.
   */
  _fetchExternalChange(seq) {
    if (typeof seq === 'number') {
      if (seq <= this._lastExternalSeq) return;
      this._lastExternalSeq = seq;
    }
    this._fetchServedDocument(seq);
  }

  /**
   * GET the served document and queue it as an external change. No watermark
   * check of its own — callers own that — so it can also re-materialize a
   * frame the epoch check refused (the fetched body is whatever disk holds
   * NOW, which is always safe to apply).
   */
  _fetchServedDocument(seq, { attempt = 0, repair = false } = {}) {
    const epoch = this._saveEpoch;
    fetch(new URL(window.location.href), { cache: 'no-store' })
      .then((response) => (response.ok ? response.text() : null))
      .then((html) => {
        if (this.isDestroyed || html == null) return;
        if (typeof seq === 'number' && seq < this._lastExternalSeq) {
          // A newer external change superseded this one, and its own fetch will
          // queue a body. Except for a repair: that one exists because the server
          // said replay cannot fix this page, so if the newer fetch fails there is
          // nothing else coming. Refetch rather than drop the only repair.
          if (repair && attempt < 3) {
            this._fetchServedDocument(seq, { attempt: attempt + 1, repair });
          }
          return;
        }
        if (this._saveEpoch > epoch) {
          // An own save landed while the GET was in flight, so this body may
          // predate it. Save-response order proves nothing about disk-write
          // order — refetch for the newest bytes instead of dropping.
          if (attempt < 3) {
            console.log('[LiveSync] Refetching external change: own save landed mid-fetch');
            this._fetchServedDocument(seq, { attempt: attempt + 1, repair });
          }
          return;
        }
        this._pendingExternal = { html, seq, saveEpoch: epoch };
        this._scheduleNextFrame();
      })
      .catch((err) => {
        this._log('External-change fetch failed', err);
        // The watermark already advanced for this seq; leaving it there
        // would drop the change forever. Roll back so a replay or a later
        // duplicate can redeliver it.
        if (typeof seq === 'number' && this._lastExternalSeq === seq) {
          this._lastExternalSeq = seq - 1;
        }
      });
  }

  /**
   * Apply an update received from the server. Morphs the entire document.
   *
   * Updates land in a single pending slot. On each animation frame, the
   * latest pending payload is morphed once; intermediate updates that
   * arrived between frames are skipped because they would be replaced
   * milliseconds later anyway. Burst arrivals collapse to roughly one morph
   * per frame, so the receiver always shows current state instead of
   * playing back a backlog of stale snapshots.
   *
   * @param {string} html - Full document HTML
   * @param {number} [seq] - Optional monotonic seq from the server
   * @param {Object} [identityMap] - Optional element-identity map from sender
   */
  applyUpdate(html, seq, identityMap) {
    if (this.isDestroyed) return;
    this._pendingHtml = html;
    this._pendingSeq = seq;
    this._pendingIdentityMap = identityMap;
    this._scheduleNextFrame();
  }

  /**
   * Schedule the next-frame morph if one isn't already pending. Skipped when
   * a morph is in flight; the morph's post-completion check will reschedule
   * if a newer payload arrived during it.
   */
  _scheduleNextFrame() {
    if (this.isDestroyed) return;
    if (this._rafHandle != null) return;
    if (this._morphInFlight) return;
    this._rafHandle = this._requestFrame(() => this._runPending());
  }

  /**
   * Drain one pending payload per frame. Errors are caught and logged so a
   * single failed morph does not stop the queue.
   *
   * Two slots feed this: peer frames and disk-sourced external changes. When
   * both are pending, the lower seq applies first so the two lanes land in
   * server order; the other stays queued for the next frame.
   */
  async _runPending() {
    this._rafHandle = null;
    if (this.isDestroyed) return;

    const ext = this._pendingExternal;
    let runExternal = false;
    if (ext != null) {
      if (this._pendingHtml == null) {
        runExternal = true;
      } else {
        runExternal = !(
          typeof ext.seq === 'number' &&
          typeof this._pendingSeq === 'number' &&
          this._pendingSeq < ext.seq
        );
      }
    }

    if (runExternal) {
      this._pendingExternal = null;
      // Stale-at-drain checks: a newer external change already superseded
      // this frame, or our own save landed after it was queued.
      if (typeof ext.seq === 'number' && ext.seq < this._lastExternalSeq) {
        this._log('Dropping superseded external change at drain');
      } else if (ext.saveEpoch !== this._saveEpoch) {
        // The epoch moved, but save-response order does not prove disk-write
        // order: the frame's content may still be newer than our save.
        // Refetch the served document — applying what disk holds NOW is
        // always safe — instead of dropping the frame.
        console.log('[LiveSync] Refetching external change: own save landed after queue');
        this._fetchServedDocument(ext.seq);
      } else {
        this._morphInFlight = true;
        try {
          await this._doApplyExternal(ext.html, ext.seq);
        } catch (err) {
          console.error('[LiveSync] applyExternal failed:', err);
        } finally {
          this._morphInFlight = false;
        }
      }
    } else {
      const html = this._pendingHtml;
      const seq = this._pendingSeq;
      const identityMap = this._pendingIdentityMap;
      this._pendingHtml = null;
      this._pendingSeq = null;
      this._pendingIdentityMap = null;
      if (html == null) return;

      this._morphInFlight = true;
      try {
        await this._doApplyUpdate(html, seq, identityMap);
      } catch (err) {
        console.error('[LiveSync] applyUpdate failed:', err);
      } finally {
        this._morphInFlight = false;
      }
    }

    // A newer payload may have arrived during the morph, or the other slot
    // is still holding one. Schedule another frame to drain it. Without
    // this, late-arriving updates would sit forever until the next
    // applyUpdate call.
    if (!this.isDestroyed &&
        (this._pendingHtml != null || this._pendingExternal != null)) {
      this._scheduleNextFrame();
    }
  }

  _requestFrame(cb) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(cb);
    }
    return setTimeout(cb, 16);
  }

  _cancelFrame(handle) {
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(handle);
      return;
    }
    clearTimeout(handle);
  }

  /**
   * Actual morph work. Do not call directly. Use applyUpdate() so calls
   * pass through the rAF queue and don't overlap.
   * @param {string} html
   * @param {number} [seq]
   * @param {Object} [identityMap]
   * @returns {Promise<void>}
   */
  async _doApplyUpdate(html, seq, identityMap) {
    this._log('applyUpdate - pausing mutations and morphing');
    this.isPaused = true;

    // Preserve scroll position: a remote edit that inserts or removes content
    // above the viewport would otherwise cause a visible jump. Capturing here
    // and restoring after the morph keeps the viewport stable. Browser
    // scroll-clamping handles the case where the document is now shorter.
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Pause mutation observer so morph doesn't trigger autosave
    Mutation.pause();
    pauseGate();

    // Parse as full document
    const parser = new DOMParser();
    const newDoc = parser.parseFromString(html, 'text/html');

    // Build the parsed-tree WeakMap from the incoming identityMap. The
    // sender emitted paths off its clone, which is exactly what we just
    // parsed, so the same path scheme indexes into both trees.
    const parsedWeakMap = new WeakMap();
    if (identityMap && typeof identityMap === 'object' && !Array.isArray(identityMap)) {
      this._walkParsedTree(newDoc.documentElement, (el, path) => {
        const id = identityMap[path];
        if (id) parsedWeakMap.set(el, id);
      });
    }

    const liveWeakMap = this.liveWeakMap;
    // Priority: synthetic IDs win when present (they're updated after every
    // morph via afterNodeMorphed). data-id / id is the durable fallback that
    // covers the bootstrap window and any element that hasn't been paired yet.
    const key = (el) =>
      liveWeakMap.get(el) ||
      parsedWeakMap.get(el) ||
      (el.getAttribute && el.getAttribute('data-id')) ||
      (el.getAttribute && el.getAttribute('id')) ||
      null;
    const afterNodeMorphed = (oldEl, newEl) => {
      const id = parsedWeakMap.get(newEl);
      if (id) liveWeakMap.set(oldEl, id);
    };
    // A peer may neither write these onto our root nor, by not carrying them,
    // take ours away. Returning false is hyper-morph's veto for both directions
    // (it calls this for updateType 'update' and 'remove' alike).
    const beforeAttributeUpdated = (name, element) =>
      isTabLocalRootAttr(name, element) ? false : undefined;

    let retainedRoots = 0;
    try {
      // Scoped sync: when this tab might hold unsaved edits, splice them into
      // the incoming document BEFORE the morph so it cannot clobber them.
      // The clean path skips every capture and stays byte-identical to a
      // plain full morph.
      if (this.lane === 'live' && pageMaybeDirty()) {
        const protection = protectPeerDoc({
          newDoc,
          parsedWeakMap,
          baseHtml: this.lastHtml,
          baseIdentityMap: this._lastIdentityMap,
          liveWeakMap: this.liveWeakMap,
        });
        if (!protection.ok) {
          // Hold the whole frame: a dirty section couldn't be safely merged
          // (or no baseline exists yet). Nothing morphs and no baseline
          // moves; the tab keeps its local state and converges through its
          // own next save. Deliberately NO proactive save here — a hold can
          // fire on a manual-save page, which must never auto-write. The
          // retry re-queues the same frame so it still applies if the
          // blocking edit is undone; the slot-empty check and the drain's
          // staleness checks drop it once superseded.
          console.log('[LiveSync] Holding incoming update: unsaved local section cannot be safely merged', protection.held?.el || '');
          const epochAtHold = this._saveEpoch;
          const seenAtHold = this.lastSeenSeq;
          clearTimeout(this._holdRetryPeer);
          this._holdRetryPeer = setTimeout(() => {
            this._holdRetryPeer = null;
            if (this.isDestroyed || this._pendingHtml != null) return;
            // Only while the world hasn't moved: an own save or any newer
            // frame since the hold makes this payload stale.
            if (this._saveEpoch !== epochAtHold) return;
            if (this.lastSeenSeq !== seenAtHold) return;
            this._pendingHtml = html;
            this._pendingSeq = seq;
            this._pendingIdentityMap = identityMap;
            this._scheduleNextFrame();
          }, 3000);
          return;
        }
        retainedRoots = protection.entries.length;
      }

      // Morph entire document. We MUST await — HyperMorph.morph returns a
      // Promise when `scripts: { handle: true }` needs to wait for external
      // scripts to load. If we don't await, Mutation.resume() fires before
      // late-loading scripts execute, and any DOM mutations they trigger look
      // like user edits → the receiving tab rebroadcasts them (feedback loop).
      await HyperMorph.morph(document.documentElement, newDoc.documentElement, {
        morphStyle: 'outerHTML',
        ignoreActiveValue: true,
        head: { style: 'merge' },
        // mergeBase: mergeable script tags ([merge] + rules tags) three-way
        // merge against the last synced state instead of being clobbered by
        // the incoming save; lastHtml is exactly that base (set after every
        // own save and every applied morph). Null on the first update →
        // two-way merge, which still keeps local-only keys.
        scripts: {
          handle: true,
          matchMode: 'smart',
          mergeBase: this.lastHtml,
          mergeTags: mergeTagRecognizers
        },
        key,
        callbacks: { afterNodeMorphed, beforeAttributeUpdated }
      });

      // Restore viewport. Done after morph so layout has settled.
      window.scrollTo(scrollX, scrollY);

      // Fill in any IDs the matcher's afterNodeMorphed missed. Brand-new
      // elements come in via hyper-morph's importNode optimization, which
      // skips morphNode and thus afterNodeMorphed; their parsedWeakMap IDs
      // never make it onto liveWeakMap. Without this pass, the receiver
      // would mint fresh IDs on its next save for those elements,
      // breaking convergence exactly for newly-added ambiguous siblings.
      if (identityMap && typeof identityMap === 'object' && !Array.isArray(identityMap)) {
        this._fillInIdsAfterMorph(document.documentElement, newDoc.documentElement, parsedWeakMap);
      }

      // Only mark lastHtml after a successful morph so that a failed apply
      // doesn't desync our state and cause the next outbound save to be
      // mistakenly skipped as "unchanged". Note: lastSeenSeq is advanced at
      // receive time (in onmessage) so the staleness check covers own-save
      // echoes even when they don't reach this point.
      //
      // lastHtml is the RAW incoming frame even after a protected apply. A
      // patched serialization would poison the next frame's diff base (frame
      // two of a burst would read the protected section as clean and clobber
      // it) and could dedupe away the convergence send. Convergence is driven
      // by the explicit save below instead.
      this.lastHtml = html;
      this._lastIdentityMap =
        identityMap && typeof identityMap === 'object' && !Array.isArray(identityMap)
          ? identityMap
          : null;
      this._applyGen++;

      // Cross-lane baseline: the DOM now holds this frame's content, but the
      // DISK baseline (lastSavedContents) still describes pre-frame state. A
      // later dirty disk apply diffing against that stale baseline would
      // classify everything this frame brought as unsaved local edits and
      // splice it over newer disk bytes. A verified-clean apply is the one
      // moment the DOM is truthfully "as if saved", so the comparison
      // baseline advances here too. Skipped whenever the gate reports dirty
      // (including typing that arrived during the morph's async wait, which
      // must never be recorded as saved).
      if (this.lane === 'live' && retainedRoots === 0 && !pageMaybeDirty()) {
        setLastSavedContents(captureForComparison({ flushUndo: false }));
      }

      // Announce that a remote morph just landed, so document-level listeners
      // that are deaf to Mutation.pause (e.g. the hypercms form panel) can
      // re-sync. Fires only on a successful apply, and only for genuine remote
      // morphs — own-sender and stale-seq echoes are filtered upstream in
      // onmessage before applyUpdate is ever called. Covers every SSE morph
      // source (peer edit, version restore, body-swap) since they all funnel
      // through this single choke point.
      //
      // `source` is what lets a listener tell the two apply paths apart. clay.wire
      // waits for a DISK frame to call an agent's write landed, and another tab's
      // edit arriving first would otherwise report the wrong bytes as delivered.
      document.dispatchEvent(new CustomEvent('clay:sync-applied', {
        detail: { seq, source: 'peer' }
      }));
    } finally {
      this._log('applyUpdate - morph complete, resuming mutations');
      Mutation.resume();
      resumeGate();
      // Defer past microtask boundary — MutationObserver callbacks fire before
      // this, so isPaused catches any stray snapshots from the morph itself.
      await new Promise((resolve) => setTimeout(resolve, 0));
      this.isPaused = false;
    }

    // Convergence: a protected apply produced a merged state (our sections +
    // their frame) that exists only in this DOM. Push it out explicitly — the
    // morph ran under Mutation.pause, so no autosave was triggered, and a
    // pending autosave debounce may already have fired mid-flight. Runs after
    // isPaused is lifted so the save's snapshot-ready relay reaches peers.
    if (retainedRoots > 0) {
      savePageThrottled();
    }
  }

  /**
   * Apply an external disk change to this edit-mode tab. Same shape as
   * _doApplyUpdate with three differences: the incoming document is save
   * domain, so it is edit-mode ACTIVATED before the morph (inert attribute
   * forms flipped live, as boot does on page load); dirty protection diffs
   * against the save baseline instead of lastHtml; and on a clean apply the
   * save baseline advances to a post-morph local comparison capture — true by
   * construction, where any wire-derived baseline permanently mismatches
   * (token, doctype, transform and parse divergences). A dirty apply leaves
   * both baselines alone so the convergence save below sees its own changes
   * (and, via the save pipeline, refreshes both). A clean apply also rebuilds
   * lastHtml, because the peer lane's diff base must track what the DOM now
   * holds or a later dirty peer apply misclassifies this frame's content as
   * local edits.
   */
  async _doApplyExternal(html, seq) {
    this._log(`applyExternal - external disk change (seq=${seq})`);
    this.isPaused = true;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    Mutation.pause();
    pauseGate();

    let retainedRoots = 0;
    try {
      const parser = new DOMParser();
      const newDoc = parser.parseFromString(html, 'text/html');

      // Lane-guarded exactly like the peer path. A view-mode tab has no save
      // baseline — every writer of lastSavedContents is edit-gated — so
      // protectDiskDoc can only ever refuse, and the frame would hold, retry
      // every 3s, and hold again forever. The gate still reads dirty there,
      // because persistProbeDirty inspects the live DOM and a visitor can type
      // into a [persist] field. Before the resync repair this path was
      // unreachable outside the live lane; now it is the repair's own route.
      if (this.lane === 'live' && pageMaybeDirty()) {
        const protection = protectDiskDoc({ newDoc });
        if (!protection.ok) {
          // Hold: nothing morphs, no baseline moves, and deliberately NO
          // proactive save (a hold can fire on a manual-save page, which
          // must never auto-write). The frame's seq watermark has already
          // advanced, so nothing redelivers it on its own; the retry
          // re-queues it with the epoch captured NOW, so the drain's epoch
          // check turns an intervening own save into a refetch of current
          // disk instead of a stale re-apply, and the seq check drops it
          // once a newer external change supersedes it.
          console.log('[LiveSync] Holding external change: unsaved local section cannot be safely merged', protection.held?.el || '');
          const epochAtHold = this._saveEpoch;
          clearTimeout(this._holdRetryExt);
          this._holdRetryExt = setTimeout(() => {
            this._holdRetryExt = null;
            if (this.isDestroyed || this._pendingExternal != null) return;
            this._pendingExternal = { html, seq, saveEpoch: epochAtHold };
            this._scheduleNextFrame();
          }, 3000);
          return;
        }
        retainedRoots = protection.entries.length;
      }

      activateIncomingDoc(newDoc.documentElement);

      const liveWeakMap = this.liveWeakMap;
      const key = (el) =>
        liveWeakMap.get(el) ||
        (el.getAttribute && el.getAttribute('data-id')) ||
        (el.getAttribute && el.getAttribute('id')) ||
        null;
      const beforeAttributeUpdated = (name, element) =>
        isTabLocalRootAttr(name, element) ? false : undefined;

      await HyperMorph.morph(document.documentElement, newDoc.documentElement, {
        morphStyle: 'outerHTML',
        ignoreActiveValue: true,
        head: { style: 'merge' },
        scripts: {
          handle: true,
          matchMode: 'smart',
          mergeBase: this.lastHtml,
          mergeTags: mergeTagRecognizers
        },
        key,
        callbacks: { beforeAttributeUpdated }
      });

      window.scrollTo(scrollX, scrollY);

      if (this.lane === 'live' && retainedRoots === 0 && !pageMaybeDirty()) {
        // Clean apply: the DOM now IS the disk state, so a local comparison
        // capture of it is the truthful baseline. The next no-op save skips,
        // beforeunload stays quiet. The dirty re-check matters: typing that
        // arrived during the morph's async wait would otherwise be captured
        // into the baseline and recorded as saved without reaching disk.
        setLastSavedContents(captureForComparison({ flushUndo: false }));
        setUnsavedChanges(false);

        // Cross-lane baseline: the PEER diff base (lastHtml) would otherwise
        // still describe pre-frame state, and a later dirty peer apply would
        // classify this frame's content as local edits and splice it over a
        // newer peer frame. Rebuild it exactly the way the send pipeline
        // does, so it stays in the snapshot domain.
        const clone = captureSnapshot({ flushUndo: false });
        this.lastHtml = serializeForSync(clone);
        this._lastIdentityMap = this._buildIdentityMap(document.documentElement, clone);
        this._applyGen++;
      }

      document.dispatchEvent(new CustomEvent('clay:sync-applied', {
        detail: { seq, source: 'disk' }
      }));
    } finally {
      this._log('applyExternal - morph complete, resuming mutations');
      Mutation.resume();
      resumeGate();
      await new Promise((resolve) => setTimeout(resolve, 0));
      this.isPaused = false;
    }

    // Convergence: disk holds the writer's version, this DOM holds the merge.
    // The baseline was left pre-external, so the save sees both our retained
    // sections and the external content as changes and writes the merge back.
    if (retainedRoots > 0) {
      savePageThrottled();
    }
  }

  /**
   * Handle a notification message from the server
   * Shows a toast and emits an event for custom handling
   * @param {Object} data - { msgType, msg, action?, persistent? }
   */
  handleNotification({ msgType, msg, action, persistent, data }) {
    this._log(`Notification received: ${msgType} - ${msg}`);

    // The data-loss guard rides this channel but is NOT a toast — the panel
    // module handles it via the clay:notification event below.
    const isDataLoss = msgType === 'data-loss';

    // Show toast if available
    if (!isDataLoss) {
      if (persistent && window.toastPersistent) {
        window.toastPersistent(msg, msgType);
      } else if (window.toast) {
        window.toast(msg, msgType);
      } else {
        console.log(`[LiveSync] Notification: ${msg}`);
      }
    }

    // Emit event for custom handling (e.g., reload button, data-loss chip)
    document.dispatchEvent(new CustomEvent('clay:notification', {
      detail: { msgType, msg, action, persistent, data }
    }));

    // Call notification callback if set
    if (this.onNotification) {
      this.onNotification({ msgType, msg, action, persistent, data });
    }
  }

  /**
   * Stop LiveSync and clean up resources
   * Can call start() again to restart
   */
  stop() {
    this.cleanup();
    this.isDestroyed = true;
    console.log('[LiveSync] Stopped');
  }
}

// Singleton instance
const liveSync = new LiveSync();

// Auto-initialize when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => liveSync.start());
  } else {
    liveSync.start();
  }
}

// Export for the clayjs module system. The class itself is exported so
// tests can create fresh instances without driving the singleton's
// EventSource/snapshot wiring.
export { liveSync, LiveSync, morph };
export default liveSync;
