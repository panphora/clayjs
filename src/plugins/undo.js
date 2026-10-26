// Re-exports the vendored hyper-undo singleton and auto-starts it in edit mode
// so apps "just work". The loader wires it onto clay.undo; the vendor's own
// window auto-export is suppressed by the bootstrap's __hyperclayNoAutoExport
// flag.

import { undo } from '../vendor/hyper-undo.vendor.js'
import { isEditMode } from '../core/is-edit-mode.js'
import { isTabLocalAttr } from '../lib/root-attrs.js'
import { isDerivedAttr } from '../lib/derived.js'
import { PERSIST } from '../lib/attr-aliases.js'
import { isRuntimeAttribute } from '../lib/undo/capture-move.js'

// Tab-local attributes (ephemeral state, route-active, root library state) are
// never undone, and neither is what a drag's vendor writes on the item it holds:
// `draggable` and `style` are the gesture's own bookkeeping, and a click that
// writes them is not an edit. The shared mutation hub already drops tab-local
// attributes for the main instance; a scope made with create() runs its own
// observer, so it is told too.
const withTabLocal = (opts = {}) => {
  const own = opts.ignoreAttribute
  return {
    ...opts,
    ignoreAttribute: (name, target) => isTabLocalAttr(name, target) || isDerivedAttr(target, name) || isRuntimeAttribute(name, target) || (own ? own(name, target) : false),
    isProtected: opts.isProtected || keepsOwnHistory,
  }
}

// Saved content that undo does not record (a richclay region, a no-undo block) has a
// history undo cannot restore, so a parent's undo or redo must not erase it. Chrome
// that is never saved (editor-ui) loses nothing and is not protected.
function keepsOwnHistory(node) {
  const policy = window.clay?.region?.resolveRegionPolicy
  if (!policy || node.nodeType !== 1) return false
  const own = policy(node)
  if (own.undoable !== false || own.persist === 'none') return false
  const parent = node.parentElement
  return !parent || policy(parent).undoable !== false
}

const createScope = undo.create.bind(undo)
undo.create = (opts) => createScope(withTabLocal(opts))

// A commit inside clay.effect drains the paused hub's records, so the effect's
// own writes reach autosave and re-trigger it. Warn once; the commit still runs.
const commit = undo.commit.bind(undo)
let warnedEffectCommit = false
undo.commit = (label, fn) => {
  if (!warnedEffectCommit && window.clay?.effect?.running) {
    warnedEffectCommit = true
    console.warn(`clay.effect: undo.commit("${label}") was called inside an effect. Run commands from event handlers, not from an effect.`)
  }
  return commit(label, fn)
}

// Undo and redo restore attributes. A control the user has touched shows its
// live property instead (the WHATWG dirty flag), so copy the attributes back, as
// a sync merge does. Undo is the user's own request, so the focused field is
// restored too, with its selection clamped to the new length. Controls persist
// never writes (password, hidden, file) and regions undo does not record are
// left alone.
const CONTROLS = `input${PERSIST}:not([type="password"]):not([type="hidden"]):not([type="file"]), textarea${PERSIST}, select${PERSIST}`

function restoreControls() {
  const undoable = (el) => window.clay?.region?.resolveRegionPolicy?.(el)?.undoable !== false
  document.querySelectorAll(CONTROLS).forEach((el) => {
    if (!undoable(el)) return
    if (el.tagName === 'SELECT') {
      for (const opt of el.options) {
        const want = opt.hasAttribute('selected')
        if (opt.selected !== want) opt.selected = want
      }
      return
    }
    const type = (el.getAttribute('type') || 'text').toLowerCase()
    if (el.tagName === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
      const want = el.hasAttribute('checked')
      if (el.checked !== want) el.checked = want
      return
    }
    const want = el.tagName === 'TEXTAREA'
      ? (el.getAttribute('data-value') ?? el.textContent)
      : (el.getAttribute('value') ?? '')
    if (el.value === want) return
    const focused = el === document.activeElement
    let start, end
    try { start = el.selectionStart; end = el.selectionEnd } catch {}
    el.value = want
    if (focused && start != null) {
      try { el.setSelectionRange(Math.min(start, want.length), Math.min(end, want.length)) } catch {}
    }
  })
}

// The engine emits its receipt only after a whole replay applied, so a refused
// undo or redo never reaches the control restore.
const afterReplay = (receipt) => {
  if (receipt?.ok) restoreControls()
}

// A refusal is announced for whoever presents it: the engine's receipt, once.
const refuse = ({ entryId, label, direction, code }) => {
  document.dispatchEvent(new CustomEvent('clay:undo-refused', {
    detail: { ok: false, code, entryId, label, direction },
  }))
}

// One edit session owns the page's DOM history. A session starts its own over the page as
// it stands, so nothing an earlier session recorded, and nothing a reader painted while the
// page was in view, is this session's to undo. The durable recovery records belong to the
// recovery service and outlive every session; nothing here reads, clears or rewrites them.
let session = null

function ownership() {
  return { started: false, admitted: false, subscriptions: [] }
}

const isStale = (context) => {
  if (!context) return false
  if (context.signal?.aborted) return true
  return typeof context.isCurrent === 'function' && !context.isCurrent()
}

// The default scope is document.body, so a boot that is still parsing waits for the body
// to exist before the session starts.
function bodyReady() {
  if (typeof document === 'undefined') return Promise.resolve()
  if (document.readyState !== 'loading') return Promise.resolve()
  return new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
}

// One edit session over the live page. `enable` starts a fresh history and the control
// restore that follows it; `quiesce` closes recording so the exit barrier's writes are not
// entries, keeping the history itself; `resume` is the refused exit; `dispose` detaches
// exactly the subscriptions this session added and takes the history and its keydown
// binding back, so a later entry starts from nothing.
function undoLease(record) {
  return {
    enable() {
      if (record.started) return
      record.started = true
      record.admitted = true
      undo.start(withTabLocal({ bindKeys: true }))
      for (const type of ['undo', 'redo']) {
        undo.on(type, afterReplay)
        record.subscriptions.push({ type, handler: afterReplay })
      }
      undo.on('refused', refuse)
      record.subscriptions.push({ type: 'refused', handler: refuse })
    },
    quiesce() {
      if (!record.admitted) return
      record.admitted = false
      undo.pause()
    },
    resume() {
      if (record.admitted) return
      record.admitted = true
      undo.resume()
    },
    dispose() {
      record.admitted = false
      if (session === record) session = null
      if (!record.started) return
      record.started = false
      for (const { type, handler } of record.subscriptions.splice(0)) undo.off(type, handler)
      undo.stop()
    },
  }
}

/**
 * Undo as a mode participant: the history the commit that enters edit starts, and the one
 * the exit takes back.
 *
 * `prepare` waits for the body the default scope needs, and answers with the session's
 * lease; that wait can outlive the session that asked for it, so the generation is asked
 * again once the body exists. `enable` starts the history. `quiesce` stops recording
 * without losing what the session already holds. `dispose` hands back the subscriptions,
 * the history and the keydown binding.
 */
export function undoParticipant() {
  return {
    id: 'clay:undo',
    order: 350,
    async prepare(context) {
      await bodyReady()
      if (isStale(context)) {
        throw Object.assign(new Error('clay:undo prepared for a stale generation'), { code: 'stale-document' })
      }
      return undoLease(session || (session = ownership()))
    },
  }
}

// Auto-init when the module is imported; the loader awaits `ready` before resolving clay.ready
async function init() {
  if (!isEditMode) return null
  if (typeof document === 'undefined') return null
  const lease = await undoParticipant().prepare()
  lease.enable()
  return lease
}

const ready = init()

export { undo, restoreControls, init, ready }
export default undo
