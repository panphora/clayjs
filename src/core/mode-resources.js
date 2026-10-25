// Which requested edit module and which authored resource a live switch can start and
// take back, decided before preparation rather than discovered halfway through it. This
// module is a dynamic target: a reader never fetches it.
//
// A style or a stylesheet link is one attribute, and the existing type flip restores it.
// A script that has run cannot be un-run, so a document whose served bytes carry an
// `editmode:resource` script has no reversible entry: its script would have to execute
// again, and re-executing it on every entry is exactly what the reload path exists to
// avoid. Such a document keeps the guarded reload.
import { enableAdminResources, disableAdminResources } from "./admin-resources.js";

// The modules this release can activate, quiesce and dispose without a reload, keyed by
// the path the loader resolves. A path that is not listed is unsupported, never assumed
// supported: the caller takes the reload path before anything is prepared.
export const ADAPTERS = new Set([
  "core/admin-attrs.js",
  "core/persist.js",
  "attrs/add-from.js",
]);

export const RESOURCE_SELECTOR = '[editmode\\:resource]:is(style, link, script)';
export const SCRIPT_SELECTOR = 'script[editmode\\:resource]';

export const supports = (path) => ADAPTERS.has(path);

// A resolved plan is only supported when every module it asked for has an adapter. The
// caller passes the whole inventory it resolved, not just the declarations it thinks it
// needs, so an omitted plugin cannot arrive through an implied one.
export function unsupported(paths) {
  return [...paths].filter((path) => !supports(path));
}

export function resourceSupport(root = document) {
  const scripts = [...root.querySelectorAll(SCRIPT_SELECTOR)];
  return { reversible: scripts.length === 0, scripts };
}

export function requiresReload(paths, root = document) {
  return unsupported(paths).length > 0 || !resourceSupport(root).reversible;
}

// The adapter's lease over the authored resources: a reversible flip for the styles and
// stylesheets, and a refusal for anything the caller had to put in `requiresReload`.
export function resourcesLease(root = document) {
  return {
    enable() {
      enableAdminResources(root);
    },
    quiesce() {},
    resume() {},
    dispose() {
      disableAdminResources();
    },
  };
}

export function resourcesParticipant(root = document) {
  return {
    id: "clay:resources",
    order: 100,
    prepare() {
      const { reversible } = resourceSupport(root);
      if (!reversible) {
        throw Object.assign(
          new Error("clay.modeLifecycle: an editmode:resource script cannot be re-run"),
          { code: "unsupported-plugin" }
        );
      }
      return resourcesLease(root);
    },
  };
}
