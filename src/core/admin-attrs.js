// Admin system - combines all admin features (edit-only).
import { init as initContenteditable, enableContentEditable, disableContentEditable, SELECTOR as CONTENTEDITABLE } from './admin-contenteditable.js';
import { init as initInputs, enableAdminInputs, disableAdminInputs, SELECTOR_DISABLED, SELECTOR_READONLY } from './admin-inputs.js';
import { init as initOnClick, enableOnClick, disableOnClick, SELECTOR as ONCLICK } from './admin-onclick.js';
import { init as initResources, enableAdminResources, disableAdminResources, SELECTOR as RESOURCES } from './admin-resources.js';
import Mutation from '../lib/mutation.js';

// Every control this family activates, in one selector: what a node added mid-session is
// matched against, and what the lease enables.
const SELECTOR = [CONTENTEDITABLE, SELECTOR_DISABLED, SELECTOR_READONLY, ONCLICK, RESOURCES].join(', ');

const ENABLE = [enableContentEditable, enableAdminInputs, enableOnClick, enableAdminResources];

let installation = null;

// Loader-managed initialization. The loader calls this after it imports the module, in
// its own wave order; the import calls it too, so a page reaches the same installation by
// either road. Calling it again is asking for the transforms the page already has, not
// for a second set: the save-time restore of each authored form is installed once, which
// is what makes a repeated entry cost nothing.
export function install() {
  if (installation) return installation;
  initContenteditable();
  initInputs();
  initOnClick();
  initResources();
  installation = { selector: SELECTOR };
  return installation;
}

install();

// One edit session over the live DOM. `enable` turns the served inert controls into
// working ones and starts watching for controls that arrive afterwards — a clone from
// add-from, a node a live frame morphed in; `quiesce` leaves them exactly as they are and
// stops admitting new ones; `resume` is the refused exit; `dispose` hands every control
// back the form the file served and removes this session's subscription, and nothing else.
export function controlsLease(root = document) {
  let admission = false;
  let stop = null;

  const activate = (node) => {
    const scope = node.parentNode || node;
    for (const enable of ENABLE) enable(scope);
  };

  return {
    enable() {
      admission = true;
      for (const enable of ENABLE) enable(root);
      stop = Mutation.onAddElement({
        selectorFilter: SELECTOR,
        require: 'observed',
        pausable: false,
        debounce: 0,
      }, (changes) => {
        if (!admission) return;
        changes.forEach(({ element }) => activate(element));
      });
    },
    quiesce() {
      admission = false;
    },
    resume() {
      admission = true;
    },
    dispose() {
      admission = false;
      if (stop) {
        stop();
        stop = null;
      }
      disableContentEditable();
      disableAdminInputs();
      disableOnClick();
      disableAdminResources();
    }
  };
}

/**
 * The controls as a mode participant.
 *
 * The installation above is page-lifetime and turns no control on: it puts the
 * save-time restore in front of each authored form, and nothing more. A session is the
 * lease below.
 *
 * `initial: true` adopts the edit this tab booted into, where the boot's own
 * `enable...OnPageLoad` helpers already turned the served controls on: it starts no
 * watcher and installs nothing, and its dispose is what hands the controls back.
 */
export function modeParticipant() {
  return {
    id: 'clay:controls',
    order: 110,
    prepare(context = {}) {
      const lease = controlsLease();
      if (context.initial !== true) return lease;
      return {
        enable() {},
        quiesce: () => lease.quiesce(),
        resume: () => lease.resume(),
        dispose: () => lease.dispose(),
      };
    },
  };
}

export { install as init };
export default install;
