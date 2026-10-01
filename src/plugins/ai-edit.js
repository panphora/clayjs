/**
 * ai-edit — comment-to-edit AI editing over clay.wire.
 *
 * Direct editing stays primary: text units carry editmode:contenteditable, so a
 * click places the caret and a figure keeps its own interactivity. This adds the
 * comment box on demand: Cmd+J (Ctrl+J elsewhere) or the small chip at the end of a
 * selection, for the block around it; on pages built from [data-edit-id] sections,
 * also a hover chip near the unit, a click on bare section padding, and the fixed
 * bottom-right bubble for the whole document.
 *
 * The request leaves as a named helper request on the wire
 * (`clay.wire.send(payload, { helper: "ai-edit" })`) and comes back as the edited
 * element's own HTML. A named request defaults to `document: "none"`, so the host
 * writes nothing: this page morphs the result in and Keep saves it through
 * `clay.save()`, exactly as before.
 *
 * Dormant unless the host lists an `ai-edit` helper: then nothing is built and the
 * page is just a page. Listed as unavailable (the host's toggle is off), the
 * shortcut opens the panel with a note and no Send, and the state is checked again
 * each time the panel opens.
 *
 * The bus version previewed the reply as it streamed. The wire carries status lines
 * only — replaceable progress, capped and droppable — so the page shows throttled
 * status lines ("Writing, 1.8 KB") and then the result once, with Keep/Revert as
 * before. `@page` reads the saved file from disk rather than a copy in the payload:
 * the plugin saves first and then sends `{ page: true }`, because a whole page never
 * fits the envelope.
 *
 * Undo integration: observers pause at request start. On Keep the element is rewound
 * to the snapshot while still paused, observers resume, then one final morph lands
 * the whole AI edit as a single undoable step. On Revert the rewind happens under
 * pause, so history never sees the edit at all.
 *
 * All injected chrome is runtime-only (`no-save no-watch no-snapshot`): never saved,
 * invisible to the mutation system (its status text changes constantly), absent from
 * every snapshot and from what peers receive.
 */
import { HyperMorph } from "../vendor/hyper-morph.vendor.js";
import { mergeTagRecognizers } from "../sync/merge-tags.js";
import Mutation from "../lib/mutation.js";
import { isEditMode } from "../core/is-edit-mode.js";
import { holdAllSaves, releaseAllSaves } from "../core/save.js";
import { STRIP_FROM_SAVE } from "../lib/region-policy.js";
import { enableContentEditable } from "../core/admin-contenteditable.js";
import onDomReady from "../lib/dom-ready.js";
import wire from "./wire.js";
import { set } from "../lib/hostile-css.js";
import { bevelBox, bevelButton, bevelSurface, bevelText, bevelInput, pageScheme, setShown, RUNTIME_ONLY } from "../ui/bevel-controls.js";
import { TOKENS, FONT_SANS, FONT_MONO, SHADOW } from "../ui/bevel.js";

const HELPER = "ai-edit";
const UNIT_SELECTOR = "h1,h2,h3,h4,h5,h6,p,figure";
// Outside [data-edit-id] sections: the nearest text block that holds the whole
// selection, else the nearest container that does. A selection across top-level blocks
// edits the whole page.
const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,dt,dd,blockquote,pre,figcaption,td,th";
const CONTAINER_SELECTOR = "section,article,aside,header,footer,nav,main,div,ul,ol,dl,table,figure,form";
const NOT_TEXT = "script,style,template,textarea,input,select,button,iframe,svg,math";
// The request ceiling, kept below the host's 1 MiB envelope so the refusal happens
// here, where the message can say what to do about it.
const MAX_PAYLOAD_BYTES = 900 * 1024;
const TOO_LARGE = "This section is too large for AI editing; select a smaller part.";

let requestCounter = 0;
let session = null; // one edit at a time
let panel, ring, textarea, quoteEl, statusEl, warningsEl, hintEl, closeButton, chip, docBubble;
let buttons = {};
let anchorEl = null;    // element the panel is currently anchored to
let chipTarget = null;  // unit the hover chip currently points at
let chipHideTimer = null;
let pendingSelection; // { text, start, end } for the open panel, or undefined

let chipSelection;       // the selection the chip was raised for; undefined for the hover chip
let selectionTimer = null;
let anchorRange = null;  // the selection the open panel was raised for
let returnFocus = null;  // where focus goes back to when the panel closes
let helperState = null;  // "ready" or "unavailable"

const HIGHLIGHT = 'clay-ai-edit';
const OFF_MESSAGE = 'AI editing is turned off. Turn it on from the app’s menu.';

// ---------------------------------------------------------------- transport

// The helper's state as this host lists it: "ready", "unavailable" (listed, but the
// host's toggle is off), or null when there is no ai-edit helper to talk to.
async function helperStateNow() {
  const list = await wire.helpers();
  const helper = list.find(h => h.name === HELPER);
  return helper && (helper.state === 'ready' || helper.state === 'unavailable') ? helper.state : null;
}

// ---------------------------------------------------------------- observers (undo/autosave)

function pauseObservers() {
  Mutation.pause();
}

function resumeObservers() {
  Mutation.resume();
}

// ---------------------------------------------------------------- units

// The editable unit for an interaction: nearest heading/paragraph/figure inside a
// [data-edit-id] section, else the section itself.
function unitFrom(target) {
  if (!(target instanceof Element)) return null;
  const section = target.closest('[data-edit-id]');
  if (!section) return null;
  const unit = target.closest(UNIT_SELECTOR);
  return unit && section.contains(unit) ? unit : section;
}

function editLabel(el) {
  if (el === document.body) return 'document';
  const own = el.getAttribute('data-edit-id');
  if (own) return own;
  const section = el.closest('[data-edit-id]');
  if (!section) return el.id ? '#' + el.id : el.tagName.toLowerCase();
  return section.getAttribute('data-edit-id') + ' \u203a ' + el.tagName.toLowerCase();
}

function liveRange() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  return selection.getRangeAt(0);
}

// The element a selection edits. Section pages keep their unit rules; everywhere
// else it is the block around the whole selection, so a backward selection and a
// forward one land on the same element.
function targetFromRange(range) {
  let node = range.commonAncestorContainer;
  if (node.nodeType !== 1) node = node.parentElement;
  if (!node || !document.body.contains(node)) return null;
  // A selection across top-level blocks has only the page around it.
  if (node === document.body) return document.body;
  if (node.closest('[data-clay-ai-edit]') || node.closest(STRIP_FROM_SAVE) || node.closest(NOT_TEXT)) return null;
  if (node.closest('[data-edit-id]')) return unitFrom(node);
  const target = node.closest(BLOCK_SELECTOR) || node.closest(CONTAINER_SELECTOR);
  return target && target !== document.body ? target : null;
}

// The selected text, whole, with its character offsets inside the target's text,
// so a phrase that appears twice is unambiguous.
function selectionIn(range, target) {
  if (!range || !target || !target.contains(range.commonAncestorContainer)) return undefined;
  const text = range.toString();
  if (!text.trim()) return undefined;
  const before = document.createRange();
  before.selectNodeContents(target);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { text, start, end: start + text.length };
}

function quoteFromSelection(scope) {
  const range = liveRange();
  if (!range) return undefined;
  if (scope === document.body) {
    const text = range.toString();
    return text.trim() ? { text, start: undefined, end: undefined } : undefined;
  }
  return selectionIn(range, scope);
}

function strippedBodyHTML() {
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll(STRIP_FROM_SAVE).forEach(node => node.remove());
  return clone.outerHTML;
}

// ---------------------------------------------------------------- morphing

function morphTo(el, content, scripts) {
  return HyperMorph.morph(el, content, { morphStyle: 'outerHTML', restoreFocus: true, scripts });
}

// Session-aware morph. Document mode morphs the whole body but vetoes removal of the
// chrome this plugin injected (the model never saw it, so a plain morph would delete
// the panel mid-flight). Either way, re-run the contenteditable pass afterwards: a
// reply may drop the runtime attribute.
// Forward morphs three-way merge mergeable script tags ([merge] + rules tags)
// against the snapshot the model saw, so data the user changed mid-flight survives
// the reply. Rewinds must restore the snapshot exactly, so they disable merging.
function sessionMorph(s, content, { rewind = false } = {}) {
  // handle:false: a reply's scripts never run, so the preview cannot execute code
  // before Keep, and neither can a rewind.
  const scripts = rewind
    ? { merge: false, handle: false }
    : { mergeBase: s.snapshot, mergeTags: mergeTagRecognizers, handle: false };
  if (s.docMode) {
    if (typeof content === 'string') {
      // Parse to an element ourselves: hyper-morph parses a body string into a
      // full document and would insert DOMParser's synthesized empty <head>
      // alongside the morphed body. An element gets sibling-free treatment.
      content = new DOMParser().parseFromString(content, 'text/html').body;
    }
    HyperMorph.morph(document.body, content, {
      morphStyle: 'outerHTML',
      restoreFocus: true,
      scripts,
      callbacks: {
        beforeNodeRemoved: node => !(node.nodeType === 1 && node.matches(STRIP_FROM_SAVE))
      }
    });
  } else {
    morphTo(s.el, content, scripts);
  }
  enableContentEditable();
}

// Extract a morphable single-root candidate from a (possibly partial, possibly
// fenced) reply. Returns an inert element or null. Template parsing auto-closes
// half-open tags and never executes scripts — but silently strips <body> tags, so a
// body candidate parses via DOMParser (equally inert).
function candidateFrom(html, tag) {
  const start = html.search(new RegExp('<' + tag + '(\\s|>)', 'i'));
  if (start === -1) return null;
  const cleaned = html.slice(start).replace(/\s*`{1,3}\s*$/, '');
  if (tag.toLowerCase() === 'body') {
    return new DOMParser().parseFromString(cleaned, 'text/html').body;
  }
  const template = document.createElement('template');
  template.innerHTML = cleaned;
  const candidate = template.content.firstElementChild;
  if (!candidate || candidate.tagName.toLowerCase() !== tag.toLowerCase()) return null;
  return candidate;
}

// ---------------------------------------------------------------- session lifecycle

function newSession(el, comment, quote) {
  const docMode = el === document.body;
  // Context refs are @tokens containing a dot or slash (@notes.md, @src/x.js). Bare
  // @words are not refs: a leading one is an engine token (@fable, @codex — routed
  // helper-side), and mid-text ones are prose.
  const contextRefs = [...comment.matchAll(/@([\w.-]*[/.][\w./-]*)/g)]
    .map(m => m[1])
    .filter(ref => ref !== 'page');
  const elementHTML = docMode ? strippedBodyHTML() : el.outerHTML;
  const payload = {
    id: 'req-' + Date.now().toString(36) + '-' + (++requestCounter),
    editId: editLabel(el),
    tag: el.tagName.toLowerCase(),
    elementHTML,
    comment,
    contextRefs
  };
  if (quote) {
    payload.quote = quote.text;
    if (Number.isInteger(quote.start)) payload.selection = { start: quote.start, end: quote.end };
  }
  // Document mode reads the live page itself, and every other @page request reads
  // the file from disk: the plugin saves first, then asks for it by flag.
  if (!docMode && /@page\b/.test(comment)) payload.page = true;
  return {
    id: payload.id,
    el,
    docMode,
    tag: payload.tag,
    reassertId: docMode ? null : el.getAttribute('data-edit-id'),
    snapshot: elementHTML,
    payload,
    state: 'requesting',
    paused: false,
    handle: null,
    finalCandidate: null
  };
}

async function sendRequest(el, comment, quote) {
  session = newSession(el, comment, quote);
  // Refused here, before anything is sent or paused: the envelope would refuse it
  // anyway, and a refusal the page cannot explain is worse than one it can.
  if (new Blob([JSON.stringify(session.payload)]).size > MAX_PAYLOAD_BYTES) {
    session = null;
    setStatus(TOO_LARGE, 'warn');
    showButtons('send');
    return;
  }
  session.paused = true;
  pauseObservers();
  setStatus('sending\u2026');
  showButtons('stop');
  // @page reads the file the host has on disk, so the page has to be on disk first.
  if (/@page\b/.test(comment) && !session.docMode) await window.clay.save();
  if (!session) return; // cancelled while saving
  // The host owns the deadline; this side only renders. A named request defaults to
  // `document: "none"`, so nothing here asks anyone to write the file.
  // Only the live session's statuses land: a line from a request the user already
  // cancelled or replaced must not repaint the panel.
  const handle = wire.send(session.payload, {
    helper: HELPER,
    onStatus: ({ text }) => { if (session?.handle === handle) setStatus(text); }
  });
  session.handle = handle;
  const outcome = await handle.done;
  if (!session || session.handle !== handle) return;
  if (outcome.state === 'done') onDone(outcome.result || {});
  else if (outcome.state === 'cancelled') { revertSession(); setStatus('cancelled'); showButtons('send'); }
  else onError(outcome.error || 'the helper reported an error');
}

// What a reply may not add: anything that runs code. Each part is counted, and the
// reply is refused when it holds more of any part than the element the model was
// given, so a page's own scripts and handlers are not a reason to refuse an edit
// near them, while a copied handler or a changed script is.
const ACTIVE_ATTR = /^(on|hx-on|x-|@|:|v-on:|v-bind:|data-on[-:])/;
const ACTIVE_TAGS = new Set(['iframe', 'frame', 'object', 'embed', 'base', 'link']);

// URL parsing removes tab, CR and LF anywhere and controls and spaces at the start,
// so "java&#9;script:" is still a javascript: URL.
function isScriptURL(value) {
  const url = value.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+/, '').toLowerCase();
  return url.startsWith('javascript:') || url.startsWith('vbscript:');
}

// A script whose type the browser does not run (JSON, a template) is data.
function runsAsCode(script) {
  const type = (script.getAttribute('type') || '').trim().toLowerCase();
  return !type || /javascript|ecmascript/.test(type) || ['module', 'importmap', 'speculationrules'].includes(type);
}

function attrsOf(el) {
  return [...el.attributes].map(a => a.name.toLowerCase() + '=' + a.value).sort().join(' ');
}

function activeParts(root) {
  const parts = new Map();
  const add = (part) => parts.set(part, (parts.get(part) || 0) + 1);
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script') {
      if (runsAsCode(el)) add('script ' + attrsOf(el) + '|' + el.textContent.trim());
    } else if (ACTIVE_TAGS.has(tag) || (tag === 'meta' && el.hasAttribute('http-equiv'))) {
      add(tag + ' ' + attrsOf(el));
    } else if ((tag === 'animate' || tag === 'set') && /href/i.test(el.getAttribute('attributeName') || '')) {
      add(tag + ' ' + attrsOf(el));
    }
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase();
      if (ACTIVE_ATTR.test(name)) add(tag + ' ' + name + '=' + attr.value.trim());
      else if (name === 'srcdoc') add(tag + ' srcdoc=' + attr.value);
      else if (isScriptURL(attr.value)) add(tag + ' ' + name + '=' + attr.value);
    }
  }
  return parts;
}

function addsActiveContent(candidate, snapshot, docMode) {
  const original = docMode
    ? new DOMParser().parseFromString(snapshot, 'text/html').body
    : (() => { const t = document.createElement('template'); t.innerHTML = snapshot; return t.content.firstElementChild; })();
  const before = original ? activeParts(original) : new Map();
  for (const [part, count] of activeParts(candidate)) if (count > (before.get(part) || 0)) return true;
  return false;
}

const ACTIVE_REFUSED = 'The reply adds a script or event handler, so it was not applied. AI editing changes content, not code.';

function onDone(payload) {
  if (!session || session.state !== 'requesting') return;
  session.state = 'deciding';

  const warnings = [];
  let candidate = candidateFrom(payload.html || '', session.tag);
  if (!candidate) {
    onError(`reply is not a single <${session.tag}> element`);
    return;
  }
  if (!session.docMode) { // template parsing strips <body>, making this check meaningless there
    const template = document.createElement('template');
    template.innerHTML = payload.html || '';
    if (template.content.children.length > 1) {
      warnings.push('reply had extra root elements \u2014 kept the first');
    }
  }
  if (session.reassertId) candidate.setAttribute('data-edit-id', session.reassertId);
  if (addsActiveContent(candidate, session.snapshot, session.docMode)) {
    onError(ACTIVE_REFUSED);
    return;
  }

  holdAllSaves();
  session.held = true;

  session.finalCandidate = candidate;
  try {
    sessionMorph(session, candidate); // authoritative morph from the full final HTML
  } catch (error) {
    onError('the reply could not be applied: ' + (error?.message || error));
    return;
  }
  positionChrome();
  setStatus(payload.model ? `done (${payload.model})` : 'done');
  showWarnings(warnings);
  showButtons('keep', 'revert');
  textarea.value = '';
}

function onError(message) {
  if (!session) return;
  revertSession();
  setStatus(message, 'warn');
  showButtons('send');
}

// Rewind to the pre-edit snapshot and release observers. The paused rewind means
// undo history never sees the abandoned edit.
function revertSession() {
  const s = session;
  session = null;
  if (!s) return;
  try {
    if (s.state === 'requesting' || s.state === 'deciding') {
      sessionMorph(s, s.snapshot, { rewind: true });
    }
  } finally {
    if (s.paused) resumeObservers();
    if (s.held) releaseAllSaves();
    positionChrome();
  }
}

async function keepSession() {
  const s = session;
  session = null;
  try {
    sessionMorph(s, s.snapshot, { rewind: true }); // rewind while observers are still paused
  } finally {
    if (s.paused) resumeObservers();    // boundary drain discards the rewind
    if (s.held) releaseAllSaves({ replay: false });
  }
  sessionMorph(s, s.finalCandidate);  // recorded: the whole edit = one undo step
  positionChrome();
  showButtons('send');
  setStatus('saving\u2026');
  const result = await window.clay.save();
  setStatus((result && result.msg) || 'saved', result && result.msgType === 'error' ? 'warn' : '');
}

function cancelStream() {
  // Stop is live from the moment the request starts, which includes the window where
  // an @page save is still in flight and there is no handle yet.
  session?.handle?.cancel();
  revertSession();
  setStatus('cancelled');
  showButtons('send');
}

// ---------------------------------------------------------------- chrome

// Everything below is drawn on somebody else's page, so it follows the hostile-CSS
// contract: runtime-only, no ids or classes, every declaration inline and !important
// from all:initial, in Bevel material from the generated subset. Show and hide go
// through setShown and positions through set(), both !important, so no page rule can
// reveal a hidden part or move a placed one.
const FLOATING = ['z-index:99999', 'padding:0', 'display:inline-grid', 'place-items:center', 'line-height:1', `box-shadow:${SHADOW}`];

function marked(el, name, value) {
  el.setAttribute(name, value);
  return el;
}

function buildChrome() {
  const style = document.createElement('style');
  style.setAttribute('clay', RUNTIME_ONLY);
  style.textContent = `
    [editmode\\:contenteditable][contenteditable]:focus {
      outline: 1px solid #4a4a6a; outline-offset: 4px; border-radius: 2px;
    }
    ::highlight(clay-ai-edit) { background-color: ${TOKENS['brass-soft']} !important; }
  `;
  document.head.appendChild(style);

  const scheme = `color-scheme:${pageScheme()}`;

  ring = marked(bevelBox('div', [
    'box-sizing:content-box', 'position:fixed', 'z-index:99998', 'pointer-events:none',
    `border:2px solid ${TOKENS.brass}`, 'border-radius:0', scheme,
  ]), 'data-clay-ai-edit', 'ring');
  setShown(ring, false);

  panel = marked(bevelSurface('div', [
    'position:fixed', 'z-index:99999', 'width:min(30rem, calc(100vw - 32px))',
    'padding:10px', `font:13px/1.5 ${FONT_SANS}`, scheme,
  ]), 'data-clay-ai-edit', 'panel');
  setShown(panel, false);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'AI edit');

  const part = (el, name) => marked(el, 'data-clay-ai-edit-part', name);

  const eyebrow = bevelBox('div', ['display:flex', 'align-items:center', 'justify-content:space-between', 'margin-bottom:6px']);
  const eyebrowLabel = bevelText('span', [
    `color:${TOKENS.muted}`, `font:600 10.5px/1 ${FONT_SANS}`, 'letter-spacing:0.08em', 'text-transform:uppercase',
  ], 'AI edit');
  closeButton = part(bevelButton('×', { small: true, variant: 'quiet' }), 'close');
  closeButton.setAttribute('aria-label', 'Close');
  eyebrow.append(eyebrowLabel, closeButton);

  quoteEl = part(bevelText('div', [
    'display:block', `color:${TOKENS.muted}`, `border-left:2px solid ${TOKENS.brass}`,
    'padding-left:8px', 'margin-bottom:8px', 'white-space:normal', 'overflow:hidden',
    'max-height:3em', `font:12.5px/1.5 ${FONT_MONO}`,
  ]), 'quote');
  setShown(quoteEl, false);

  textarea = part(bevelInput('textarea', {
    rules: ['min-height:3.2em', 'resize:vertical', 'padding:8px', `font:13px/1.5 ${FONT_SANS}`],
  }), 'input');
  textarea.rows = 2;
  textarea.placeholder = 'Describe the change';
  textarea.setAttribute('aria-label', 'Describe the change');

  statusEl = part(bevelText('span', [
    'flex:1', 'min-width:0', `color:${TOKENS.muted}`, `font:12.5px/1.5 ${FONT_MONO}`,
  ]), 'status');
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');

  hintEl = part(bevelText('div', [
    'display:block', 'margin-top:6px', `color:${TOKENS.muted}`, `font:11.5px/1.4 ${FONT_SANS}`,
  ], 'Enter sends · @fable or @codex picks another agent · @file.ext adds context'), 'hint');

  const variants = { send: 'primary', stop: 'default', revert: 'quiet', keep: 'primary' };
  const labels = { send: 'Send', stop: 'Stop', revert: 'Revert', keep: 'Keep' };
  for (const name of ['send', 'stop', 'revert', 'keep']) {
    buttons[name] = part(bevelButton(labels[name], { small: true, variant: variants[name] }), name);
    setShown(buttons[name], name === 'send', 'inline-flex');
  }

  const row = bevelBox('div', ['display:flex', 'align-items:center', 'gap:8px', 'margin-top:8px']);
  row.append(statusEl, buttons.send, buttons.stop, buttons.revert, buttons.keep);

  warningsEl = part(bevelText('div', [
    'display:block', 'margin-top:8px', `color:${TOKENS.ox}`, 'white-space:pre-line',
  ]), 'warnings');
  setShown(warningsEl, false);

  panel.append(eyebrow, quoteEl, textarea, hintEl, row, warningsEl);

  chip = marked(bevelButton('AI', {
    small: true,
    extra: ['position:fixed', 'width:26px', 'height:26px', `font:600 11px/1 ${FONT_SANS}`, ...FLOATING, scheme],
  }), 'data-clay-ai-edit', 'chip');
  chip.title = 'Comment on this (\u2318J)';
  setShown(chip, false, 'inline-grid');

  docBubble = marked(bevelButton('AI', {
    extra: ['position:fixed', 'width:40px', 'height:40px', `font:600 14px/1 ${FONT_SANS}`, ...FLOATING, scheme],
  }), 'data-clay-ai-edit', 'bubble');
  docBubble.title = 'Comment on the whole page';
  placeBubble();

  document.body.append(ring, panel, chip, docBubble);
  syncBubble();

  buttons.send.addEventListener('click', submit);
  buttons.stop.addEventListener('click', cancelStream);
  buttons.keep.addEventListener('click', keepSession);
  buttons.revert.addEventListener('click', () => { revertSession(); setStatus('reverted'); showButtons('send'); });
  closeButton.addEventListener('click', () => {
    if (session?.state === 'requesting') cancelStream();
    closePanel();
  });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!buttons.send.hidden) submit();
    }
  });

  chip.addEventListener('mousedown', (event) => event.preventDefault()); // keeps the page's selection alive
  chip.addEventListener('click', () => {
    const target = chipTarget;
    const selection = chipSelection;
    hideChip();
    if (target && !session) openPanel(target, selection || quoteFromSelection(target));
  });
  docBubble.addEventListener('click', () => {
    if (session) return;
    // Like a click outside, a second click keeps a typed comment: it closes an empty panel only.
    if (!panel.hidden && anchorEl === document.body) {
      if (textarea.value.trim()) textarea.focus();
      else closePanel();
      return;
    }
    openPanel(document.body, quoteFromSelection(document.body));
  });

  window.addEventListener('scroll', () => { positionChrome(); hideChip(); }, { passive: true });
  window.addEventListener('resize', () => { placeBubble(); positionChrome(); }, { passive: true });
  // The CMS toggle can arrive after this chrome, and a docked sidebar slides it left.
  const replace = () => { placeBubble(); positionChrome(); };
  document.addEventListener('hcms:open', () => { replace(); setTimeout(replace, 350); });
  document.addEventListener('hcms:close', () => { replace(); setTimeout(replace, 350); });
  new MutationObserver((records) => {
    syncBubble();
    const touched = (nodes) => [...nodes].some((n) => n.nodeType === 1 && n.hasAttribute('data-hcms-toggle-host'));
    if (records.some((r) => touched(r.addedNodes) || touched(r.removedNodes))) replace();
  }).observe(document.body, { childList: true });

  // A target removed from the page ends its edit, so the save hold and the paused
  // observers never outlive it.
  new MutationObserver(() => {
    if (anchorEl && !anchorEl.isConnected && !panel.hidden) closePanel();
  }).observe(document.body, { childList: true, subtree: true });
}

// The whole-page bubble belongs to pages built from [data-edit-id] sections. A plain
// page gets the selection chip and the shortcut instead.
function syncBubble() {
  const doc = docBubble?.ownerDocument;
  if (!doc) return;
  setShown(docBubble, helperState === 'ready' && !!doc.querySelector('[data-edit-id]'), 'inline-grid');
}

// The selected words stay marked while the person types, through the CSS Custom
// Highlight API, so the page's DOM never changes.
function highlight(range) {
  if (!range || typeof window.Highlight !== 'function' || !window.CSS?.highlights) return;
  window.CSS.highlights.set(HIGHLIGHT, new window.Highlight(range));
}

function clearHighlight() {
  window.CSS?.highlights?.delete(HIGHLIGHT);
}

function applyHelperState() {
  const on = helperState === 'ready';
  textarea.disabled = !on;
  setShown(hintEl, on);
  if (on) {
    if (statusEl.textContent === OFF_MESSAGE) setStatus('');
    if (!session) showButtons('send');
  } else {
    setStatus(OFF_MESSAGE, 'warn');
    showButtons();
  }
  syncBubble();
}

// The host's toggle can change while the page is open, so each opening asks again.
function refreshHelperState() {
  helperStateNow().then((state) => {
    helperState = state || 'unavailable';
    if (!panel.hidden && !session) applyHelperState();
    else syncBubble();
  }).catch(() => {});
}

// The bubble sits in the bottom-right corner, or just left of the CMS's "Edit content"
// toggle when the page has one, bottoms aligned, so the two never overlap.
function placeBubble() {
  if (!docBubble) return;
  const host = document.querySelector('[data-hcms-toggle-host]');
  const rect = host && host.getBoundingClientRect();
  const beside = !!rect && rect.width > 0 && rect.height > 0;
  docBubble.pin({
    right: beside ? `${Math.round((document.documentElement.clientWidth || window.innerWidth) - rect.left + 8)}px` : '16px',
    bottom: beside ? `${Math.round((document.documentElement.clientHeight || window.innerHeight) - rect.bottom)}px` : '16px',
  });
}

// ---------------------------------------------------------------- hover chip

function showChipFor(unit) {
  clearTimeout(chipHideTimer);
  chipHideTimer = null;
  chipTarget = unit;
  chipSelection = undefined;
  const rect = unit.getBoundingClientRect();
  chip.pin({
    left: Math.min(rect.right + 8, window.innerWidth - 34) + 'px',
    top: Math.max(8, rect.top) + 'px',
    'color-scheme': pageScheme(),
  });
  setShown(chip, true, 'inline-grid');
}

function hideChip() {
  clearTimeout(chipHideTimer);
  chipHideTimer = null;
  setShown(chip, false, 'inline-grid');
  chipTarget = null;
  chipSelection = undefined;
}

function scheduleChipHide() {
  if (chip.hidden || chipHideTimer) return;
  chipHideTimer = setTimeout(hideChip, 400);
}

// The chip at the end of a selection: for people who do not know the shortcut, and
// for browsers that keep Ctrl+J for themselves.
function showChipForSelection() {
  if (session || !panel.hidden || helperState !== 'ready' || pageOwnsFocus()) return;
  const range = liveRange();
  const target = range && targetFromRange(range);
  const selection = target && selectionIn(range, target);
  if (!selection) {
    if (chipSelection) hideChip();
    return;
  }
  const rects = typeof range.getClientRects === 'function' ? range.getClientRects() : [];
  const end = rects.length ? rects[rects.length - 1] : target.getBoundingClientRect();
  clearTimeout(chipHideTimer);
  chipHideTimer = null;
  chipTarget = target;
  chipSelection = selection;
  chip.pin({
    left: Math.min(end.right + 6, window.innerWidth - 34) + 'px',
    top: Math.max(8, end.top + end.height / 2 - 13) + 'px',
    'color-scheme': pageScheme(),
  });
  setShown(chip, true, 'inline-grid');
}

function setStatus(text, tone) {
  statusEl.textContent = text || '';
  if (tone === 'warn') statusEl.setAttribute('data-tone', 'warn');
  else statusEl.removeAttribute('data-tone');
  set(statusEl, 'color', tone === 'warn' ? TOKENS.ox : TOKENS.muted);
}

function showButtons(...names) {
  for (const [name, button] of Object.entries(buttons)) {
    setShown(button, names.includes(name), 'inline-flex');
  }
}

function showWarnings(warnings) {
  setShown(warningsEl, warnings.length > 0);
  warningsEl.textContent = warnings.map(w => '\u26a0 ' + w).join('\n');
}

function positionChrome() {
  if (!anchorEl || panel.hidden) return;
  if (!anchorEl.isConnected) { closePanel(); return; }
  if (anchorEl === document.body) {
    // document mode: no ring, panel pinned above the bubble
    setShown(ring, false);
    const bubble = docBubble.getBoundingClientRect();
    const width = panel.offsetWidth || 480;
    set(panel, 'left', Math.max(16, Math.min((bubble.right || window.innerWidth - 16) - width, window.innerWidth - width - 16)) + 'px');
    set(panel, 'top', Math.max(16, (bubble.top || window.innerHeight - 56) - (panel.offsetHeight || 120) - 12) + 'px');
    return;
  }
  const rect = anchorEl.getBoundingClientRect();
  setShown(ring, true);
  set(ring, 'left', rect.left - 5 + 'px');
  set(ring, 'top', rect.top - 5 + 'px');
  set(ring, 'width', rect.width + 6 + 'px');
  set(ring, 'height', rect.height + 6 + 'px');
  // Under the selection while it is still in the page, else under the element.
  const at = anchorRange && anchorRange.startContainer.isConnected && typeof anchorRange.getBoundingClientRect === 'function'
    ? anchorRange.getBoundingClientRect() : null;
  const place = at && (at.width || at.height) ? at : rect;
  const panelWidth = panel.offsetWidth || 480;
  const left = Math.max(16, Math.min(place.left, window.innerWidth - panelWidth - 16));
  let top = place.bottom + 10;
  const panelHeight = panel.offsetHeight || 120;
  if (top + panelHeight > window.innerHeight - 16) {
    top = Math.max(16, place.top - panelHeight - 10);
  }
  set(panel, 'left', left + 'px');
  set(panel, 'top', top + 'px');
}

function openPanel(el, quote) {
  const range = quote ? liveRange() : null; // read before focus moves into the panel
  const active = document.activeElement;
  returnFocus = active && active !== document.body && !panel.contains(active) ? active : null;
  anchorEl = el;
  anchorRange = range ? range.cloneRange() : null;
  hideChip();
  set(panel, 'color-scheme', pageScheme());
  set(ring, 'color-scheme', pageScheme());
  setShown(panel, true);
  pendingSelection = quote;
  const shown = quote ? (quote.text.trim().length > 400 ? quote.text.trim().slice(0, 400) + '\u2026' : quote.text.trim()) : '';
  setShown(quoteEl, !!quote);
  quoteEl.textContent = quote ? `\u201c${shown}\u201d` : '';
  panel.dataset.quote = shown;
  setStatus('');
  showWarnings([]);
  showButtons('send');
  highlight(anchorRange);
  applyHelperState();
  positionChrome();
  textarea.focus();
  refreshHelperState();
}

function closePanel() {
  if (session) { session.handle?.cancel(); revertSession(); }
  const back = returnFocus;
  const hadFocus = panel.contains(document.activeElement);
  anchorEl = null;
  anchorRange = null;
  returnFocus = null;
  pendingSelection = undefined;
  clearHighlight();
  setShown(panel, false);
  setShown(ring, false);
  textarea.value = '';
  if (hadFocus && back && back.isConnected) back.focus({ preventScroll: true });
}

function submit() {
  const comment = textarea.value.trim();
  if (!comment || !anchorEl || session || helperState !== 'ready') return;
  clearHighlight();
  sendRequest(anchorEl, comment, pendingSelection);
}

// ---------------------------------------------------------------- interactions

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

// Cmd+J on a Mac, Ctrl+J elsewhere. event.code covers keyboard layouts where the
// J key types another letter.
function isShortcut(event) {
  const modifier = IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!modifier || event.shiftKey || event.altKey || event.repeat || event.isComposing) return false;
  return event.code === 'KeyJ' || (event.key || '').toLowerCase() === 'j';
}

// A field the page owns keeps its own Ctrl+J, and so does the panel's own box.
function pageOwnsFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  if (panel && panel.contains(el)) return !panel.hidden;
  return el.matches('input,textarea,select');
}

function wireInteractions() {
  // Clicks: text units are contenteditable (caret) and figures keep their own
  // interactivity, so neither is intercepted. Only a click on bare section padding
  // opens the comment box; a click away from an open, empty panel closes it.
  document.addEventListener('click', (event) => {
    if (panel.contains(event.target) || chip.contains(event.target) || docBubble.contains(event.target)) return;
    if (session) return; // one edit at a time
    const section = event.target.closest?.('[data-edit-id]');
    const unit = section ? unitFrom(event.target) : null;
    if (section && unit === section) {
      if (section !== anchorEl || panel.hidden) openPanel(section, quoteFromSelection(section));
    } else if (!panel.hidden && !textarea.value.trim() && !(anchorEl && anchorEl.contains(event.target))) {
      closePanel();
    }
  });

  // Hover chip: follows the unit under the cursor while no panel is open.
  let lastMove = 0;
  document.addEventListener('mousemove', (event) => {
    const now = Date.now();
    if (now - lastMove < 80) return;
    lastMove = now;
    if (session || !panel.hidden) { scheduleChipHide(); return; }
    if (helperState !== 'ready' || chipSelection) return;
    if (chip.contains(event.target)) { clearTimeout(chipHideTimer); chipHideTimer = null; return; }
    const unit = unitFrom(event.target);
    if (unit) showChipFor(unit);
    else scheduleChipHide();
  });

  document.addEventListener('keydown', (event) => {
    if (isShortcut(event)) {
      if (!session && anchorEl && !anchorEl.isConnected) closePanel();
      if (session || pageOwnsFocus()) return;
      const range = liveRange();
      let target = range ? targetFromRange(range) : null;
      if (!target) {
        // Section pages: a caret inside a unit, or the unit under the hover chip.
        const selection = window.getSelection();
        let node = selection && selection.anchorNode;
        if (node && node.nodeType !== 1) node = node.parentElement;
        target = (node && unitFrom(node)) || chipTarget;
      }
      // Nothing to open: leave the key to the browser.
      if (!target) return;
      event.preventDefault();
      openPanel(target, quoteFromSelection(target));
      return;
    }
    if (event.key !== 'Escape' || panel.hidden) return;
    if (session?.state === 'requesting') {
      cancelStream();
    } else if (session?.state === 'deciding') {
      revertSession();
      setStatus('reverted');
      showButtons('send');
    } else {
      closePanel();
    }
  });

  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(showChipForSelection, 150);
  });
}

// ---------------------------------------------------------------- boot

async function init() {
  if (!isEditMode || panel) return;  // an owner/editor feature, built once
  helperState = await helperStateNow();
  if (!helperState) return;          // no ai-edit helper on this host: stay dormant
  buildChrome();
  wireInteractions();
}

onDomReady(() => { init().catch(() => {}); });

export const aiEdit = { init };
