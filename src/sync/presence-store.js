/**
 * presence-store.js — `clay.presence`: the roster and this tab's target.
 *
 * One store serves a Document's page targets and Kanban's record targets. It holds
 * what the host said, publishes an immutable snapshot, and turns `setTarget` calls
 * into the bounded requests the host accepts. The chrome that draws the roster
 * subscribes here rather than owning the state, so a reader that draws nothing and
 * an editor that draws carets agree about who is present.
 *
 * Everything here is synchronous except the transport's own promise. Detaching a
 * lease that a newer lease replaced cannot clear the newer owner's roster, and a
 * snapshot never contains the private session token, connection ids or socket data.
 */

import {
  COALESCE_MS,
  RENEW_MS,
  PRESENCE_VERSION,
  normalizeEditing,
  normalizeSelfSession,
  normalizeSessions,
  requestBody,
  targetKey,
  validateTarget,
} from './presence-target.js';

const emptySnapshot = () => Object.freeze({
  supported: false,
  recordAwareness: false,
  pageAwareness: false,
  people: Object.freeze([]),
  anonymous: 0,
});

export class PresenceStore {
  constructor() {
    this.supported = false;
    this.recordAwareness = false;
    this.pageAwareness = false;
    this.people = [];
    this.anonymous = 0;
    this.snapshot = emptySnapshot();
    this.listeners = new Set();
    // The `n` each public session last reported, so a frame that overtook a newer
    // one for the same session cannot move a caret back.
    this.sessions = new Map();
    // The private connection session: {id, token}. Consumed by the sender, never
    // published.
    this.session = null;
    this.target = null;
    this.heldKey = '';
    this.owner = null;
    this.n = 0;
    this.sentKey = null;
    this.timer = null;
    this.timerKind = null;
    this.inflight = false;
  }

  /**
   * The current immutable snapshot. The same object until something changes, so a
   * subscriber can compare by identity.
   */
  getSnapshot() {
    return this.snapshot;
  }

  /**
   * Emits the current snapshot immediately, then every change. Includes the
   * unsupported state, so a consumer never has to wait for a frame to ask.
   *
   * @param {(snapshot: Object) => void} listener
   * @returns {() => void}
   */
  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('clay.presence.subscribe needs a listener function');
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** What the host advertised, asked of it once by the chrome. */
  setCapabilities({ supported = false, recordAwareness = false, pageAwareness = false } = {}) {
    const nextSupported = supported === true;
    const nextRecord = recordAwareness === true;
    const nextPage = pageAwareness === true;
    if (nextSupported === this.supported && nextRecord === this.recordAwareness && nextPage === this.pageAwareness) return this.snapshot;
    this.supported = nextSupported;
    this.recordAwareness = nextRecord;
    this.pageAwareness = nextPage;
    return this.emit();
  }

  /**
   * Take one roster frame. Held and published whether or not the host announced
   * presence: the chrome decides whether to draw, the snapshot says who is there.
   *
   * @param {Object} frame
   * @returns {Object} the snapshot this frame produced
   */
  receive(frame) {
    const data = frame && typeof frame === 'object' ? frame : {};
    const list = Array.isArray(data.people) ? data.people : [];
    const previous = this.sessions;
    const sessions = new Map();
    const people = [];

    for (const person of list) {
      if (!person || typeof person.id !== 'string' || !person.id) continue;
      const name = typeof person.name === 'string' && person.name.trim() ? person.name.trim() : 'Someone';
      const theirs = normalizeSessions(person.sessions, previous);
      for (const session of theirs) sessions.set(session.id, session);
      const entry = {
        id: person.id,
        name,
        you: person.you === true,
        editing: normalizeEditing(person.editing),
        sessions: theirs,
      };
      if (typeof person.canEdit === 'boolean') entry.canEdit = person.canEdit;
      people.push(entry);
    }

    this.people = people;
    this.sessions = sessions;
    const count = data.anonymous;
    this.anonymous = typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

    // The connection the frame came over issues this. Page coordinates cannot be
    // sent without it, so a target held while it was missing goes now.
    const self = normalizeSelfSession(data.selfSession);
    const wasSessionless = !this.session || !this.session.token;
    if (self) this.session = self;

    const snapshot = this.emit();
    // The first frame of a connection carries the token, and it upgrades whatever
    // this tab already holds: a record target sent in the single-field shape goes
    // again in the extended envelope, and a page target that had no body goes now.
    if (self && wasSessionless && this.owner && this.target !== null) {
      this.sentKey = null;
      this.flush();
    }
    return snapshot;
  }

  /** The stream went away: nobody is known to be present and the token is spent. */
  clear() {
    this.people = [];
    this.anonymous = 0;
    this.sessions = new Map();
    this.session = null;
    this.cancel();
    this.sentKey = null;
    return this.emit();
  }

  /**
   * Publish this tab's target. Advisory and synchronous: a target that is not the
   * one already held is coalesced to one request every 250 ms, and a clear bypasses
   * the wait. Returns false for a target this client will not publish.
   *
   * @param {null|string|{kind: string}} target
   * @returns {boolean}
   */
  setTarget(target) {
    const result = validateTarget(target === undefined ? null : target);
    if (!result.ok) return false;
    const key = targetKey(result.target);
    if (key === this.heldKey) {
      // The target did not move, but a stream that went away took its request with
      // it: a target sent before a reconnect is sent again.
      if (this.owner && this.sentKey !== key) this.schedule(COALESCE_MS);
      return true;
    }
    this.target = result.target;
    this.heldKey = key;
    if (result.target === null) {
      this.cancel();
      this.flush();
      return true;
    }
    this.schedule(COALESCE_MS);
    return true;
  }

  /**
   * Take ownership of the stream's targets and roster. The returned lease is how an
   * owner gives them back; a lease a newer one replaced detaches nothing.
   *
   * @param {{send: (body: Object) => any}} transport
   * @returns {{active: boolean, detach: () => void}}
   */
  attachTransport(transport) {
    if (!transport || typeof transport.send !== 'function') {
      throw new TypeError('clay.presence.attachTransport needs a transport with a send function');
    }
    const store = this;
    const lease = {
      send: transport.send,
      get active() {
        return store.owner === lease;
      },
      detach() {
        if (store.owner !== lease) return;
        store.owner = null;
        store.session = null;
        store.n = 0;
        store.sentKey = null;
        store.cancel();
        store.target = null;
        store.heldKey = '';
        store.clear();
      },
    };
    this.owner = lease;
    this.session = null;
    this.n = 0;
    this.sentKey = null;
    this.cancel();
    // A fresh connection starts from nothing, so the target this tab holds is sent
    // again rather than assumed delivered.
    if (this.target !== null) this.flush();
    return lease;
  }

  emit() {
    const people = this.people.map((person) => Object.freeze({
      ...person,
      sessions: Object.freeze(person.sessions),
    }));
    this.snapshot = Object.freeze({
      supported: this.supported,
      recordAwareness: this.recordAwareness,
      pageAwareness: this.pageAwareness,
      people: Object.freeze(people),
      anonymous: this.anonymous,
    });
    for (const listener of [...this.listeners]) listener(this.snapshot);
    return this.snapshot;
  }

  /**
   * One timer. A pending coalescing window keeps its deadline when somebody keeps
   * moving — otherwise a moving caret would never send — while a renewal or a retry
   * is exactly what a new target replaces.
   */
  schedule(wait, kind = 'coalesce') {
    if (this.timer !== null) {
      if (this.timerKind === 'coalesce') return;
      clearTimeout(this.timer);
    }
    this.timerKind = kind;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timerKind = null;
      this.flush();
    }, wait);
  }

  cancel() {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.timerKind = null;
  }

  renew() {
    if (this.timer !== null || !this.owner || this.target === null) return;
    this.schedule(RENEW_MS, 'renew');
  }

  flush() {
    if (this.inflight) return;
    const owner = this.owner;
    if (!owner) return;
    const n = this.n + 1;
    const body = requestBody({ target: this.target, session: this.session, n });
    if (!body) return;
    this.cancel();
    this.sentKey = this.heldKey;
    this.inflight = true;
    if (body.v === PRESENCE_VERSION) this.n = n;

    const settle = (ok) => {
      this.inflight = false;
      if (this.owner !== owner) return;
      if (this.heldKey !== this.sentKey) {
        // A newer target arrived while this one was in flight: the latest wins.
        this.flush();
        return;
      }
      if (ok) this.renew();
      else this.schedule(RENEW_MS, 'renew');
    };
    Promise.resolve(owner.send(body)).then((ok) => settle(Boolean(ok)), () => settle(false));
  }
}

export const presence = new PresenceStore();

export default presence;

// The facade belongs on `clay` the moment it exists. Two entries load this
// module — the roster chrome a reader gets with its first frame, and the editing
// sender an editor starts with — and both find the same store here.
if (typeof window !== 'undefined') {
  window.clay = window.clay || {};
  if (!window.clay.presence) window.clay.presence = presence;
}
