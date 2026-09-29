// Bevel controls for UI ClayJS draws on somebody else's page. Every declaration
// goes on inline and !important (hostile-css.js), so the page's stylesheet cannot
// repaint them. Inline styles have no :hover or :active, so each button keeps its
// state in flags and rebuilds its whole inline style from them on every change:
// a property one state set can never survive into the next. Style a button only
// through `extra` and `labelExtra`; anything set on it afterwards is rebuilt away.
//
// all:initial resets color-scheme and direction too. Both are put back after every
// reset, so light-dark() follows the scheme the UI root sets and a page cannot
// flip the text direction.
import { style, make } from '../lib/hostile-css.js';
import { RULES, MEDIA, FONT_SANS, TOKENS } from './bevel.js';

export const RUNTIME_ONLY = 'no-save no-watch no-snapshot';

const RESET = ['all:initial', 'color-scheme:inherit', 'direction:ltr', 'unicode-bidi:isolate'];

const SIZE = {
  normal: [`font:500 14px/1.45 ${FONT_SANS}`, 'padding:4px 12px'],
  small: [`font:500 12.5px/1.45 ${FONT_SANS}`, 'padding:1px 8px'],
};

// Bevel composes :hover and :active in source order; so do these lists.
const VARIANT = {
  default: { rest: RULES.button, hover: RULES.buttonHover, active: RULES.buttonActive },
  primary: { rest: RULES.buttonPrimary, hover: [...RULES.buttonPrimaryHoverBase, ...RULES.buttonPrimaryHover], active: RULES.buttonPrimaryActive },
  quiet: { rest: [...RULES.button, ...RULES.buttonQuiet], hover: [...RULES.buttonHover, ...RULES.buttonQuietHover], active: [...RULES.buttonActive, ...RULES.buttonQuietActive] },
  danger: { rest: RULES.buttonDanger, hover: RULES.buttonDangerHover, active: RULES.buttonDangerActive },
};

const media = (query) => typeof matchMedia === 'function' && matchMedia(query).matches;

let keyboardModality = false;
const focusedButtons = new Set();
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', () => {
    keyboardModality = true;
    for (const refresh of focusedButtons) refresh();
  }, true);
  document.addEventListener('pointerdown', () => { keyboardModality = false; }, true);
}

function runtime(el) {
  el.setAttribute('clay', RUNTIME_ONLY);
  return el;
}

function restyle(el, rules) {
  el.style.cssText = '';
  style(el, rules);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SHAPES = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g']);

// Presentation attributes lose to any author rule, so the icon's own attributes are
// restated as inline !important declarations: the page cannot hide, resize or
// repaint it. A path's geometry is pinned through the `d` property as well.
function protectIcon(svg, size) {
  if (!svg || svg.namespaceURI !== SVG_NS) return;
  runtime(svg);
  style(svg, [
    ...RESET, 'display:block', `width:${size}px`, `height:${size}px`, 'overflow:visible',
    'visibility:visible', 'opacity:1', 'transform:none', 'pointer-events:none',
  ]);
  for (const el of svg.querySelectorAll('*')) {
    if (!SHAPES.has(el.localName)) continue;
    const attr = (name, fallback) => el.getAttribute(name) ?? fallback;
    const rules = [
      'visibility:visible', 'opacity:1', 'transform:none', 'display:inline',
      `fill:${attr('fill', svg.getAttribute('fill') ?? 'currentColor')}`,
      `stroke:${attr('stroke', svg.getAttribute('stroke') ?? 'none')}`,
    ];
    if (el.hasAttribute('stroke-width')) rules.push(`stroke-width:${el.getAttribute('stroke-width')}`);
    if (el.hasAttribute('stroke-linecap')) rules.push(`stroke-linecap:${el.getAttribute('stroke-linecap')}`);
    if (el.localName === 'path' && el.hasAttribute('d')) rules.push(`d:path("${el.getAttribute('d')}")`);
    style(el, rules);
  }
}

export function bevelButton(label, { variant = 'default', small = false, onClick = null, extra = [], labelExtra = [] } = {}) {
  const v = VARIANT[variant] || VARIANT.default;
  const size = small ? SIZE.small : SIZE.normal;
  const reducedMotion = media('(prefers-reduced-motion: reduce)');
  const forced = media('(forced-colors: active)');
  const flags = { hovered: false, pressed: false, focusVisible: false, disabled: false };

  const b = runtime(make('button', []));
  b.type = 'button';
  const span = runtime(make('span', []));
  span.textContent = label;
  b.append(span);

  function applyState() {
    const rules = [...RESET, 'box-sizing:border-box', ...v.rest, ...size];
    if (flags.disabled) {
      rules.push(...RULES.buttonDisabled);
    } else {
      if (flags.hovered) rules.push(...v.hover);
      if (flags.pressed) rules.push(...v.active);
    }
    if (flags.focusVisible) rules.push(...RULES.focus);
    if (forced) rules.push(...MEDIA.forcedColors);
    rules.push(...extra);
    restyle(b, rules);
    const labelRules = [...RESET, 'font:inherit', 'color:inherit', ...RULES.buttonLabel];
    if (flags.disabled) labelRules.push(...RULES.buttonDisabledLabel);
    else if (flags.pressed) labelRules.push(...(reducedMotion ? MEDIA.reducedMotion : RULES.buttonActiveLabel));
    labelRules.push(...labelExtra);
    restyle(span, labelRules);
  }

  function refreshFocus() {
    let visible;
    try { visible = b.matches(':focus-visible'); } catch { visible = false; }
    const next = visible || keyboardModality;
    if (next !== flags.focusVisible) { flags.focusVisible = next; applyState(); }
  }

  const on = (type, fn) => b.addEventListener(type, fn);
  on('pointerenter', () => { flags.hovered = true; applyState(); });
  on('pointerleave', () => { flags.hovered = false; flags.pressed = false; applyState(); });
  on('pointercancel', () => { flags.pressed = false; applyState(); });
  on('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (!flags.disabled) { flags.pressed = true; applyState(); }
  });
  on('pointerup', () => { flags.pressed = false; applyState(); });
  on('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !flags.disabled) { flags.pressed = true; applyState(); }
  });
  on('keyup', () => { if (flags.pressed) { flags.pressed = false; applyState(); } });
  on('focus', () => { focusedButtons.add(refreshFocus); flags.focusVisible = false; refreshFocus(); applyState(); });
  on('blur', () => { focusedButtons.delete(refreshFocus); flags.focusVisible = false; flags.pressed = false; applyState(); });
  on('click', (e) => {
    if (flags.pressed) { flags.pressed = false; applyState(); }
    if (flags.disabled) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (onClick) onClick(e);
  });

  b.setLabel = (text) => { span.textContent = text; };
  b.setDisabled = (disabled) => {
    flags.disabled = !!disabled;
    if (flags.disabled) b.setAttribute('aria-disabled', 'true');
    else b.removeAttribute('aria-disabled');
    applyState();
  };
  b.isDisabled = () => flags.disabled;

  applyState();
  return b;
}

export function bevelIconButton(svg, { label, onClick = null }) {
  const b = bevelButton('', {
    small: true,
    onClick,
    extra: ['width:26px', 'height:26px', 'padding:0', 'display:inline-grid', 'place-items:center'],
    labelExtra: ['display:inline-grid', 'width:12px', 'height:12px'],
  });
  b.firstChild.innerHTML = svg;
  protectIcon(b.firstChild.firstElementChild, 12);
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

export function bevelSurface(tag, rules = []) {
  return runtime(make(tag, [...RESET, 'box-sizing:border-box', ...RULES.surface, `font:14px/1.5 ${FONT_SANS}`, ...rules]));
}

export function bevelWell(rules = []) {
  return runtime(make('div', [...RESET, 'display:block', 'box-sizing:border-box', `font:14px/1.5 ${FONT_SANS}`, `color:${TOKENS.ink}`, ...RULES.recess, ...rules]));
}

export function bevelText(tag, rules = [], text) {
  const el = runtime(make(tag, [...RESET, 'font:inherit', `color:${TOKENS.ink}`, ...rules]));
  if (text != null) el.textContent = text;
  return el;
}

export { protectIcon };
