/**
 * section-notice.js — "<name> changed this section".
 *
 * One dismissible line, shown when a live-sync frame from somebody else
 * actually changed the editable region this reader was working in.
 *
 * HOW "THIS SECTION CHANGED" IS DECIDED, AND WHY BOTH OBVIOUS READINGS ARE WRONG.
 *
 * Not "an ancestor was morphed". Every frame morphs `document.documentElement`,
 * so `body` is an ancestor of every region there is and that test reports every
 * unrelated edit anybody makes anywhere on the page.
 *
 * Not "an ancestor was replaced". hyper-morph matches and mutates IN PLACE
 * (morphNode / morphAttributes), so nothing is replaced when a peer retypes a
 * sentence — which is the common case this notice exists for.
 *
 * So the region's own content is compared across the morph. The baseline is
 * recorded when the reader focuses the region and refreshed while they type, so
 * their own keystrokes are never read as somebody else's edit, and the
 * comparison runs on `clay:sync-applied`, which fires after the awaited morph.
 * It is re-recorded on EVERY applied frame, named or not: a change nobody is
 * named for would otherwise leave the baseline behind the screen, and the next
 * named frame — which may have touched nothing here — would inherit it and put
 * the wrong person's name on somebody else's edit.
 *
 * The one thing that gets past it: a page script that rewrites the region
 * without an `input` event. That drift is charged to whichever named frame lands
 * next. Typing, pasting and every other user edit of a control or a
 * contenteditable subtree do fire one, which is the case this is for.
 *
 * The region is kept AFTER focus leaves, deliberately. hyper-morph's
 * `ignoreActiveValue` skips both the value sync and the child morph for
 * `document.activeElement`, so nothing can change under the caret while it is
 * still there; the frame worth reporting is the one that lands on the paragraph
 * the reader just left.
 *
 * DISMISS ONLY. An undo here would mean recovering displaced local work, which
 * nothing in this library builds. Unsaved local work is protected before the
 * morph by protectPeerDoc, and a refused save is still the conflict bar's job.
 *
 * Silent with no `by` on the frame, which is the whole gate: the server stamps
 * an author on live-lane frames alone, so a saved-lane reader — who must never
 * be told who wrote the public page they are reading — is silent by
 * construction rather than by a second rule that could disagree.
 *
 * Every root carries all three runtime tokens, for the reason presence.js's
 * header sets out: captureForSaveAndComparison() hands its clone to peers on
 * `clay:snapshot-ready` and strips the save-only regions only AFTER that, so
 * `no-save` alone keeps an author's name out of the file while broadcasting it
 * to every peer on the document.
 *
 *   no-save      not written to the saved file
 *   no-watch     invisible to the mutation system, so a notice is not an edit
 *   no-snapshot  absent from every snapshot, including the one peers receive
 *
 * The name reaches the DOM in one text node inside that subtree and is held
 * nowhere else — no attribute, no data store, nothing a serializer walks.
 */

import { make, set } from '../lib/hostile-css.js';

// Runtime-only chrome, in one string so no root can carry two of the three.
const RUNTIME_ONLY = 'no-save no-watch no-snapshot';

const BG = 'var(--clay-section-bg,#222)';
const INK = 'var(--clay-section-ink,#fff)';
const EDGE = 'var(--clay-section-edge,rgba(255,255,255,.28))';
const FONT = "14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif";

// A control's work is its live value, which its markup does not carry. An
// editable subtree's is its markup, and `outerHTML` covers the region's own
// attributes too, so an in-place attribute change on it counts as a change.
const CONTROLS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

// The nearest element that DECLARES the attribute, which is the host of the
// editable subtree. `isContentEditable` is inherited, so it answers true for
// every descendant text node's parent and names no region at all.
const EDITABLE = '[contenteditable]:not([contenteditable="false"])';

/** Every element this module creates, marked the same way. */
function runtimeRoot(el) {
  el.setAttribute('clay', RUNTIME_ONLY);
  return el;
}

function regionOf(target) {
  if (!target || target.nodeType !== 1 || typeof target.closest !== 'function') return null;
  if (CONTROLS.has(target.tagName)) return target;
  return target.closest(EDITABLE);
}

// Null for a region the frame removed outright, which differs from every string
// a live region can produce and so reads as the change it is.
function contentOf(el) {
  if (!el || !el.isConnected) return null;
  return CONTROLS.has(el.tagName) ? String(el.value) : el.outerHTML;
}

// The stamp arrived over a wire. The server promises a name on every live-lane
// frame, and this still checks, because a frame that cannot be understood must
// draw nothing rather than draw "undefined changed this section".
function nameOf(by) {
  if (!by || typeof by !== 'object') return null;
  const name = typeof by.name === 'string' ? by.name.trim() : '';
  return name || null;
}

class SectionNotice {
  constructor() {
    this.region = null;
    this.content = null;
    this.root = null;
    this.line = null;
    this._wired = false;
    this._onFocusIn = (event) => this.remember(event.target);
    this._onEdit = (event) => this.refresh(event.target);
    this._onApplied = (event) => this.applied(event && event.detail);
  }

  /** Idempotent, so importing this module twice cannot double-report a frame. */
  init() {
    if (this._wired || typeof document === 'undefined') return;
    this._wired = true;
    document.addEventListener('focusin', this._onFocusIn);
    // `input` alone: a <select> fires it before its `change`, and every other
    // user edit of a control or an editable subtree fires it too.
    document.addEventListener('input', this._onEdit);
    document.addEventListener('clay:sync-applied', this._onApplied);
  }

  destroy() {
    if (!this._wired) return;
    this._wired = false;
    document.removeEventListener('focusin', this._onFocusIn);
    document.removeEventListener('input', this._onEdit);
    document.removeEventListener('clay:sync-applied', this._onApplied);
    this.region = null;
    this.content = null;
    if (this.root) this.root.remove();
    this.root = null;
    this.line = null;
  }

  /** The section the reader is working in. Focus on anything else leaves it alone. */
  remember(target) {
    const region = regionOf(target);
    if (!region) return;
    this.region = region;
    this.content = contentOf(region);
  }

  /** Their own typing is not somebody else's edit. */
  refresh(target) {
    const region = regionOf(target);
    if (!region || region !== this.region) return;
    this.content = contentOf(region);
  }

  applied(detail) {
    if (!this.region) return;
    const now = contentOf(this.region);
    const changed = now !== this.content;
    this.content = now;
    if (!changed) return;
    const name = nameOf(detail && detail.by);
    if (!name) return;
    this.show(name);
  }

  show(name) {
    if (!this.build()) return;
    this.line.textContent = `${name} changed this section`;
    set(this.root, 'display', 'flex');
  }

  hide() {
    if (!this.root) return;
    this.line.textContent = '';
    set(this.root, 'display', 'none');
  }

  build() {
    if (this.root && this.root.isConnected) return true;
    if (typeof document === 'undefined' || !document.body) return false;

    this.root = runtimeRoot(make('div', [
      'position:fixed',
      'left:calc(12px + env(safe-area-inset-left,0px))',
      // Clear of the conflict bar, which is bottom-anchored and can span almost
      // the whole width of a phone. That bar is the more urgent of the two, so
      // this one moves rather than covering it.
      'bottom:calc(72px + env(safe-area-inset-bottom,0px))',
      'z-index:2147483000',
      'display:none', 'align-items:center', 'gap:10px',
      'box-sizing:border-box', 'max-width:calc(100vw - 24px)',
      'padding:9px 12px', 'border-radius:10px',
      `background-color:${BG}`, 'background-image:none', `color:${INK}`,
      'border-width:1px', 'border-style:solid', `border-color:${EDGE}`,
      'box-shadow:0 6px 24px rgba(0,0,0,.32),0 1px 2px rgba(0,0,0,.24)',
      `font:${FONT}`, 'text-align:left',
    ]));
    this.root.setAttribute('data-clay-section-notice', '');
    this.root.setAttribute('role', 'status');

    this.line = runtimeRoot(make('span', ['flex:1 1 auto']));
    this.line.setAttribute('data-clay-section-notice-line', '');

    // all:initial first, because a page restyling every button is the normal
    // case rather than the adversarial one; everything it needs is restated.
    const dismiss = runtimeRoot(make('button', [
      'all:initial', 'box-sizing:border-box', 'cursor:pointer', `font:${FONT}`,
      'font-weight:500', 'border-radius:6px', 'padding:4px 8px',
      'white-space:nowrap', 'flex:none', `color:${INK}`, 'opacity:.72',
    ], 'Dismiss'));
    dismiss.type = 'button';
    dismiss.setAttribute('data-clay-section-notice-dismiss', '');
    dismiss.addEventListener('click', () => this.hide());

    this.root.append(this.line, dismiss);
    document.body.appendChild(this.root);
    return true;
  }
}

const sectionNotice = new SectionNotice();

if (typeof document !== 'undefined') sectionNotice.init();

export { sectionNotice, SectionNotice };
export default sectionNotice;
