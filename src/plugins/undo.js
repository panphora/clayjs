// Re-exports the vendored hyper-undo singleton and auto-starts it in edit mode
// so apps "just work". The loader wires it onto clay.undo (and mirrors it onto
// the vendor-compat shim); the vendor's own window auto-export is suppressed by
// the bootstrap's __hyperclayNoAutoExport flag.

import { undo } from '../vendor/hyper-undo.vendor.js'
import { isEditMode } from '../core/is-edit-mode.js'

function init() {
  if (!isEditMode) return
  // Defer until the body exists so the default scope (document.body) is valid.
  if (typeof document === 'undefined') return
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => undo.start({ bindKeys: true }))
  } else {
    undo.start({ bindKeys: true })
  }
}

init()

export { undo }
export default undo
