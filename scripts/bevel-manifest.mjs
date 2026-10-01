export const FONT_SANS = 'system-ui,-apple-system,"Segoe UI",sans-serif';
export const FONT_MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
export const FONT_SERIF = 'Georgia,"Times New Roman",serif';
export const SHADOW = '0 1px 2px rgba(0,0,0,.12),0 10px 28px -12px rgba(0,0,0,.35)';

// Every light-dark() colour token in the base :root rule except --bevel-syn-*.
export const TOKEN_NAMES = [
  'ground', 'surface', 'sunk', 'ink', 'ink-2', 'muted', 'faint', 'line', 'line-2',
  'brass', 'brass-soft', 'ox', 'ox-soft', 'teal', 'teal-soft',
  'face', 'edge-hi', 'edge-lo', 'face-in', 'edge-in', 'edge-in-hi', 'knob', 'knob-hi',
  'ox-face', 'ox-edge-hi', 'ox-edge-lo', 'ox-ink',
];

// recipe name -> exact selector (as the parser splits selector lists), inside @layer components
// unless noted. `variantOf` re-renders .bevel-button with the variant's --bevel-* overrides.
export const RECIPES = {
  button: { selector: '.bevel-button' },
  buttonLabel: { selector: '.bevel-button__label' },
  buttonHover: { selector: '.bevel-button:hover' },
  buttonActive: { selector: '.bevel-button:active:where(:not(:disabled, [aria-disabled="true"]))' },
  buttonActiveLabel: { selector: '.bevel-button:active:where(:not(:disabled, [aria-disabled="true"])) .bevel-button__label' },
  buttonDisabled: { selector: '.bevel-button[aria-disabled="true"]' },
  buttonDisabledLabel: { selector: '.bevel-button:disabled .bevel-button__label' },
  buttonSmall: { selector: '.bevel-button--small' },
  buttonPrimary: { variantOf: '.bevel-button--primary' },
  buttonPrimaryHover: { selector: '.bevel-button--primary:hover', withOverridesOf: '.bevel-button--primary' },
  buttonPrimaryHoverBase: { selector: '.bevel-button:hover', withOverridesOf: '.bevel-button--primary' },
  buttonPrimaryActive: { selector: '.bevel-button:active:where(:not(:disabled, [aria-disabled="true"]))', withOverridesOf: '.bevel-button--primary' },
  buttonDanger: { variantOf: '.bevel-button--danger' },
  buttonDangerHover: { selector: '.bevel-button:hover', withOverridesOf: '.bevel-button--danger' },
  buttonDangerActive: { selector: '.bevel-button:active:where(:not(:disabled, [aria-disabled="true"]))', withOverridesOf: '.bevel-button--danger' },
  buttonQuiet: { selector: '.bevel-button--quiet' },
  buttonQuietHover: { selector: '.bevel-button--quiet:hover' },
  buttonQuietActive: { selector: '.bevel-button--quiet:active' },
  focus: { selector: ':focus-visible', layer: 'base' },
  recess: { selector: '.bevel-toolbar__icon[aria-pressed="true"]', keep: ['border-color', 'background'], prepend: ['border:2px solid'] },
  input: { selector: '.bevel-input' },
  inputHover: { selector: '.bevel-input:hover:not(:disabled)' },
  inputFocus: { selector: '.bevel-input:focus-visible' },
  toast: { selector: '.bevel-toast', keep: ['gap', 'padding'] },
  toastTitle: { selector: '.bevel-toast__title', keep: ['font'] },
  toastClose: { selector: '.bevel-toast__close', keep: ['margin', 'inline-size', 'block-size', 'padding', 'border', 'background', 'color'] },
  dialogPanel: { selector: '.bevel-modal', keep: ['border-radius', 'box-shadow'], cascade: true },
  dialogHeader: { selector: '.bevel-modal__header', keep: ['border-bottom'] },
  dialogHeading: { selector: '.bevel-modal__heading', keep: ['margin', 'font'] },
  dialogFooter: { selector: '.bevel-modal__footer', keep: ['gap', 'padding', 'border-top'], cascade: true },
  dialogClose: { selector: '.bevel-overlay__close', keep: ['inline-size', 'border-left', 'background', 'color'] },
  dialogCloseHover: { selector: '.bevel-overlay__close:hover', keep: ['background'] },
};

// Composed from tokens, not copied from a selector.
export const SURFACE = (t) => [`background:${t.surface}`, `color:${t.ink}`, `border:1px solid ${t['line-2']}`, `box-shadow:${SHADOW}`];

// Top-level media overrides to copy for the selectors above.
export const MEDIA = {
  reducedMotion: { media: '(prefers-reduced-motion: reduce)', selector: '.bevel-button:active .bevel-button__label' },
  forcedColors: { media: '(forced-colors: active)', selector: '.bevel-button' },
};
