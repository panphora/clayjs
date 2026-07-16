/**
 *
 *  Lightweight wrapper around MutationObserver that provides methods to watch DOM changes.
 *  Uses a single observer instance internally to improve performance.
 *
 *  // Watch for any DOM changes (additions, removals, attribute changes)
 *  Mutation.onAnyChange({ debounce: 200 }, changes => {
 *    changes.forEach(change => {
 *      if (change.type === 'add') {
 *        console.log('Added:', change.element);
 *        console.log('To parent:', change.parent);
 *        console.log('Between:', change.previousSibling, change.nextSibling);
 *      }
 *      if (change.type === 'remove') {
 *        console.log('Removed:', change.element);
 *        console.log('From parent:', change.parent);
 *      }
 *      if (change.type === 'attribute') {
 *        console.log('Changed:', change.attribute);
 *        console.log('From:', change.oldValue, 'to:', change.newValue);
 *      }
 *    });
 *  });
 *
 *  // Watch for element additions or removals
 *  Mutation.onAddOrRemove({ debounce: 200 }, changes => {
 *    changes.forEach(change => {
 *      const action = change.type === 'add' ? 'added to' : 'removed from';
 *      console.log(`${change.element.tagName} ${action} ${change.parent.tagName}`);
 *    });
 *  });
 *
 *  // Watch for element additions
 *  Mutation.onAddElement({ debounce: 200 }, changes => {
 *    changes.forEach(({ element, parent }) => {
 *      console.log(`${element.tagName} added to ${parent.tagName}`);
 *    });
 *  });
 *
 *  // Watch for element removals with location info
 *  Mutation.onRemoveElement({ debounce: 200 }, changes => {
 *    changes.forEach(({ element, parent, previousSibling, nextSibling }) => {
 *      console.log(`${element.tagName} removed from ${parent.tagName}`);
 *      console.log('Was between:', previousSibling?.tagName, nextSibling?.tagName);
 *    });
 *  });
 *
 *  // Watch for attribute changes
 *  Mutation.onAttribute({ debounce: 200 }, changes => {
 *    // Debounce collects multiple changes into an array
 *    changes.forEach(({ element, attribute, oldValue, newValue: newValue }) => {
 *      console.log(`${element.tagName} ${attribute} changed from ${oldValue} to ${newValue}`);
 *    });
 *  });
 *
 *  // External reactive consumers (e.g. sapjs, which re-derives state on ANY DOM change)
 *  // subscribe through the region-aware, pause-gated lane:
 *  //
 *  //   Mutation.onAnyChange({ require: 'observed' }, changes => { ... })
 *  //
 *  // Leaving `pausable` at its default (true) is load-bearing: by wrapping its own write
 *  // phase in Mutation.pause()/resume(), such a consumer's derived writes are vacuumed on
 *  // resume and routed only to non-pausable consumers, so they never loop back to it.
 *  // The raw lane (subscribeRaw/createObserver) is internal — reserved for undo/region
 *  // plumbing — and is NOT part of the public contract for external consumers.
 *
 */

import { EXTENSION_ATTR_PATTERN } from './extension-noise.js';
import { resolveRegionPolicy, isInert, strictestPolicy, skipForPolicy } from './region-policy.js';
import { isUserDrivenNow, markUserDriven } from './user-gesture.js';

const dummyElem = document.createElement("div");

const Mutation = {
  _callbacks: {
    anyChange: [],
    addOrRemove: [],
    addElement: [],
    removeElement: [],
    attribute: []
  },

  _observing: false,
  _pauseDepth: 0,
  _hasNonPausable: false,
  debug: false,

  // Raw lane: subscribers that need the untransformed MutationRecords (the undo
  // recorder). Each gets a private buffer so a global takeRecords() drain by one
  // subscriber can't steal records owed to another. See _drainBrowserQueue.
  _rawSubscribers: [],
  // Change-lane records pulled by a raw subscriber's drain, deferred to a
  // microtask so a debounce:0 mutating subscriber (autosize) never fires
  // synchronously inside undo's commit boundary.
  _deferredChangeRecords: null,
  _deferredChangeScheduled: false,

  /**
   * Pause mutation observation.
   * Use this when making programmatic DOM changes that shouldn't trigger callbacks.
   * Always pair with resume() in a try/finally block.
   */
  pause() {
    // Reference-counted so nested pauses (e.g. a programmatic pause wrapping a
    // live-sync morph that also pauses) only resume on the outermost release.
    this._pauseDepth++;
    // Bridge: pause undo recorder too. Live-sync calls Mutation.pause()
    // before morphing remote HTML in, and we want those mutations excluded
    // from the local undo stack as well. undo.pause() is itself reference-counted.
    if (typeof window !== 'undefined' && window.hyperclay && window.hyperclay.undo && window.hyperclay.undo.pause) {
      window.hyperclay.undo.pause();
    }
    this._log('Paused', this._pauseDepth);
  },

  /**
   * Resume mutation observation after a pause.
   */
  resume() {
    if (this._pauseDepth === 0) return;  // underflow guard
    this._pauseDepth--;
    // Drain pending mutation records only on the outermost release — observer
    // stays connected during pause, so morph mutations are recorded and would
    // fire async once the depth returns to zero. Route through the one drain
    // funnel: non-pausable callbacks (pure enhancers like sortable /
    // optionVisibility) get that boundary batch, and raw subscribers (undo) get
    // it into their buffer so the morph-boundary records aren't lost (then
    // undo.resume()'s own drain-discard excludes the morph, matching today).
    if (this._pauseDepth === 0 && this._observer) {
      this._drainBrowserQueue(this);
    }
    if (typeof window !== 'undefined' && window.hyperclay && window.hyperclay.undo && window.hyperclay.undo.resume) {
      window.hyperclay.undo.resume();
    }
    this._log('Resumed', this._pauseDepth);
  },

  _log(message, data = null, type = 'log') {
    if (!this.debug) return;

    const timestamp = new Date().toISOString();
    const prefix = `[Mutation ${timestamp}]`;

    if (data) {
      console[type](prefix, message, data);
    } else {
      console[type](prefix, message);
    }
  },

  _notify(type, changes, onlyNonPausable = false) {
    this._log(`Notifying ${this._callbacks[type].length} callbacks of type "${type}"`, { changes });

    for (const callback of this._callbacks[type]) {
      // While paused, only non-pausable callbacks (pure enhancers) run.
      if (onlyNonPausable && callback.pausable !== false) continue;

      const { fn, debounce = 0, selectorFilter, omitChangeDetails, require, skip } = callback;

      // Per-consumer region policy: drop changes whose region this consumer
      // doesn't participate in (no-save / no-trigger-autosave / no-undo / freeze
      // and their legacy equivalents), resolved against the callback's `require`.
      let filteredChanges = changes.filter(
        change => !skipForPolicy(this._policyForChange(change), require, skip)
      );
      if (!filteredChanges.length) {
        this._log('No changes passed the region policy, skipping callback');
        continue;
      }

      // Apply filtering if there's a selector filter
      if (selectorFilter) {
        this._log('Applying selector filter', { selectorFilter });
        filteredChanges = filteredChanges.filter(change => {
          if (typeof selectorFilter === 'string') {
            const matches = change.element.matches?.(selectorFilter) || false;
            this._log(`Selector "${selectorFilter}" match:`, { element: change.element, matches });
            return matches;
          }
          if (typeof selectorFilter === 'function') {
            const matches = selectorFilter(change.element);
            this._log('Custom filter match:', { element: change.element, matches });
            return matches;
          }
          return false;
        });
        this._log('Changes after filtering:', { filteredChanges });
      }

      // Skip if nothing remains after filtering
      if (!filteredChanges.length) {
        this._log('No changes passed the filter, skipping callback');
        continue;
      }

      // Handle debouncing and callback execution
      if (debounce === 0) {
        // No debounce, execute immediately
        try {
          if (omitChangeDetails) {
            fn();
          } else {
            fn(filteredChanges);
          }
        } catch (e) {
          this._log('Error in callback execution:', e, 'error');
          console.error('Error in Mutation callback:', e);
        }
      } else {
        // Clear any existing timeout
        if (callback.timeout) {
          clearTimeout(callback.timeout);
          callback.timeout = null;
        }

        if (omitChangeDetails) {
          // For omitChangeDetails, just reset the timer
          callback.timeout = setTimeout(() => {
            callback.timeout = null;
            try {
              this._log('Executing debounced callback (no details)');
              fn();
            } catch (e) {
              this._log('Error in callback execution:', e, 'error');
              console.error('Error in Mutation callback:', e);
            }
          }, debounce);
        } else {
          // For callbacks with change details, accumulate changes
          if (!callback.pendingChanges) {
            callback.pendingChanges = [];
          }
          callback.pendingChanges.push(...filteredChanges);

          // Reset the timer
          callback.timeout = setTimeout(() => {
            const changes = callback.pendingChanges;
            callback.pendingChanges = null; // Reset to null, not empty array
            callback.timeout = null; // Clear the timeout reference
            try {
              this._log('Executing debounced callback with changes:', { changes });
              if (changes && changes.length > 0) {
                fn(changes);
              }
            } catch (e) {
              this._log('Error in callback execution:', e, 'error');
              console.error('Error in Mutation callback:', e);
            }
          }, debounce);
        }
      }
    }
  },

  // Resolve a change's region policy once per batch (memoized on the change).
  // Removed/detached elements carry their region markers on the still-attached
  // parent (the region they were removed FROM), so merge it in for those.
  _policyForChange(change) {
    if (change.__policy) return change.__policy;
    const el = change.element;
    let policy = resolveRegionPolicy(el);
    if (change.parent && el && el.isConnected === false) {
      policy = strictestPolicy(policy, resolveRegionPolicy(change.parent));
    }
    change.__policy = policy;
    return policy;
  },

  // The real MutationObserver's callback target. Two lanes, in this order:
  //   1. raw fan-out FIRST, unconditionally (even while paused / on the fast
  //      path) so the raw lane's push timing matches a real MutationObserver and
  //      undo's own paused-drop keeps working.
  //   2. the change lane (pause-gated, as before).
  _onRecords(records) {
    this._fanOutRaw(records);
    this._handleMutations(records);
  },

  // Push the untransformed records to every raw subscriber's callback. No
  // filtering and no pause gating: raw means raw (undo runs its own filter and
  // its own pause). Captured BEFORE the change lane's isInert / extension-attr
  // intake drops, which the raw subscriber must not inherit.
  _fanOutRaw(records) {
    if (!this._rawSubscribers.length || !records.length) return;
    for (const sub of this._rawSubscribers) {
      try {
        sub.cb(records);
      } catch (e) {
        this._log('Error in raw subscriber callback:', e, 'error');
        console.error('Error in Mutation raw subscriber:', e);
      }
    }
  },

  // The ONLY caller of this._observer.takeRecords(). Pulls the browser's pending
  // (undelivered) records and routes them three ways so nobody loses a record
  // the global takeRecords() just emptied:
  //   (a) every OTHER raw subscriber: into its private buffer + a microtask flush
  //   (b) the change lane: deferred to a microtask when the requester is a raw
  //       subscriber (so a debounce:0 mutating subscriber can't fire inside
  //       undo's synchronous commit); synchronous-to-non-pausables when the hub
  //       itself is the requester (the resume() boundary, matching today)
  //   (c) the requester: returns the pulled records merged with its own buffer,
  //       then clears the buffer.
  _drainBrowserQueue(requester) {
    const pulled = this._observer ? this._observer.takeRecords() : [];
    const requesterIsRaw = !!requester && this._rawSubscribers.indexOf(requester) !== -1;

    if (pulled.length) {
      // (a) records owed to other raw subscribers (the global queue is now empty
      // for them too, so hand them their copy via their buffer).
      for (const sub of this._rawSubscribers) {
        if (sub === requester) continue;
        sub.buffer.push(...pulled);
        this._scheduleBufferFlush(sub);
      }

      // (b) change lane.
      if (requesterIsRaw) {
        this._deferChangeLane(pulled);
      } else if (this._hasNonPausable) {
        this._processMutations(pulled, true);
      }
    }

    // (c) hand the requester its records (own buffer first = chronological).
    if (requesterIsRaw) {
      const own = requester.buffer;
      requester.buffer = [];
      return own.length ? own.concat(pulled) : pulled;
    }
    return pulled;
  },

  // Deliver a raw subscriber's buffered records on a microtask, reading the
  // CURRENT buffer at flush time so a synchronous drain() in between makes this
  // a no-op (the buffer is consume-and-clear; a record is delivered exactly once
  // — via flush OR via drain, never both).
  _scheduleBufferFlush(sub) {
    if (sub._flushScheduled) return;
    sub._flushScheduled = true;
    queueMicrotask(() => {
      sub._flushScheduled = false;
      if (!sub.buffer.length) return;
      const batch = sub.buffer;
      sub.buffer = [];
      try {
        sub.cb(batch);
      } catch (e) {
        this._log('Error in raw subscriber flush:', e, 'error');
        console.error('Error in Mutation raw subscriber:', e);
      }
    });
  },

  // Queue change-lane records pulled by a raw subscriber's drain for a single
  // microtask-deferred pass through _handleMutations (pause rules apply at
  // processing time, not capture time).
  _deferChangeLane(records) {
    if (!this._deferredChangeRecords) this._deferredChangeRecords = [];
    this._deferredChangeRecords.push(...records);
    if (this._deferredChangeScheduled) return;
    this._deferredChangeScheduled = true;
    queueMicrotask(() => {
      this._deferredChangeScheduled = false;
      const batch = this._deferredChangeRecords;
      this._deferredChangeRecords = null;
      if (batch && batch.length) this._handleMutations(batch);
    });
  },

  // Raw lane primitive: an explicit push+pull subscription to the untransformed
  // MutationRecords. Internal plumbing for the vendored undo recorder (so the
  // page runs ONE MutationObserver). Not public API yet.
  subscribeRaw(cb) {
    const sub = { cb, buffer: [], _flushScheduled: false };
    this._rawSubscribers.push(sub);
    // A raw subscriber may register before any change subscriber, and the hub
    // only starts observing on first subscription (the lazy-start trap), so
    // force it on or undo records nothing when it starts first.
    this._startObserving();
    return {
      drain: () => this._drainBrowserQueue(sub),
      unsubscribe: () => {
        const i = this._rawSubscribers.indexOf(sub);
        if (i !== -1) this._rawSubscribers.splice(i, 1);
      },
    };
  },

  // Thin MutationObserver-shaped adapter over subscribeRaw, so undo's scope.js
  // changes one construction line and keeps its observe/disconnect/takeRecords
  // calls. Only document.body is supported (the singleton's scope); created
  // shadow scopes keep a real MutationObserver. Options are accepted and ignored
  // — the hub already observes with options identical to undo's.
  createObserver(cb) {
    let subscription = null;
    return {
      observe: (target /*, options */) => {
        if (target !== document.body) {
          throw new Error('Mutation.createObserver only supports observing document.body');
        }
        this._startObserving();
        if (!subscription) subscription = this.subscribeRaw(cb);
      },
      disconnect: () => {
        if (subscription) { subscription.unsubscribe(); subscription = null; }
      },
      takeRecords: () => (subscription ? subscription.drain() : []),
    };
  },

  _handleMutations(mutations) {
    if (this._pauseDepth > 0) {
      // While paused (e.g. during a live-sync morph), only non-pausable
      // callbacks should run. With none registered, take the fast path.
      if (!this._hasNonPausable) {
        this._log(`Skipping ${mutations.length} mutations (paused)`);
        return;
      }
      this._processMutations(mutations, true);
      return;
    }
    this._processMutations(mutations, false);
  },

  _processMutations(mutations, onlyNonPausable = false) {
    const changes = [];
    const changesByType = {
      add: [],
      remove: [],
      attribute: [],
      characterData: []
    };

    for (const mutation of mutations) {
      // Intake drop: a no-watch / mutations-ignore subtree (or extension noise)
      // is invisible to every consumer, so skip it without walking. All other
      // region attributes are resolved per-consumer in _notify.
      if (isInert(mutation.target)) {
        continue;
      }

      // Ignore extension marker attributes (e.g. password-manager field tags) stamped onto real elements.
      if (mutation.type === 'attributes' && mutation.attributeName &&
          EXTENSION_ATTR_PATTERN.test(mutation.attributeName.toLowerCase())) {
        continue;
      }

      if (mutation.type === 'characterData') {
          this._log('Processing characterData mutation', {
            element: mutation.target.parentElement,
            oldValue: mutation.oldValue,
            newValue: mutation.target.textContent
          });

          const change = {
            type: 'characterData',
            element: mutation.target.parentElement ?? dummyElem, // hacky, but ensures we always pass an element in the callback
            oldValue: mutation.oldValue,
            newValue: mutation.target.textContent
          };
          changes.push(change);
          changesByType.characterData.push(change);
      }

      if (mutation.type === 'childList') {
        this._log('Processing childList mutation', {
          addedNodes: mutation.addedNodes,
          removedNodes: mutation.removedNodes
        });

        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && !isInert(node)) {
            const addedNodes = [node, ...node.querySelectorAll('*')];
            this._log(`Processing ${addedNodes.length} added nodes`, { addedNodes });

            for (const element of addedNodes) {
              const change = {
                type: 'add',
                element,
                parent: mutation.target,
                previousSibling: mutation.previousSibling,
                nextSibling: mutation.nextSibling
              };
              changes.push(change);
              changesByType.add.push(change);
            }
          }
        }

        for (const node of mutation.removedNodes) {
          if (node.nodeType === 1 && !isInert(node)) {
            const removedNodes = [node, ...node.querySelectorAll('*')];
            this._log(`Processing ${removedNodes.length} removed nodes`, { removedNodes });

            for (const element of removedNodes) {
              const change = {
                type: 'remove',
                element,
                parent: mutation.target,
                previousSibling: mutation.previousSibling,
                nextSibling: mutation.nextSibling
              };
              changes.push(change);
              changesByType.remove.push(change);
            }
          }
        }

        // Bubble text-node child changes (e.g. `el.textContent = 'foo'`) up
        // to the parent element so onAnyChange fires. Typed callbacks
        // (addElement, removeElement) stay element-only by design.
        let hasTextNodeChanges = false;
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 3) { hasTextNodeChanges = true; break; }
        }
        if (!hasTextNodeChanges) {
          for (const node of mutation.removedNodes) {
            if (node.nodeType === 3) { hasTextNodeChanges = true; break; }
          }
        }
        if (hasTextNodeChanges && mutation.target.nodeType === 1) {
          const change = {
            type: 'characterData',
            element: mutation.target,
            oldValue: undefined,
            newValue: mutation.target.textContent
          };
          changes.push(change);
          changesByType.characterData.push(change);
        }
      }

      if (mutation.type === 'attributes') {
        this._log('Processing attribute mutation', {
          element: mutation.target,
          attribute: mutation.attributeName,
          oldValue: mutation.oldValue,
          newValue: mutation.target.getAttribute(mutation.attributeName)
        });

        const change = {
          type: 'attribute',
          element: mutation.target,
          attribute: mutation.attributeName,
          oldValue: mutation.oldValue,
          newValue: mutation.target.getAttribute(mutation.attributeName)
        };
        changes.push(change);
        changesByType.attribute.push(change);
      }
    }

    if (changes.length) {
      this._log('Processing collected changes', {
        total: changes.length,
        byType: {
          add: changesByType.add.length,
          remove: changesByType.remove.length,
          attribute: changesByType.attribute.length
        }
      });

      // Data-guard provenance: if a trusted gesture drove this turn (or one
      // happened within the recency window) and any change is autosave-relevant
      // (matches the save's region scope), mark the pending save user-driven.
      // Runs synchronously in the MO callback; skipped during paused-morph drains.
      if (!onlyNonPausable && isUserDrivenNow()) {
        for (const change of changes) {
          if (!skipForPolicy(this._policyForChange(change), 'autosave')) {
            markUserDriven();
            break;
          }
        }
      }

      this._notify('anyChange', changes, onlyNonPausable);

      const addOrRemove = [...changesByType.add, ...changesByType.remove];
      if (addOrRemove.length) {
        this._notify('addOrRemove', addOrRemove, onlyNonPausable);
      }

      if (changesByType.add.length) {
        this._notify('addElement', changesByType.add, onlyNonPausable);
      }
      if (changesByType.remove.length) {
        this._notify('removeElement', changesByType.remove, onlyNonPausable);
      }
      if (changesByType.attribute.length) {
        this._notify('attribute', changesByType.attribute, onlyNonPausable);
      }
    }
  },

  _observer: null,

  _initializeObserver() {
    if (!this._observer) {
      this._log('Initializing MutationObserver');
      this._observer = new MutationObserver(this._onRecords.bind(this));
    }
  },

  _addCallback(type, options = {}, callback) {
    this._log('Adding callback', { type, options });

    if (options.debug) {
      this.debug = true;
    }

    const cb = {
      fn: callback,
      debounce: options.debounce || 0,
      selectorFilter: options.selectorFilter,
      omitChangeDetails: options.omitChangeDetails,
      // Region policy: axis this consumer needs ('observed' | 'autosave' | 'undo')
      // or a literal attribute escape-hatch. Unset => legacy four-marker skip.
      require: options.require,
      skip: options.skip,
      // pausable:false keeps the callback firing during Mutation.pause() (pure
      // enhancers that never save/record/rebroadcast). Default true.
      pausable: options.pausable !== false,
      timeout: null,
      pendingChanges: null
    };

    this._callbacks[type].push(cb);
    this._recomputeHasNonPausable();
    this._log(`Added callback to ${type}. Total callbacks:`, {
      [type]: this._callbacks[type].length
    });

    this._startObserving();

    return () => {
      this._log('Removing callback', { type });
      const index = this._callbacks[type].indexOf(cb);
      if (index !== -1) {
        clearTimeout(cb.timeout);
        cb.pendingChanges = null;
        this._callbacks[type].splice(index, 1);
        this._recomputeHasNonPausable();
        this._log(`Removed callback from ${type}. Remaining callbacks:`, {
          [type]: this._callbacks[type].length
        });
      }
    };
  },

  _recomputeHasNonPausable() {
    this._hasNonPausable = Object.values(this._callbacks).some(
      list => list.some(cb => cb.pausable === false)
    );
  },

  _startObserving() {
    if (this._observing) {
      this._log('Already observing, skipping initialization');
      return;
    }

    this._log('Starting observation');
    this._initializeObserver();
    this._observer.observe(document.body, {
      childList: true,
      attributes: true,
      subtree: true,
      characterData: true,
      attributeOldValue: true,
      characterDataOldValue: true
    });
    this._observing = true;
    this._log('Observation started');
  },

  onAnyChange(options = {}, callback) {
    return this._addCallback('anyChange', options, callback);
  },

  onAddOrRemove(options = {}, callback) {
    return this._addCallback('addOrRemove', options, callback);
  },

  onAddElement(options = {}, callback) {
    return this._addCallback('addElement', options, callback);
  },

  onRemoveElement(options = {}, callback) {
    return this._addCallback('removeElement', options, callback);
  },

  onAttribute(options = {}, callback) {
    return this._addCallback('attribute', options, callback);
  },

  /**
   * Start the singleton observer without registering a callback. The data-clobber
   * chip (data-loss-panel) calls this so user-driven attribution runs wherever the
   * chip ships, not only when another module (e.g. option-visibility) happens to
   * subscribe. Idempotent — the _observing guard makes repeat calls a no-op.
   */
  ensureObserving() {
    this._startObserving();
  }
};

// Signal consumers (e.g. hypercms ?cms=true auto-open) that Mutation is ready,
// so they can react instead of polling. Wrapped so a dispatch failure can never
// break the install.
try {
  document.dispatchEvent(new CustomEvent('clay:mutation-ready', { detail: { Mutation } }));
  // vendor-compat: hypercms's readiness fast path listens for the legacy name
  document.dispatchEvent(new CustomEvent('hyperclay:mutation-ready', { detail: { Mutation } }));
} catch {}

export default Mutation;
