// Re-exports the vendored hyper-undo singleton and auto-starts it in edit mode
// so apps "just work". The loader wires it onto clay.undo; the vendor's own
// window auto-export is suppressed by the bootstrap's __hyperclayNoAutoExport
// flag.

import { undo } from '../vendor/hyper-undo.vendor.js'
import { isEditMode } from '../core/is-edit-mode.js'
import { isTabLocalAttr } from '../lib/root-attrs.js'

// Tab-local attributes (ephemeral state, route-active, root library state) are
// never undone. The shared mutation hub already drops them for the main
// instance; a scope made with create() runs its own observer, so it is told too.
const withTabLocal = (opts = {}) => {
  const own = opts.ignoreAttribute
  return {
    ...opts,
    ignoreAttribute: (name, target) => isTabLocalAttr(name, target) || (own ? own(name, target) : false),
  }
}

const createScope = undo.create.bind(undo)
undo.create = (opts) => createScope(withTabLocal(opts))

function init() {
  if (!isEditMode) return
  // Defer until the body exists so the default scope (document.body) is valid.
  if (typeof document === 'undefined') return
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => undo.start(withTabLocal({ bindKeys: true })))
  } else {
    undo.start(withTabLocal({ bindKeys: true }))
  }
}

init()

export { undo }
export default undo
