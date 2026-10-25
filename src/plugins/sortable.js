/*

   Make elements drag-and-drop sortable

   How to use:
   - add `sortable` attribute to an element to make children sortable
   - e.g. <div sortable></div>
   - add `onsorting` attribute to execute code during drag
   - e.g. <ul sortable onsorting="console.log('Dragging!')"></ul>
   - add `onsorted` attribute to execute code when items are sorted
   - e.g. <ul sortable onsorted="console.log('Items reordered!')"></ul>

   This wrapper conditionally loads the full Sortable.js vendor script (~118KB)
   only when in edit mode, using dynamic import().

   The editor it wires is one mode lease (see sortableParticipant): every instance,
   subscription, listener and pending restore belongs to the session that made it, so a
   page that leaves edit takes all of it back and a later entry starts from nothing
   instead of from the previous session's leftovers.

*/
import { isEditMode } from "../core/is-edit-mode.js";
import Mutation from "../lib/mutation.js";
import { capabilitySelector } from "../lib/region-capabilities.js";
import { onSnapshot } from "../core/snapshot.js";

const EDITOR_UI_SELECTOR = capabilitySelector('history');

// Sortable marks the picked-up item and its links and images draggable="false" on press, and
// leaves style="" behind after a drag. Those attributes would be saved into the document, so a
// mere click would change the file. Record them when an item is chosen and put them back after.
const RUNTIME_ATTRS = ['draggable', 'style'];

// A press ends on one of these, wherever it lands.
const ENDS = ['pointerup', 'pointercancel', 'dragend', 'drop'];

// What a press recorded, for the snapshot hook below.
const pressed = new Set();

// The page's vendor constructor, snapshot transform, and one sortable session. All three
// outlive a session: a second entry asks for what the page already has rather than adding
// a second copy of it.
let vendor = null;
let installation = null;
let session = null;

// Every listener and timer a session starts is recorded with its target, type and options,
// so cleanup removes the exact subscription instead of hoping a bare type is enough.
function track(record, target, type, handler, options) {
  const entry = { target, type, handler, options };
  target.addEventListener(type, handler, options);
  record.listeners.push(entry);
  return entry;
}

function untrack(record, entry) {
  entry.target.removeEventListener(entry.type, entry.handler, entry.options);
  const index = record.listeners.indexOf(entry);
  if (index !== -1) record.listeners.splice(index, 1);
}

function later(record, run) {
  const id = setTimeout(() => {
    record.timers.delete(id);
    run();
  }, 0);
  record.timers.add(id);
  return id;
}

function ownership(Sortable, root) {
  return {
    Sortable,
    root,
    admitted: false,
    instances: new Set(),
    listeners: [],
    timers: new Set(),
    presses: new Set(),
    stop: null,
  };
}

// A direct makeSortable() call, outside any session, is still wired the same way; nothing
// disposes it, which is what such a call asked for.
const loose = { admitted: true, instances: new Set(), listeners: [], timers: new Set(), presses: new Set() };

function recordRuntimeAttrs(item) {
  return [item, ...item.querySelectorAll('*')]
    .filter(el => !el.closest(EDITOR_UI_SELECTOR))
    .map(el => [el, RUNTIME_ATTRS.map(name => el.getAttribute(name))]);
}

function restoreRuntimeAttrs(recorded) {
  for (const [el, values] of recorded) {
    RUNTIME_ATTRS.forEach((name, i) => {
      const before = values[i];
      const now = el.getAttribute(name);
      if (now === before) return;
      if (before === null) {
        if (name === 'style' && now) return;
        el.removeAttribute(name);
      } else {
        el.setAttribute(name, before);
      }
    });
  }
}

function makeSortable(sortableElem, Sortable, record = loose) {
  let options = {};
  const childSelector = /^(UL|OL)$/.test(sortableElem.tagName) ? 'li' : '*';
  options.draggable = `> ${childSelector}:not(${EDITOR_UI_SELECTOR})`;

  // Check if Sortable instance already exists
  if (Sortable.get(sortableElem)) return;

  const groupName = sortableElem.getAttribute('sortable');
  if (groupName) options.group = groupName;

  // Check for handles, but exclude those inside nested sortable elements
  const handles = sortableElem.querySelectorAll('[sortable-handle]');
  const nestedSortables = sortableElem.querySelectorAll('[sortable]');

  // Check if any handle is NOT inside a nested sortable
  const hasDirectHandle = Array.from(handles).some(handle => {
    return !Array.from(nestedSortables).some(nested => nested.contains(handle));
  });

  if (hasDirectHandle) {
    options.handle = '[sortable-handle]';
  }

  // Add onsorting callback if attribute exists (fires during drag)
  const onsortingCode = sortableElem.getAttribute('onsorting');
  if (onsortingCode) {
    options.onMove = function(evt) {
      if (!record.admitted) return;
      try {
        const asyncFn = new Function(`return (async function(evt) { ${onsortingCode} })`)();
        asyncFn.call(sortableElem, evt);
      } catch (error) {
        console.error('Error in onsorting execution:', error);
      }
    };
  }

  // After a drop, run any author onsorted code, then notify reactive libraries.
  const onsortedCode = sortableElem.getAttribute('onsorted');
  options.onEnd = function(evt) {
    // A session that has closed admission has already handed the page to the exit's
    // barrier. The drop it allowed is not a new edit, so nothing of it reaches an author
    // handler, a reactive engine or the file.
    if (!record.admitted) return;
    if (onsortedCode) {
      try {
        const asyncFn = new Function(`return (async function(evt) { ${onsortedCode} })`)();
        asyncFn.call(sortableElem, evt);
      } catch (error) {
        console.error('Error in onsorted execution:', error);
      }
    }
    // Announce the reorder as a real, self-documenting event carrying what moved.
    // Reactive libs (e.g. Sap) and author code key off this without us knowing
    // about them. Fires only in edit mode, since sortable only inits there.
    sortableElem.dispatchEvent(new CustomEvent('clay:sorted', {
      bubbles: true,
      detail: {
        item: evt.item,
        from: evt.from,
        to: evt.to,
        oldIndex: evt.oldIndex,
        newIndex: evt.newIndex,
      },
    }));
    // DEPRECATED: early versions dispatched a synthetic `input` here so reactive
    // libs would re-derive. It is semantically off (a container has no value) and
    // now redundant with clay:sorted and the mutation observers. Kept as a compat shim.
    sortableElem.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Record on the capture phase, before Sortable's own press handler changes anything, and
  // restore once the press ends: a plain click never fires Sortable's unchoose.
  let recorded = null;
  let ends = [];
  const restoreSoon = () => {
    const pending = recorded;
    recorded = null;
    if (pending) {
      record.presses.delete(pending);
      pressed.delete(pending);
    }
    ends.forEach(entry => untrack(record, entry));
    ends = [];
    if (pending) later(record, () => restoreRuntimeAttrs(pending));
  };
  track(record, sortableElem, 'pointerdown', (event) => {
    let item = event.target instanceof Element ? event.target : null;
    while (item && item.parentElement !== sortableElem) item = item.parentElement;
    if (!item || recorded) return;
    recorded = recordRuntimeAttrs(item);
    record.presses.add(recorded);
    pressed.add(recorded);
    ends = ENDS.map(type => track(record, document, type, restoreSoon, true));
  }, true);
  options.onUnchoose = restoreSoon;

  Sortable.create(sortableElem, options);
  record.instances.add(sortableElem);
}

// Sortable's UMD header picks its target at run time: window.Sortable when no
// module system is present (a module load, and the single-file build), a
// default export when a bundler hands it one. Cover both. A failed fetch is forgotten,
// so the next entry asks again instead of inheriting the rejection.
function loadVendor() {
  if (!vendor) {
    vendor = import('../vendor/Sortable.vendor.js').then((mod) => window.Sortable || mod.default);
    vendor.catch(() => { vendor = null; });
  }
  return vendor;
}

// A save taken mid-drag would otherwise write Sortable's classes and attributes into the
// file. Strip them from the snapshot clone only, so the live drag carries on untouched.
// Installed once, and it reads whatever the live session recorded.
function install() {
  if (installation) return installation;
  onSnapshot((root, { original }) => {
    for (const el of root.querySelectorAll("[sortable] .sortable-chosen, [sortable] .sortable-ghost, [sortable] .sortable-drag")) {
      el.classList.remove("sortable-chosen", "sortable-ghost", "sortable-drag");
      if (!el.classList.length) el.removeAttribute("class");
    }
    if (!pressed.size) return;
    const before = new Map();
    for (const recording of pressed) for (const [el, values] of recording) before.set(el, values);
    for (const el of root.querySelectorAll("[sortable] *")) {
      const values = before.get(original(el));
      if (!values) continue;
      RUNTIME_ATTRS.forEach((name, i) => {
        if (values[i] === null) el.removeAttribute(name); else el.setAttribute(name, values[i]);
      });
    }
  });
  installation = true;
  return installation;
}

// One edit session over the live DOM. `enable` creates the instances and starts watching
// for containers that arrive afterwards; `quiesce` closes admission, so a drag that ends
// after it produces no event; `resume` is the refused exit; `dispose` destroys every
// instance this session created and removes exactly the subscriptions it added.
function sortableLease(record) {
  return {
    enable() {
      if (record.admitted) return;
      record.admitted = true;
      for (const el of record.root.querySelectorAll('[sortable]')) makeSortable(el, record.Sortable, record);
      // Set up listener for dynamically added elements.
      // require:'observed' so drag works inside no-save / save-* regions (e.g. the
      // CMS panel); pausable:false so it keeps wiring during a live-sync pause.
      record.stop = Mutation.onAddElement({
        selectorFilter: "[sortable]",
        debounce: 200,
        require: 'observed',
        pausable: false
      }, (changes) => {
        if (!record.admitted) return;
        changes.forEach(({ element }) => {
          makeSortable(element, record.Sortable, record);
        });
      });
    },
    quiesce() {
      record.admitted = false;
    },
    resume() {
      record.admitted = true;
    },
    dispose() {
      record.admitted = false;
      if (record.stop) {
        record.stop();
        record.stop = null;
      }
      for (const entry of [...record.listeners]) untrack(record, entry);
      for (const id of record.timers) clearTimeout(id);
      record.timers.clear();
      for (const recording of record.presses) pressed.delete(recording);
      record.presses.clear();
      for (const el of record.instances) record.Sortable?.get?.(el)?.destroy?.();
      record.instances.clear();
      if (session === record) session = null;
    },
  };
}

const isStale = (context) => {
  if (!context) return false;
  if (context.signal?.aborted) return true;
  return typeof context.isCurrent === "function" && !context.isCurrent();
};

/**
 * Sortable as a mode participant: the drag editor the commit that enters edit starts, and
 * the one the exit takes back.
 *
 * `prepare` fetches the vendor and answers with the lease; the fetch can outlive the
 * session that asked for it, so the generation is asked again once it is here. `enable`
 * creates the instances. `quiesce` refuses a completion that arrives after it. `dispose`
 * destroys the instances and hands back every listener and timer this session started.
 */
export function sortableParticipant(root = document) {
  return {
    id: "clay:sortable",
    order: 300,
    async prepare(context) {
      const Sortable = await loadVendor();
      if (isStale(context)) {
        throw Object.assign(new Error("clay:sortable prepared for a stale generation"), { code: "stale-document" });
      }
      install();
      return sortableLease(session || (session = ownership(Sortable, root)));
    },
  };
}

// Auto-init when module is imported; the loader awaits `ready` before resolving clay.ready
async function init() {
  if (!isEditMode) return null;
  const lease = await sortableParticipant().prepare();
  lease.enable();
  return lease;
}

const ready = init();

export { init, ready, makeSortable };
export default init;
