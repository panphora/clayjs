// What scripts/build-vendor-skins.mjs copies into each vendor skin, and nothing else.
//
// A vendor draws its own UI with its own classes and its own stylesheet, and ClayJS
// never edits a vendor. A skin raises that UI above the host page instead: the
// vendor's own chrome rules and Bevel's integration rules, re-emitted inside one early
// cascade layer with every declaration !important, and the vendor's custom properties
// pinned to Bevel's literal values. Every selector in a source is either listed here
// or refused, so a vendor or Bevel release that adds a rule fails the build until
// somebody decides what it is.
//
// Source text is read from what ClayJS actually ships: the CSS template literal inside
// the vendored bundle (found by `marker`, the text the literal opens with), plus the
// Bevel integration stylesheet from the sibling ../bevel checkout.

export const LAYER = 'clay-skin'

const RICHCLAY_ROOTS = ['.richclay-toolbar', '.richclay-float', '.richclay-dialog']
const RICHCLAY_SCOPE = `:is(${RICHCLAY_ROOTS.join(', ')})`

const BEVEL_ICON = 'Bevel runtime icon face, drawn only by bevel/integrations/richclay.js'
const BEVEL_OWN = 'a Bevel component, not vendor chrome'
const PROSE = 'edited prose is never restyled'
const SERIF = 'Bevel serif is a webfont; ClayJS UI uses system stacks only'

export const SKINS = {
  quickcrop: {
    vendor: { file: 'src/vendor/quickcrop.vendor.js', marker: ':root{--qc-surface:' },
    integration: 'integrations/quickcrop.css',
    prefix: '--qc-',
    roots: ['.qc-stage', '.qc-backdrop'],
    // The integration maps five tokens; these are the rest. Crop dimming and the crop
    // lines sit on top of a photo, so they keep quickcrop's own values.
    pins: {
      '--qc-surface-hover': 'var(--bevel-sunk)',
      '--qc-text-hover': 'color-mix(in srgb, var(--bevel-ink), var(--bevel-ground) 12%)',
      '--qc-on-dark': 'var(--bevel-ground)',
      '--qc-overlay': 'color-mix(in srgb, var(--bevel-ground) 70%, transparent)',
      '--qc-dim': 'rgba(0,0,0,.55)',
      '--qc-crop-line': '#fff',
    },
    tokenBlock: { selector: '.bevel-quickcrop', keep: [] },
    rescope: [['.bevel-quickcrop ', '']],
    media: [],
    armor: [
      '.qc-backdrop', '.qc-modal', '.qc-bar', '.qc-btn', '.qc-btn:hover', '.qc-btn-primary',
      '.qc-btn-primary:hover', '.qc-stage', '.qc-stage img', '.qc-dim', '.qc-box', '.qc-handle',
      '.qc-nw', '.qc-ne', '.qc-sw', '.qc-se', '.qc-mount',
    ],
    integrationKeep: ['.bevel-quickcrop .qc-stage', '.bevel-quickcrop .qc-stage img'],
    skip: {
      '.qc-css-probe': 'stylesheet-detection probe: armouring it would tell quickcrop its CSS is linked',
      '.bevel-quickcrop__body': BEVEL_OWN,
      '.bevel-quickcrop__presets': BEVEL_OWN,
      '.bevel-quickcrop__help': BEVEL_OWN,
      '.bevel-quickcrop__badge': BEVEL_OWN,
      '.bevel-quickcrop-context': BEVEL_OWN,
      '.bevel-quickcrop-context .bevel-dropzone': BEVEL_OWN,
      '.bevel-quickcrop-context .bevel-dropzone__target': BEVEL_OWN,
    },
    skipMedia: { '(max-width:520px)': 'sizes the Bevel modal, which ClayJS draws inline itself' },
    keyframes: ['qc-fade'],
    prose: [],
    // Properties quickcrop writes as inline styles. A skin declaring one of them
    // !important on the same element would freeze it, so the generator drops them.
    inline: [
      { subject: '.qc-box', props: ['left', 'top', 'width', 'height'] },
      { subject: 'img', within: '.qc-stage', props: ['width', 'height'] },
      { subject: '.qc-dim', props: ['clip-path'] },
      { subject: '.qc-css-probe', props: ['display'] },
    ],
    inlineOutOfScope: {},
  },

  richclay: {
    vendor: { file: 'src/vendor/richclay.vendor.js', marker: ':root {\n  --richclay-surface:' },
    integration: 'integrations/richclay.css',
    prefix: '--richclay-',
    roots: RICHCLAY_ROOTS,
    pins: {},
    tokenBlock: { selector: '[data-bevel-richclay-chrome]', keep: ['font-family'] },
    rescope: [
      [':is(.bevel-richtext, [data-bevel-richclay-chrome])', RICHCLAY_SCOPE],
      ['[data-bevel-richclay-chrome]', RICHCLAY_SCOPE],
    ],
    media: ['(forced-colors: active)', '(max-width: 540px)'],
    armor: [
      '.richclay-toolbar', '.richclay-toolbar:has(+ .richclay-editor)',
      '.richclay-button', '.richclay-button:hover', '.richclay-button[aria-expanded="true"]',
      '.richclay-menu-item:hover', '.richclay-button.is-active', '.richclay-button[aria-pressed="true"]',
      '.richclay-menu-item.is-active', '.richclay-button:focus-visible', '.richclay-menu-item:focus-visible',
      '.richclay-input:focus-visible', '.richclay-primary:focus-visible', '.richclay-secondary:focus-visible',
      '.richclay-button:disabled', '.richclay-cut', '.richclay-button:hover .richclay-cut',
      '.richclay-button[aria-expanded="true"] .richclay-cut', '.richclay-separator', '.richclay-menu-wrap',
      '.richclay-menu', '.richclay-menu[hidden]', '.richclay-menu-item', '.richclay-float',
      '.richclay-float .richclay-toolbar', '.richclay-float .richclay-dialog',
      '.richclay-float-rail .richclay-toolbar', '.richclay-float-rail .richclay-toolbar svg',
      '.richclay-float-rail .richclay-separator', '.richclay-float-rail .richclay-menu',
      '.richclay-dialog', '.richclay-dialog-title', '.richclay-field', '.richclay-field span',
      '.richclay-input', '.richclay-dialog-actions', '.richclay-primary', '.richclay-secondary',
      '.richclay-sr-only',
    ],
    integrationKeep: [
      ':where(.richclay-float, .richclay-dialog)[data-bevel-richclay-chrome]',
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) .richclay-toolbar',
      '.richclay-toolbar[data-bevel-richclay-chrome]',
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) .richclay-button',
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) .richclay-button:is([aria-pressed="true"], [aria-expanded="true"])',
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) .richclay-button[aria-pressed="true"] > svg',
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) .richclay-button:disabled',
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) .richclay-separator',
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) .richclay-menu',
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) .richclay-menu-item',
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) .richclay-menu-item[aria-checked="true"]',
      '.richclay-dialog[data-bevel-richclay-chrome]',
      '.richclay-dialog[data-bevel-richclay-chrome]::before',
      '[data-bevel-richclay-chrome] .richclay-dialog-title',
      '[data-bevel-richclay-chrome] .richclay-field',
      '[data-bevel-richclay-chrome] .richclay-field > span',
      '[data-bevel-richclay-chrome] .richclay-input',
      '[data-bevel-richclay-chrome] .richclay-dialog-actions',
      '[data-bevel-richclay-chrome] :is(.richclay-primary, .richclay-secondary)',
      '[data-bevel-richclay-chrome] .richclay-primary',
      '.richclay-float[data-bevel-richclay-chrome]',
      '.richclay-float[data-bevel-richclay-chrome] > .richclay-toolbar',
      '[data-bevel-richclay-chrome] [data-richclay-control="blockMenu"]',
    ],
    skip: {
      '.richclay-toolbar + .richclay-editor': PROSE,
      '.richclay-toolbar + .richclay-editor:focus-visible': PROSE,
      '.richclay-editor:focus-visible': PROSE,
      '.richclay-editor': PROSE,
      '.richclay-editor.richclay-empty::before': PROSE,
      '.richclay-editor p': PROSE, '.richclay-editor h1': PROSE, '.richclay-editor h2': PROSE,
      '.richclay-editor h3': PROSE, '.richclay-editor h4': PROSE, '.richclay-editor h5': PROSE,
      '.richclay-editor h6': PROSE, '.richclay-editor blockquote': PROSE, '.richclay-editor pre': PROSE,
      '.richclay-editor ul': PROSE, '.richclay-editor ol': PROSE, '.richclay-editor > :last-child': PROSE,
      '.richclay-inline': PROSE, '.richclay-inline:hover': PROSE, '.richclay-inline.richclay-focused': PROSE,
      '.richclay-inline:focus-visible': PROSE, '.richclay-inline.richclay-empty': PROSE,
      '.richclay-inline.richclay-empty::before': PROSE, '.richclay-inline pre': PROSE,
      '.bevel-richtext': BEVEL_OWN,
      '.bevel-inline-edit[data-bevel-edit-kind="rich"]': BEVEL_OWN,
      '.bevel-inline-edit--title .bevel-inline-edit__input': BEVEL_OWN,
      '.bevel-richtext :where(.richclay-toolbar)': BEVEL_OWN,
      '.bevel-richtext :where([contenteditable="true"]):focus': PROSE,
      '.bevel-richtext > [data-bevel-richtext]': PROSE,
      '.bevel-richtext > .richclay-toolbar + [data-bevel-richtext]': PROSE,
      '.bevel-richtext > [data-bevel-richtext] h2': PROSE,
      '.bevel-richtext > [data-bevel-richtext] p': PROSE,
      '.bevel-richtext > [data-bevel-richtext] :is(strong, b)': PROSE,
      '.bevel-richtext > [data-bevel-richtext] blockquote': PROSE,
      '.bevel-richtext > [data-bevel-richtext] a': PROSE,
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) [data-richclay-menu-item="blockMenu"][data-richclay-option-index="1"]': SERIF,
      ':is(.bevel-richtext, [data-bevel-richclay-chrome]) [data-richclay-menu-item="blockMenu"][data-richclay-option-index="2"]': SERIF,
      '[data-bevel-richclay-icon]': BEVEL_ICON,
      '[data-bevel-richclay-chrome] [data-richclay-control="blockMenu"] [data-bevel-richclay-icon]': BEVEL_ICON,
      '[data-bevel-richclay-chrome] [aria-pressed="true"] > [data-bevel-richclay-icon]': BEVEL_ICON,
    },
    skipMedia: { '(prefers-color-scheme: dark)': 'dark defaults for the vendor tokens, which the pins replace' },
    keyframes: [],
    prose: ['.richclay-editor', '.richclay-inline'],
    inline: [
      { subject: '.richclay-float', props: ['display', 'visibility', 'transform'] },
    ],
    // Inline writes that land outside every skin selector.
    inlineOutOfScope: {
      'font-family': 'Squire font spans inside edited prose',
      'font-size': 'Squire size spans inside edited prose',
      color: 'Squire colour spans inside edited prose',
      'text-align': 'block alignment inside edited prose',
      top: 'Squire image resize container, no richclay class',
      left: 'Squire image resize container, no richclay class',
      width: 'Squire image resize container, no richclay class',
      height: 'Squire image resize container, no richclay class',
      cursor: 'document.body during an image resize',
    },
  },

  cms: {
    vendor: { file: 'src/vendor/hypercms.vendor.js', marker: '/* GENERATED by scripts/build-theme.js from mirk-interface/mirk.css' },
    integration: null,
    prefix: '--mirk-',
    roots: ['.hcms-shell'],
    // A shell with a data-theme is the author's (or the CMS's own full-volume theme):
    // the pins stand back there, so the documented escape hatch still works.
    themeHatch: true,
    // Token pins only. The CMS theme lives in @layer base/components on purpose, so
    // a page's utilities win, and documents a [data-theme] escape hatch; armouring
    // its 85 KB would duplicate it and close that hatch. Each value is the nearest
    // Bevel token by role.
    pins: {
      '--mirk-canvas': 'var(--bevel-ground)',
      '--mirk-bg': 'var(--bevel-surface)',
      '--mirk-fg': 'var(--bevel-ink)',
      '--mirk-accent': 'var(--bevel-sunk)',
      '--mirk-destructive': 'var(--bevel-ox)',
      '--mirk-focus-color': 'var(--bevel-brass)',
      '--mirk-bevel-bg': 'var(--bevel-face)',
      '--mirk-bevel-fg': 'var(--bevel-ink)',
      '--mirk-bevel-tl': 'var(--bevel-edge-hi)',
      '--mirk-bevel-br': 'var(--bevel-edge-lo)',
      '--mirk-bevel-hover-bg': 'color-mix(in srgb, var(--bevel-face), var(--bevel-edge-hi) 45%)',
      '--mirk-pill-inner-top': 'var(--bevel-edge-hi)',
      '--mirk-input-border': 'var(--bevel-line-2)',
      '--mirk-placeholder-color': 'var(--bevel-faint)',
      '--mirk-ctrl-bg': 'var(--bevel-muted)',
      '--mirk-toggle-bg': 'var(--bevel-knob)',
      '--mirk-toggle-hi': 'var(--bevel-knob-hi)',
      '--mirk-toggle-lo': 'var(--bevel-edge-lo)',
      '--mirk-mark-fg': 'var(--bevel-ink)',
      '--mirk-sortable-dot': 'var(--bevel-line-2)',
      '--mirk-sortable-shadow': 'var(--bevel-edge-lo)',
      '--mirk-sortable-label': 'var(--bevel-muted)',
      '--mirk-sortable-placeholder': 'var(--bevel-faint)',
      '--mirk-slider-fill': 'var(--bevel-brass-soft)',
      '--mirk-slider-nub-bg': 'var(--bevel-knob)',
      '--mirk-slider-nub-hi': 'var(--bevel-knob-hi)',
      '--mirk-slider-nub-lo': 'var(--bevel-edge-lo)',
      '--mirk-chip-surface': 'var(--bevel-surface)',
      '--mirk-chip-edge': 'var(--bevel-line-2)',
      '--mirk-chip-primary-bg': 'var(--bevel-ink)',
      '--mirk-chip-primary-fg': 'var(--bevel-ground)',
      '--mirk-chip-alert': 'var(--bevel-ox)',
      '--mirk-radius': '0px',
      '--mirk-focus-offset': '2px',
    },
    // Set per element at runtime (a slider's fill); pinning it would freeze every slider.
    runtime: ['--mirk-value'],
    // Descendant rules that re-declare a pinned token. A pin on every descendant would
    // flatten them, so each is re-emitted above the pins.
    local: ['.hcms-shell .mirk-chip__actions .mirk-chip__action--primary'],
    // The CMS names its webfont on the shell alone (the toggle carries .hcms-shell
    // too) and every descendant inherits it; the skin puts the Bevel system mono
    // stack there instead, which keeps the monospace metrics the CMS is laid out in.
    font: 'mono',
    inline: [],
    inlineOutOfScope: {},
  },
}
