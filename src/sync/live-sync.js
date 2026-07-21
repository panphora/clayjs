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

    // Identity tracking for content-based morphing across live-sync updates.
    // Synthetic IDs (`<clientId>:<counter>`) live here only — never written to
    // the DOM, never serialized into saved HTML. The WeakMap holds them
    // against the live elements so that the next save can produce the same
    // identityMap, and afterNodeMorphed transfers IDs from incoming parsed
    // elements onto the live elements they morphed into.
    this.idCounter = this._loadIdCounter();
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
   * Generate or retrieve a tab-specific client ID
   * Uses sessionStorage (unique per tab) not localStorage (shared across tabs)
   */
  generateClientId() {
    let id = null;

    try {
      id = sessionStorage.getItem('livesync-client-id');
    } catch (e) {
      // sessionStorage might not be available
    }

    if (!id) {
      id = Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      try {
        sessionStorage.setItem('livesync-client-id', id);
      } catch (e) {
        // That's okay
      }
    }

    return id;
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
    this.lastSeenSeq = 0;
    this.resumeId = this.generateResumeId();

    console.log(`[LiveSync] Starting for: ${this.currentFile} (lane=${this.lane})`);
    this.connect();
    // View-mode tabs are receive-only: saves are edit-gated upstream, so a
    // snapshot listener would never fire — skip registering it.
    if (this.lane === 'live') {
      this.listenForSnapshots();
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

    clearTimeout(this.debounceTimer);

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
  }

  _loadIdCounter() {
    try {
      const raw = sessionStorage.getItem('livesync-id-counter');
      const n = parseInt(raw || '0', 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  _persistIdCounter() {
    try {
      sessionStorage.setItem('livesync-id-counter', String(this.idCounter));
    } catch (e) {
      // Storage full / sandboxed — fall back to in-memory only.
    }
  }

  _mintId() {
    this.idCounter++;
    this._persistIdCounter();
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
   * Walks live and parsed in lockstep using the same path scheme as
   * _buildIdentityMap. Filters [snapshot-remove] from the live side to
   * stay aligned with the sender's clone view. Aborts a subtree on
   * child-count divergence (e.g. local save-ignore additions) — those
   * elements fall through to content scoring on the next round, which
   * is the same fallback as a sender-side lockstep skip.
   *
   * @param {Element} liveRoot - post-morph live tree root
   * @param {Element} parsedRoot - parsed-tree root (still has identityMap WeakMap entries)
   * @param {Object} identityMap - path → id map from the SSE payload
   */
  _fillInIdsAfterMorph(liveRoot, parsedRoot, identityMap) {
    if (!liveRoot || !parsedRoot || !identityMap) return;
    const visit = (live, parsed, path) => {
      const id = identityMap[path];
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
        visit(liveKids[i], parsedKids[i], path === '' ? String(i) : `${path}.${i}`);
      }
    };
    visit(liveRoot, parsedRoot, '');
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
    const url = `/_/live-sync/stream?page-url=${pageUrl}&lane=${this.lane}&resume-id=${this.resumeId}`;
    this.sse = new EventSource(url);

    this.sse.onopen = () => {
      console.log('[LiveSync] Connected');
      if (this.onConnect) this.onConnect();
    };

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

      // Handle notifications (show toast, don't morph)
      if (data.type === "notification") {
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
      const html = clone.outerHTML;
      const identityMap = this._buildIdentityMap(document.documentElement, clone);
      this.sendUpdate(html, identityMap);
    };

    document.addEventListener('clay:snapshot-ready', this._snapshotHandler);
  }

  /**
   * Send full HTML to the server (debounced)
   * Only updates lastHtml after successful save
   */
  sendUpdate(html, identityMap) {
    clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      // Skip if unchanged
      if (html === this.lastHtml) {
        this._log('Skipping send - HTML unchanged');
        return;
      }

      this._log(`Sending update (HTML length: ${html.length}, lastHtml length: ${this.lastHtml?.length || 0})`);

      fetch('/_/live-sync/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Page-URL': window.location.href },
        body: JSON.stringify({
          html: html,
          sender: this.clientId,
          identityMap: identityMap
        })
      }).then(response => {
        if (response.ok) {
          this.lastHtml = html;
        } else {
          console.warn('[LiveSync] Save returned status:', response.status);
        }
      }).catch(err => {
        console.error('[LiveSync] Save failed:', err);
        if (this.onError) this.onError(err);
      });
    }, this.debounceMs);
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
   * Drain the pending slot once. Errors are caught and logged so a single
   * failed morph does not stop the queue.
   */
  async _runPending() {
    this._rafHandle = null;
    if (this.isDestroyed) return;

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

    // A newer payload may have arrived during the morph. Schedule another
    // frame to drain it. Without this, late-arriving updates would sit
    // forever until the next applyUpdate call.
    if (!this.isDestroyed && this._pendingHtml != null) {
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

    try {
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
        callbacks: { afterNodeMorphed }
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
        this._fillInIdsAfterMorph(document.documentElement, newDoc.documentElement, identityMap);
      }

      // Only mark lastHtml after a successful morph so that a failed apply
      // doesn't desync our state and cause the next outbound save to be
      // mistakenly skipped as "unchanged". Note: lastSeenSeq is advanced at
      // receive time (in onmessage) so the staleness check covers own-save
      // echoes even when they don't reach this point.
      this.lastHtml = html;

      // Announce that a remote morph just landed, so document-level listeners
      // that are deaf to Mutation.pause (e.g. the hypercms form panel) can
      // re-sync. Fires only on a successful apply, and only for genuine remote
      // morphs — own-sender and stale-seq echoes are filtered upstream in
      // onmessage before applyUpdate is ever called. Covers every SSE morph
      // source (peer edit, version restore, body-swap) since they all funnel
      // through this single choke point.
      document.dispatchEvent(new CustomEvent('clay:sync-applied', {
        detail: { seq }
      }));
      // vendor-compat: hypercms's form panel listens for the legacy name.
      document.dispatchEvent(new CustomEvent('hyperclay:livesync-applied', {
        detail: { seq }
      }));
    } finally {
      this._log('applyUpdate - morph complete, resuming mutations');
      Mutation.resume();
      // Defer past microtask boundary — MutationObserver callbacks fire before
      // this, so isPaused catches any stray snapshots from the morph itself.
      await new Promise((resolve) => setTimeout(resolve, 0));
      this.isPaused = false;
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
