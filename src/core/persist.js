import { onSnapshot } from './snapshot.js';
import { serializeControlToAttributes, finalizeControlForSave } from '../vendor/control-serialize.vendor.js';

// Persistent Form Input Values
//
// Problem: Browser form values (.value, .checked, .selectedIndex) live in JS
// memory, not in DOM attributes. When clayjs serializes the page via
// cloneNode() or outerHTML, those JS-only values are lost. This module syncs
// them back to the DOM so they survive saves, live-sync, and cloning.
//
// The per-control rules (which attribute represents which control's state) live
// in control-serialize.vendor.js — the single source of truth shared verbatim
// with sapjs (carrier mirror) so the two implementations never drift. This
// module owns only the triggers (which elements, on which events) and the
// snapshot safety net; serializeControlToAttributes / finalizeControlForSave do
// the actual attribute writes.
//
// Strategy: sync to the DOM immediately on every user interaction, not just at
// snapshot time. This means cloneNode() always gets current values.
//
// Why this is safe for each element type:
//
//   <input type="text">  — setAttribute("value", ...) updates the DOM attribute
//     but does NOT change the displayed text or cursor position. The browser's
//     "dirty value flag" (WHATWG spec) means that once a user has typed into an
//     input, the browser ignores attribute changes for display purposes. The
//     attribute and the live .value property become independent surfaces.
//
//   <select>  — Setting/removing the "selected" attribute on <option> elements
//     has no side effects on display or interaction.
//
//   <input type="checkbox/radio">  — Setting/removing the "checked" attribute
//     has no side effects.
//
//   <textarea>  — The hard case. Unlike <input>, a textarea stores its default
//     value as child text nodes, not an attribute. Writing textContent while
//     focused destroys cursor position, scroll, and selection. So instead, we
//     write to a harmless "data-value" attribute on every keystroke (completely
//     inert — no cursor, scroll, or reflow). At snapshot time, the onSnapshot
//     hook reads data-value from the cloned textarea, writes it into the
//     clone's textContent, and strips the attribute. The saved HTML is clean.
//
// The onSnapshot hook also serves as a safety net for all types, catching any
// values that weren't synced by the live listeners (e.g., a textarea that was
// never typed into but had its value set programmatically).
//
// Synergy with onclone (custom-attributes/onclone.js):
// When event-attrs is loaded, its cloneNode() intercept (onclone.js) patches
// data-value into textContent on cloned textareas automatically.

export default function enablePersistentFormInputValues(filterBySelector = "[persist]") {
  const inputSelector = `input${filterBySelector}:not([type="password"]):not([type="hidden"]):not([type="file"])`;
  const textareaSelector = `textarea${filterBySelector}`;
  const selectSelector = `select${filterBySelector}`;

  // --- Live DOM sync: keep attributes in sync on every user interaction ---

  // Text-like inputs and textareas serialize on every keystroke; the shared
  // serializer keeps it cursor-safe (value via the dirty flag, textarea via
  // an inert data-value attribute).
  document.addEventListener('input', (e) => {
    const el = e.target;
    if ((el.matches(inputSelector) && el.type !== 'checkbox' && el.type !== 'radio') ||
        el.matches(textareaSelector)) {
      serializeControlToAttributes(el);
    }
  }, true);

  // Checkboxes, radios, and selects settle on change.
  document.addEventListener('change', (e) => {
    const el = e.target;
    if ((el.matches(inputSelector) && (el.type === 'checkbox' || el.type === 'radio')) ||
        el.matches(selectSelector)) {
      serializeControlToAttributes(el);
    }
  }, true);

  // --- Snapshot hook: final safety net at serialize time ---

  // Safety net at serialize time: write each cloned control's attributes from
  // the live element (the true source of truth — catches values set
  // programmatically without firing an input event, and resolves textarea
  // data-value into real textContent). Matched by index per selector; another
  // hook mutating the clone could diverge the lists, hence the per-type loops.
  onSnapshot((doc) => {
    const finalize = (selector) => {
      const live = document.querySelectorAll(selector);
      const cloned = doc.querySelectorAll(selector);
      cloned.forEach((c, i) => { if (live[i]) finalizeControlForSave(c, live[i]); });
    };
    finalize(inputSelector);
    finalize(textareaSelector);
    finalize(selectSelector);
  });
}

// Auto-initialize with default selector
export function init() {
  enablePersistentFormInputValues("[persist]");
}

// Auto-init when module is imported
init();
