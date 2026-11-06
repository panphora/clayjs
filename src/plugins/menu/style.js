// The menu's look: Bevel tokens scoped to the menu family, solid surfaces, one soft
// shadow, light or dark by the scheme ui/page-colour.js reads from the page behind it.
import { SHELL_A, SHELL_B, SHELL_C, SHELL_FLOATING, MENU_SKIN, MENU_TOUCH } from "./shell-style.js";
export { MENU_SKIN, MENU_TOUCH } from "./shell-style.js";

// The surface and muted ink below, per scheme, for ui/page-colour.js's tint.
export const MENU_SURFACE = { light: [0xFF, 0xFC, 0xF6], dark: [0x1A, 0x1D, 0x2C], mutedLight: [0x6B, 0x59, 0x42], mutedDark: [0xA3, 0xA9, 0xC2] };

// The parts of the look a page may replace, through <style clay-menu-skin="1">. Everything
// else stays: layout, hidden, focus rings, touch targets and reduced motion.
const OWNER_1 = `.clay-menu-edit { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 28px; margin: 0; padding: 0 8px 0 5px; border: 0; background: none; font: 500 13px/1 var(--bevel-font-sans); color: var(--bevel-ink); cursor: pointer; }
.clay-menu-edit::before { content: ""; position: absolute; inset: -8px 0; }
.clay-menu-track { position: relative; display: block; box-sizing: border-box; width: 36px; height: 20px; border: 1px solid var(--bevel-line-2); background: var(--bevel-sunk); transition: background-color .14s, border-color .14s; }
.clay-menu-thumb { position: absolute; top: 2px; left: 2px; box-sizing: border-box; width: 14px; height: 14px; border: 2px solid; border-color: var(--bevel-knob-hi) var(--bevel-edge-lo) var(--bevel-edge-lo) var(--bevel-knob-hi); background: var(--bevel-knob); transition: translate .15s cubic-bezier(.4, 0, .2, 1); }
:is(.clay-menu-edit, .clay-menu-toggle):hover .clay-menu-track { border-color: var(--bevel-faint); }
:is(.clay-menu-edit, .clay-menu-toggle)[aria-checked="true"] .clay-menu-track { background: #256056; border-color: light-dark(#256056, #3C7E72); }
:is(.clay-menu-edit, .clay-menu-toggle)[aria-checked="true"] .clay-menu-thumb { translate: 16px 0; background: light-dark(var(--bevel-knob), #8EDCC5); border-color: light-dark(var(--bevel-knob-hi), #C2F0E2) light-dark(var(--bevel-edge-lo), #4F9C86) light-dark(var(--bevel-edge-lo), #4F9C86) light-dark(var(--bevel-knob-hi), #C2F0E2); }
.clay-menu-edit[aria-busy="true"] { cursor: progress; color: var(--bevel-muted); }
.clay-menu-edit[aria-busy="true"] .clay-menu-track { background: var(--bevel-line); border-color: var(--bevel-line-2); }
.clay-menu-edit[aria-busy="true"] .clay-menu-thumb { translate: 8px 0; opacity: .7; }
.clay-menu-label { white-space: nowrap; }

.clay-menu-divider { width: 1px; height: 18px; margin: 0 2px; background: var(--bevel-line-2); }

`;

const OWNER_2 = `/* The roster, beside the capsule, only on a page that opts in. Flat, like the capsule. */
.clay-roster { box-sizing: border-box; display: inline-flex; align-items: center; gap: 8px; height: 34px; margin: 0; padding: 0 10px 0 5px; border: 1px solid var(--bevel-line-3); background: var(--bevel-surface); box-shadow: var(--clay-shadow); font: 400 12px/1 var(--bevel-font-mono); color: var(--bevel-muted); cursor: pointer; }
.clay-roster:hover, .clay-roster[aria-expanded="true"] { background: var(--bevel-sunk); }
.clay-roster-faces { display: inline-flex; }
.clay-variants { box-sizing: border-box; display: inline-flex; align-items: center; gap: 2px; height: 34px; margin: 0; padding: 0 4px; border: 1px solid var(--bevel-line-3); background: var(--bevel-surface); box-shadow: var(--clay-shadow); font: 400 12px/1 var(--bevel-font-mono); color: var(--bevel-muted); user-select: none; -webkit-user-select: none; }
.clay-variants-step { display: inline-grid; place-items: center; width: 22px; height: 28px; margin: 0; padding: 0; border: 0; background: none; color: var(--bevel-faint); cursor: pointer; }
.clay-variants-step:hover { color: var(--bevel-ink-2); }
.clay-variants-step svg { display: block; width: 6px; height: 10px; fill: currentColor; }
.clay-variants-step:focus-visible { outline: 2px solid var(--bevel-brass); outline-offset: 2px; }
.clay-variants-name { min-width: 72px; text-align: center; color: var(--bevel-ink-2); white-space: nowrap; }
.clay-variants-name small { color: var(--bevel-faint); font-size: 11px; }
.clay-variants .clay-menu-btn { margin-left: 4px; }
.clay-roster-faces .clay-avatar + .clay-avatar { margin-left: -2px; box-shadow: -2px 0 0 var(--bevel-surface); }
.clay-avatar { display: inline-grid; place-items: center; flex: none; width: 22px; height: 22px; font: 500 10px/1 var(--bevel-font-mono); letter-spacing: .02em; border: 1px solid var(--bevel-ink); background: var(--bevel-ink); color: var(--bevel-ground); }
.clay-avatar[data-tone="brass"] { background: var(--bevel-brass-soft); color: var(--bevel-brass); border-color: color-mix(in srgb, var(--bevel-brass) 35%, var(--bevel-brass-soft)); }
.clay-avatar[data-tone="teal"] { background: var(--bevel-teal-soft); color: var(--bevel-teal); border-color: color-mix(in srgb, var(--bevel-teal) 35%, var(--bevel-teal-soft)); }

`;

const OWNER_3 = `/* The people panel: no lines between people, one line between sections. */
.clay-people { width: 300px; max-width: calc(100vw - 24px); padding: 0; }
.clay-people-head { display: flex; align-items: center; gap: 10px; padding: 10px 8px 10px 14px; border-bottom: 1px solid var(--bevel-line); }
.clay-people-title { flex: 1; margin: 0; font: 500 16px/1.2 var(--bevel-font-serif); }
.clay-people-sum { font: 400 11px/1 var(--bevel-font-mono); color: var(--bevel-muted); white-space: nowrap; }
.clay-people-close { display: inline-grid; place-items: center; width: 26px; height: 26px; margin: 0; padding: 0; border: 0; background: none; color: var(--bevel-muted); cursor: pointer; }
.clay-people-close:hover { color: var(--bevel-ink); background: var(--bevel-sunk); }
.clay-people-close svg { width: 12px; height: 12px; fill: currentColor; }
.clay-people-list { list-style: none; margin: 0; padding: 8px 14px; }
.clay-people-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.clay-people-row .clay-avatar { width: 28px; height: 28px; font-size: 11px; }
.clay-people-who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.clay-people-who strong { font-size: 13px; font-weight: 500; line-height: 1.25; }
.clay-people-who strong span { font: 400 11px/1 var(--bevel-font-mono); color: var(--bevel-muted); margin-left: 4px; }
.clay-people-who > span { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.3; color: var(--bevel-muted); }
.clay-people-live { width: 6px; height: 6px; border-radius: 50%; background: var(--bevel-teal); }
.clay-people-anon { margin: 0; padding: 10px 14px; border-top: 1px solid var(--bevel-line); font-size: 12px; line-height: 1.4; color: var(--bevel-muted); }
.clay-people-me { padding: 10px 14px 12px; border-top: 1px solid var(--bevel-line); }
.clay-people-me-label { display: block; margin-bottom: 6px; font-size: 12px; color: var(--bevel-muted); }
.clay-people-me-row { display: flex; align-items: center; gap: 8px; min-height: 30px; }
.clay-people-me-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; }
.clay-people-input { flex: 1; min-width: 0; box-sizing: border-box; height: 30px; padding: 0 8px; border: 1px solid var(--bevel-line-2); background: var(--bevel-ground); color: var(--bevel-ink); font: 400 13px/1.4 var(--bevel-font-sans); }
.clay-people-input:focus-visible { outline: 2px solid var(--bevel-brass); outline-offset: 1px; border-color: var(--bevel-brass); }

/* Bevel buttons, at the sizes this UI uses. */
.clay-menu-btn { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; height: 30px; margin: 0; padding: 0 12px; border: 2px solid; border-color: var(--bevel-edge-hi) var(--bevel-edge-lo) var(--bevel-edge-lo) var(--bevel-edge-hi); background: var(--bevel-face); color: var(--bevel-ink); font: 500 13px/1 var(--bevel-font-sans); white-space: nowrap; cursor: pointer; }
.clay-menu-btn:hover { background: color-mix(in srgb, var(--bevel-face), var(--bevel-edge-hi) 45%); }
.clay-menu-btn:active { border-color: var(--bevel-edge-lo) var(--bevel-edge-hi) var(--bevel-edge-hi) var(--bevel-edge-lo); }
.clay-menu-btn:focus-visible { outline: 2px solid var(--bevel-brass); outline-offset: 2px; }
.clay-menu-btn-small { height: 26px; padding: 0 9px; font-size: 12px; }
.clay-menu-btn-primary { --bevel-face: var(--bevel-ink); --bevel-edge-hi: color-mix(in srgb, var(--bevel-ink), light-dark(#FFFCF6, #FFFFFF) 22%); --bevel-edge-lo: color-mix(in srgb, var(--bevel-ink), light-dark(#0B0C13, #6A7090) 34%); color: var(--bevel-ground); }
.clay-menu-btn-primary:hover { background: color-mix(in srgb, var(--bevel-ink), var(--bevel-ground) 12%); }
`;

export const MENU_BASE = SHELL_A + OWNER_1 + SHELL_B + OWNER_2 + SHELL_C + OWNER_3;

export const MENU_FLOATING = SHELL_FLOATING + `.clay-menu-dock[data-dragging] .clay-menu { border-color: var(--bevel-brass); cursor: grabbing; }
.clay-menu-grip { position: relative; display: inline-grid; place-items: center; width: 18px; height: 28px; margin: 0; padding: 0; border: 0; background: none; color: var(--bevel-faint); cursor: grab; touch-action: none; }
.clay-menu-grip::before { content: ""; position: absolute; inset: -8px -2px -8px -10px; }
.clay-menu-grip:hover { color: var(--bevel-ink-2); }
.clay-menu-grip svg { display: block; width: 6px; height: 12px; fill: currentColor; }

/* Drop spots while dragging. */
.clay-menu-spots { position: fixed; inset: 0; z-index: 2147481999; pointer-events: none; }
.clay-menu-spot { position: absolute; width: 132px; height: 34px; border: 1px dashed var(--bevel-line-3); background: var(--bevel-sunk); }
.clay-menu-spot[data-to^="top"] { top: 12px; }
.clay-menu-spot[data-to^="bottom"] { bottom: 12px; }
.clay-menu-spot[data-to$="left"] { left: 12px; }
.clay-menu-spot[data-to$="right"] { right: 12px; }
.clay-menu-spot[data-near] { border: 2px solid var(--bevel-brass); background: var(--bevel-brass-soft); }
`;

export default MENU_BASE + MENU_FLOATING + MENU_SKIN + MENU_TOUCH;
