/**
 * presence.js — who else is on this document.
 *
 * A fixed-corner stack of circles, one per participant the host chose to name,
 * plus a count of everyone it did not. The host decides who is named, per
 * recipient, from that recipient's own access; nothing here asks for a name and
 * nothing here can widen what arrived.
 *
 * THE RULE THIS FILE EXISTS TO GET RIGHT.
 *
 * captureForSaveAndComparison() clones the document, hands that clone to peers
 * on `clay:snapshot-ready`, and only THEN strips the save-only regions. So
 * `no-save` alone is not enough: it keeps names out of the file while
 * broadcasting them to every peer on the document, including a visitor the host
 * deliberately answered with a count and no names. `no-snapshot` is the token
 * that runs BEFORE the clone is emitted (captureSnapshot), so every runtime root
 * here carries all three, tooltip included:
 *
 *   no-save      not written to the saved file
 *   no-watch     invisible to the mutation system, so a roster change is not an edit
 *   no-snapshot  absent from every snapshot, including the one peers receive
 *
 * The roster lives in this module's memory. It is never written to a DOM data
 * store, an attribute or anything else a serializer walks — the names on screen
 * are text nodes inside a subtree that no snapshot contains, and the hover label
 * is held in a closure rather than in `title`. Styling is inline and hostile-css
 * !important throughout, so there is no injected <style> tag to mark either.
 *
 * Gated on the host, not on the first frame: a host that does not announce
 * `presence` draws nothing at all rather than an empty stack. That is what
 * hyperclay-local, HTML Clay and makerclay do today and it stays that way until
 * they adopt it.
 *
 * `people[].id` is an opaque keyed pseudonym. It picks the colour and nothing
 * else: it is not a database id, it names no account, and it is never logged.
 */

import { hostSupports } from '../core/host-meta.js';
import { make, set } from '../lib/hostile-css.js';

// Runtime-only chrome, in one string so no root can carry two of the three.
const RUNTIME_ONLY = 'no-save no-watch no-snapshot';

// Two initials at 12px need about 15px of the circle, so the overlap has to
// leave that much clear or the neighbouring circle eats the second letter.
const SIZE = 30;
const OVERLAP = 6;
const FONT = "12px/1 system-ui,-apple-system,'Segoe UI',sans-serif";
const LABEL_FONT = "12px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif";

// The chrome around the circles is themeable like every other clayjs surface.
// The circles themselves are not: their colour is computed per participant, so
// there is no one value a page could override.
const INK = 'var(--clay-presence-ink,#1f2023)';
const CHIP_BG = 'var(--clay-presence-bg,#fff)';
const CHIP_EDGE = 'var(--clay-presence-edge,rgba(0,0,0,.14))';
const TIP_BG = 'var(--clay-presence-tip-bg,#222)';
const TIP_INK = 'var(--clay-presence-tip-ink,#fff)';
const FACE = '#ffffff';

// A fixed set rather than a computed hue: every one of these was looked at
// against white initials, and a hue wheel puts neighbouring pseudonyms on two
// blues nobody can tell apart.
const COLORS = [
  '#b91c1c', '#c2410c', '#a16207', '#15803d', '#0f766e',
  '#0369a1', '#1d4ed8', '#6d28d9', '#a21caf', '#9f1239',
];

/** Every element this module creates, marked the same way. */
function runtimeRoot(el) {
  el.setAttribute('clay', RUNTIME_ONLY);
  return el;
}

function hashOf(id) {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = (((h << 5) + h) ^ id.charCodeAt(i)) >>> 0;
  }
  return h;
}

// The pseudonym picks the colour and nothing else.
function colorFor(id) {
  return COLORS[hashOf(id) % COLORS.length];
}

// Array.from, not [0]: a name starting outside the BMP would otherwise show half
// a character.
function initialsOf(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = (word) => Array.from(word)[0].toUpperCase();
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[1]);
}

/**
 * Read the roster frame defensively. Everything here arrived over a wire, and a
 * frame this function cannot understand must draw nothing rather than draw a
 * guess: `[object Object]` in a circle is worse than an empty corner.
 */
function normalize(data) {
  const list = data && Array.isArray(data.people) ? data.people : [];
  const people = [];
  for (const person of list) {
    if (!person || typeof person.id !== 'string' || !person.id) continue;
    const name = typeof person.name === 'string' && person.name.trim() ? person.name.trim() : 'Someone';
    people.push({
      id: person.id,
      name,
      canEdit: person.canEdit === true,
      you: person.you === true,
    });
  }
  const count = data && data.anonymous;
  const anonymous = typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return { people, anonymous };
}

class Presence {
  constructor() {
    this.roster = { people: [], anonymous: 0 };
    this.root = null;
    this.stack = null;
    this.count = null;
    this.tip = null;
    this._gate = null;
  }

  /**
   * Does this host run presence at all? Asked once, of /_/meta, and never
   * inferred from a frame arriving: the answer decides whether the chrome is
   * built, so a host that says nothing draws nothing forever.
   */
  supported() {
    if (!this._gate) this._gate = hostSupports('presence').then((ok) => ok === true, () => false);
    return this._gate;
  }

  /**
   * Take a roster frame. Held in memory first so a frame that arrives before
   * discovery answers is not lost, and drawn only if the host announced the
   * capability.
   *
   * @param {{people: Array, anonymous: number}} data
   * @returns {Promise<void>}
   */
  async update(data) {
    this.roster = normalize(data);
    if (!(await this.supported())) return;
    this.render();
  }

  /** The stream went away, so the roster is no longer true about anything. */
  clear() {
    this.roster = { people: [], anonymous: 0 };
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    this.stack = null;
    this.count = null;
    this.tip = null;
  }

  render() {
    const { people, anonymous } = this.roster;

    // A person alone on a document is told nothing at all. The count is the
    // total either way: a recipient the host would not name gets people: [] and
    // everyone in `anonymous`, so this sum is the same participant count in both
    // directions.
    if (people.length + anonymous <= 1) {
      this.hide();
      return;
    }
    if (!this.build()) return;

    this.hideTip();
    this.stack.textContent = '';
    for (const person of people) {
      this.stack.appendChild(this.avatar(person));
    }
    // The overlap belongs between circles, so the leftmost one does not pull
    // itself into the count beside it.
    if (this.stack.firstElementChild) set(this.stack.firstElementChild, 'margin-left', '0');

    if (anonymous > 0) {
      this.count.textContent = `+${anonymous} viewing`;
      set(this.count, 'display', 'inline-block');
    } else {
      this.count.textContent = '';
      set(this.count, 'display', 'none');
    }
    set(this.root, 'display', 'flex');
  }

  hide() {
    if (!this.root) return;
    this.hideTip();
    this.stack.textContent = '';
    this.count.textContent = '';
    set(this.root, 'display', 'none');
  }

  build() {
    if (this.root) return true;
    if (typeof document === 'undefined' || !document.body) return false;

    this.root = runtimeRoot(make('div', [
      'position:fixed',
      'top:calc(12px + env(safe-area-inset-top,0px))',
      'right:calc(12px + env(safe-area-inset-right,0px))',
      'z-index:2147483000',
      'display:flex', 'align-items:center', 'gap:8px',
      'max-width:calc(100vw - 24px)',
      `font:${LABEL_FONT}`, `color:${INK}`,
      // Only the circles take a pointer. A fixed corner that swallowed clicks
      // would take a bite out of whatever the page put underneath it.
      'pointer-events:none',
    ]));
    this.root.setAttribute('data-clay-presence', '');

    this.count = runtimeRoot(make('span', [
      'box-sizing:border-box', 'flex:none', 'white-space:nowrap',
      'padding:4px 8px', 'border-radius:999px',
      `background-color:${CHIP_BG}`, 'background-image:none', `color:${INK}`,
      'border-width:1px', 'border-style:solid', `border-color:${CHIP_EDGE}`,
      `font:${LABEL_FONT}`,
      'box-shadow:0 1px 3px rgba(0,0,0,.2)',
      'display:none',
    ]));
    this.count.setAttribute('data-clay-presence-count', '');

    this.stack = runtimeRoot(make('div', [
      'display:flex', 'align-items:center', 'flex:none',
    ]));

    // Inside the root rather than appended to <body>, so the one element that
    // holds a name at rest cannot outlive the subtree that keeps it out of a
    // snapshot. It carries the marking of its own too.
    this.tip = runtimeRoot(make('span', [
      'position:absolute', 'top:100%', 'right:0', 'margin-top:6px',
      'box-sizing:border-box', 'white-space:nowrap', 'pointer-events:none',
      'padding:4px 8px', 'border-radius:6px',
      `background-color:${TIP_BG}`, 'background-image:none',
      `color:${TIP_INK}`, `font:${LABEL_FONT}`,
      'box-shadow:0 4px 14px rgba(0,0,0,.28)',
      'display:none',
    ]));
    this.tip.setAttribute('data-clay-presence-tip', '');

    this.root.append(this.stack, this.count, this.tip);
    document.body.appendChild(this.root);
    return true;
  }

  avatar(person) {
    const color = colorFor(person.id);
    // Solid says this person can change the document; hollow says they are
    // reading it. The two are the same three colours inverted, so a stack of
    // both reads as one set rather than as two kinds of thing.
    const skin = person.canEdit
      ? [`background-color:${color}`, `color:${FACE}`, `border-color:${FACE}`]
      : [`background-color:${FACE}`, `color:${color}`, `border-color:${color}`];

    const el = runtimeRoot(make('div', [
      'box-sizing:border-box', 'flex:none',
      `width:${SIZE}px`, `height:${SIZE}px`, 'border-radius:50%',
      'display:flex', 'align-items:center', 'justify-content:center',
      `font:${FONT}`, 'font-weight:600',
      `margin-left:-${OVERLAP}px`,
      'border-width:2px', 'border-style:solid', 'background-image:none',
      'box-shadow:0 1px 3px rgba(0,0,0,.28)',
      'user-select:none', 'cursor:default', 'pointer-events:auto',
      ...skin,
    ], initialsOf(person.name)));
    el.setAttribute('data-clay-presence-avatar', '');

    // The name lives in this closure, never in an attribute on the element, and
    // it reaches the DOM only while a pointer is actually on the circle.
    const label = person.you ? `${person.name} (you)` : person.name;
    el.addEventListener('mouseenter', () => this.showTip(label));
    el.addEventListener('mouseleave', () => this.hideTip());
    return el;
  }

  showTip(text) {
    if (!this.tip) return;
    this.tip.textContent = text;
    set(this.tip, 'display', 'block');
  }

  hideTip() {
    if (!this.tip) return;
    this.tip.textContent = '';
    set(this.tip, 'display', 'none');
  }
}

const presence = new Presence();

export { presence, Presence };
export default presence;
