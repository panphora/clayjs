/**
 * ai-edit — comment-to-edit AI editing over clay.wire.
 *
 * Direct editing stays primary: text units carry editmode:contenteditable, so a
 * click places the caret and a figure keeps its own interactivity. This adds the
 * comment box on demand: a floating chip near the hovered unit, Cmd+K for the unit
 * holding the caret (the selection rides along as a quote), a click on bare section
 * padding, or the fixed bottom-right bubble for the whole document. Units resolve to
 * the nearest h1-h6/p/figure inside a [data-edit-id] section, falling back to the
 * section itself.
 *
 * The request leaves as a named helper request on the wire
 * (`clay.wire.send(payload, { helper: "ai-edit" })`) and comes back as the edited
 * element's own HTML. A named request defaults to `document: "none"`, so the host
 * writes nothing: this page morphs the result in and Keep saves it through
 * `clay.save()`, exactly as before.
 *
 * Dormant unless the host lists a ready `ai-edit` helper. On HTML Clay, or with the
 * desktop toggle off, `clay.wire.helpers()` never lists one and nothing is built at
 * all: the page is then just a page.
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
import { STRIP_FROM_SAVE } from "../lib/region-policy.js";
import { enableContentEditable } from "../core/admin-contenteditable.js";
import onDomReady from "../lib/dom-ready.js";
import wire from "./wire.js";
import { set } from "../lib/hostile-css.js";
import { bevelBox, bevelButton, bevelSurface, bevelText, bevelInput, pageScheme, setShown, RUNTIME_ONLY } from "../ui/bevel-controls.js";
import { TOKENS, FONT_SANS, FONT_MONO, SHADOW } from "../ui/bevel.js";

const HELPER = "ai-edit";
const UNIT_SELECTOR = "h1,h2,h3,h4,h5,h6,p,figure";
// The request ceiling, kept below the host's 1 MiB envelope so the refusal happens
// here, where the message can say what to do about it.
const MAX_PAYLOAD_BYTES = 900 * 1024;
const TOO_LARGE = "This section is too large for AI editing; select a smaller part.";

let requestCounter = 0;
let session = null; // one edit at a time
let panel, ring, textarea, quoteEl, statusEl, warningsEl, chip, docBubble;
let buttons = {};
let anchorEl = null;    // element the panel is currently anchored to
let chipTarget = null;  // unit the hover chip currently points at
let chipHideTimer = null;

// ---------------------------------------------------------------- transport

async function available() {
  const list = await wire.helpers();
  return list.some(h => h.name === HELPER && h.state === "ready");
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
  return (section ? section.getAttribute('data-edit-id') + ' \u203a ' : '') + el.tagName.toLowerCase();
}

function quoteFromSelection(scope) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return undefined;
  const text = selection.toString().trim();
  if (!text) return undefined;
  let node = selection.getRangeAt(0).commonAncestorContainer;
  if (node.nodeType !== 1) node = node.parentElement;
  if (scope && scope !== document.body && !scope.contains(node)) return undefined;
  return text.length > 400 ? text.slice(0, 400) + '\u2026' : text;
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
  const scripts = rewind
    ? { merge: false }
    : { mergeBase: s.snapshot, mergeTags: mergeTagRecognizers };
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
  if (quote) payload.quote = quote;
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
  if (!session.docMode) { // the real body legitimately contains scripts; skip in doc mode
    if (candidate.querySelector('script')) {
      warnings.push('reply contains <script> \u2014 review before keeping');
    }
    for (const el of [candidate, ...candidate.querySelectorAll('*')]) {
      if ([...el.attributes].some(a => a.name.toLowerCase().startsWith('on'))) {
        warnings.push('reply contains inline event handlers \u2014 review before keeping');
        break;
      }
    }
  }

  session.finalCandidate = candidate;
  sessionMorph(session, candidate); // authoritative morph from the full final HTML
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
  if (s.state === 'requesting' || s.state === 'deciding') {
    sessionMorph(s, s.snapshot, { rewind: true });
  }
  if (s.paused) resumeObservers();
  positionChrome();
}

async function keepSession() {
  const s = session;
  session = null;
  sessionMorph(s, s.snapshot, { rewind: true }); // rewind while observers are still paused
  if (s.paused) resumeObservers();    // boundary drain discards the rewind
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
  `;
  document.head.appendChild(style);

  const scheme = `color-scheme:${pageScheme()}`;

  ring = marked(bevelBox('div', [
    'box-sizing:content-box', 'position:fixed', 'z-index:99998', 'pointer-events:none',
    `border:2px solid ${TOKENS.brass}`, 'border-radius:0', scheme,
  ]), 'data-clay-ai-edit', 'ring');
  setShown(ring, false);

  panel = marked(bevelSurface('div', [
    'position:fixed', 'z-index:99999', 'width:min(30rem, calc(100vw - 2rem))',
    'padding:10px', `font:13px/1.5 ${FONT_SANS}`, scheme,
  ]), 'data-clay-ai-edit', 'panel');
  setShown(panel, false);

  const part = (el, name) => marked(el, 'data-clay-ai-edit-part', name);

  quoteEl = part(bevelText('div', [
    'display:block', `color:${TOKENS.muted}`, `border-left:2px solid ${TOKENS['line-2']}`,
    'padding-left:8px', 'margin-bottom:8px', 'white-space:nowrap', 'overflow:hidden',
    'text-overflow:ellipsis', `font:12.5px/1.5 ${FONT_MONO}`,
  ]), 'quote');
  setShown(quoteEl, false);

  textarea = part(bevelInput('textarea', {
    rules: ['min-height:3.2em', 'resize:vertical', 'padding:8px', `font:13px/1.5 ${FONT_SANS}`],
  }), 'input');
  textarea.rows = 2;
  textarea.placeholder = 'Describe the change\u2026 (@file.ext adds context, @fable / @claude picks the agent)';

  statusEl = part(bevelText('span', [
    'flex:1', 'min-width:0', `color:${TOKENS.muted}`, `font:12.5px/1.5 ${FONT_MONO}`,
  ]), 'status');

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

  panel.append(quoteEl, textarea, row, warningsEl);

  chip = marked(bevelButton('\ud83d\udcac', {
    small: true,
    extra: ['position:fixed', 'width:26px', 'height:26px', 'font-size:13px', ...FLOATING, scheme],
  }), 'data-clay-ai-edit', 'chip');
  chip.title = 'Comment on this (\u2318K)';
  setShown(chip, false, 'inline-grid');

  docBubble = marked(bevelButton('\ud83d\udcac', {
    extra: ['position:fixed', 'right:16px', 'bottom:16px', 'width:44px', 'height:44px', 'font-size:18px', ...FLOATING, scheme],
  }), 'data-clay-ai-edit', 'bubble');
  docBubble.title = 'Comment on the whole page';

  document.body.append(ring, panel, chip, docBubble);

  buttons.send.addEventListener('click', submit);
  buttons.stop.addEventListener('click', cancelStream);
  buttons.keep.addEventListener('click', keepSession);
  buttons.revert.addEventListener('click', () => { revertSession(); setStatus('reverted'); showButtons('send'); });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!buttons.send.hidden) submit();
    }
  });

  chip.addEventListener('click', () => {
    const target = chipTarget;
    hideChip();
    if (target && !session) openPanel(target, quoteFromSelection(target));
  });
  docBubble.addEventListener('click', () => {
    if (session) return;
    openPanel(document.body, quoteFromSelection(document.body));
  });

  window.addEventListener('scroll', () => { positionChrome(); hideChip(); }, { passive: true });
  window.addEventListener('resize', positionChrome, { passive: true });
}

// ---------------------------------------------------------------- hover chip

function showChipFor(unit) {
  clearTimeout(chipHideTimer);
  chipHideTimer = null;
  chipTarget = unit;
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
}

function scheduleChipHide() {
  if (chip.hidden || chipHideTimer) return;
  chipHideTimer = setTimeout(hideChip, 400);
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
    // document mode: no ring, panel pinned above the bottom-right bubble
    setShown(ring, false);
    set(panel, 'left', Math.max(16, window.innerWidth - (panel.offsetWidth || 480) - 16) + 'px');
    set(panel, 'top', Math.max(16, window.innerHeight - (panel.offsetHeight || 120) - 76) + 'px');
    return;
  }
  const rect = anchorEl.getBoundingClientRect();
  setShown(ring, true);
  set(ring, 'left', rect.left - 5 + 'px');
  set(ring, 'top', rect.top - 5 + 'px');
  set(ring, 'width', rect.width + 6 + 'px');
  set(ring, 'height', rect.height + 6 + 'px');
  const panelWidth = panel.offsetWidth || 480;
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - panelWidth - 16));
  let top = rect.bottom + 10;
  const panelHeight = panel.offsetHeight || 120;
  if (top + panelHeight > window.innerHeight - 16) {
    top = Math.max(16, rect.top - panelHeight - 10);
  }
  set(panel, 'left', left + 'px');
  set(panel, 'top', top + 'px');
}

function openPanel(el, quote) {
  anchorEl = el;
  hideChip();
  set(panel, 'color-scheme', pageScheme());
  set(ring, 'color-scheme', pageScheme());
  setShown(panel, true);
  setShown(quoteEl, !!quote);
  quoteEl.textContent = quote ? `\u201c${quote}\u201d` : '';
  panel.dataset.quote = quote || '';
  setStatus('');
  showWarnings([]);
  showButtons('send');
  positionChrome();
  textarea.focus();
}

function closePanel() {
  if (session) revertSession();
  anchorEl = null;
  setShown(panel, false);
  setShown(ring, false);
  textarea.value = '';
}

function submit() {
  const comment = textarea.value.trim();
  if (!comment || !anchorEl || session) return;
  sendRequest(anchorEl, comment, panel.dataset.quote || undefined);
}

// ---------------------------------------------------------------- interactions

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
    if (chip.contains(event.target)) { clearTimeout(chipHideTimer); chipHideTimer = null; return; }
    const unit = unitFrom(event.target);
    if (unit) showChipFor(unit);
    else scheduleChipHide();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
      if (session) return;
      event.preventDefault();
      const selection = window.getSelection();
      let node = selection && selection.anchorNode;
      if (node && node.nodeType !== 1) node = node.parentElement;
      const target = (node && unitFrom(node)) || chipTarget;
      if (target) openPanel(target, quoteFromSelection(target));
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
}

// ---------------------------------------------------------------- boot

async function init() {
  if (!isEditMode) return;           // an owner/editor feature, nothing else
  if (!(await available())) return;  // no ai-edit helper (e.g. HTML Clay, or the toggle off): stay dormant
  buildChrome();
  wireInteractions();
}

onDomReady(() => { init().catch(() => {}); });

export const aiEdit = { init };
