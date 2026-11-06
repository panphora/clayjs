export const MENU_SAFETY = `@layer clay-menu-safety {
  .clay-menu-dock [hidden], .clay-menu-spots[hidden], .clay-menu-dock[hidden] { display: none !important; }
  .clay-menu :focus-visible:not(.clay-menu-edit) { outline: 2px solid var(--bevel-brass) !important; outline-offset: -2px !important; }
  @media (pointer: coarse), (max-width: 680px) {
    .clay-menu-goo, .clay-menu-list [part~="dismiss"], .clay-menu-list [part~="step"], .clay-menu-list [role^="menuitem"] { min-width: 44px !important; min-height: 44px !important; }
  }
  @media (prefers-reduced-motion: reduce) {
    .clay-menu-dock *, .clay-menu-dock *::before, .clay-menu-dock *::after { transition: none !important; animation: none !important; }
  }
  @media (forced-colors: active) {
    .clay-menu-list { border: 1px solid CanvasText !important; }
    .clay-menu :focus-visible:not(.clay-menu-edit) { outline-color: Highlight !important; }
  }
}
`;

export const SHELL_A = `.clay-menu-dock, .clay-menu-spots, .clay-seo {
  --bevel-font-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  --bevel-font-serif: Newsreader, Georgia, "Times New Roman", serif;
  --bevel-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --bevel-ground: light-dark(#FDF8F0, #0B0C13);
  --bevel-surface: light-dark(#FFFCF6, #1A1D2C);
  --bevel-sunk: light-dark(#F4ECDF, #22263A);
  --bevel-ink: light-dark(#2B241B, #ECEAF2);
  --bevel-ink-2: light-dark(#4A4033, #C9CDE0);
  --bevel-muted: light-dark(#6B5942, #A3A9C2);
  --bevel-faint: light-dark(#9A8A70, #6A7090);
  --bevel-line: light-dark(#E8DCC6, #2C3149);
  --bevel-line-2: light-dark(#D8C8AF, #3A4058);
  --bevel-line-3: light-dark(#C4B192, #4A536F);
  --bevel-brass: light-dark(#8F6310, #D9A445);
  --bevel-brass-soft: light-dark(#F0E4CC, #3A2F17);
  --bevel-ox: light-dark(#A83A2C, #FF6B79);
  --bevel-ox-soft: light-dark(#F6DED6, #3A2226);
  --bevel-teal: light-dark(#256056, #4E9C8C);
  --bevel-teal-soft: light-dark(#DCEBE7, #17332E);
  --bevel-face: light-dark(#F1E7D4, #2A2F48);
  --bevel-edge-hi: light-dark(#FFF9ED, #454C6C);
  --bevel-edge-lo: light-dark(#D6C3A5, #171B2C);
  --bevel-face-in: light-dark(#E3D0B3, #20253B);
  --bevel-edge-in: light-dark(#B89F7B, #12152A);
  --bevel-edge-in-hi: light-dark(#F0E1C9, #4D587A);
  --bevel-knob: light-dark(#FCF8F1, #5A6286);
  --bevel-knob-hi: light-dark(#FFF9ED, #7A83A8);
  --clay-shadow: 0 1px 2px light-dark(rgb(43 36 27 / .07), rgb(0 0 0 / .35)), 0 10px 28px -10px light-dark(rgb(43 36 27 / .32), rgb(0 0 0 / .7));
  --clay-sheet-shadow: 0 16px 30px -22px light-dark(rgb(43 36 27 / .45), rgb(0 0 0 / .85));
  color-scheme: inherit;
  font-family: var(--bevel-font-sans);
  color: var(--bevel-ink);
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

.clay-menu-dock { display: flex; align-items: center; gap: 6px; font-size: 13px; line-height: 1.4; }
.clay-menu-dock[data-embedded] { position: relative; display: inline-flex; }
.clay-menu-dock[hidden], .clay-menu-spots[hidden], .clay-menu-dock [hidden], .clay-seo [hidden] { display: none !important; }

.clay-menu { box-sizing: border-box; display: inline-flex; align-items: center; gap: 2px; user-select: none; -webkit-user-select: none; }

`;

export const SHELL_B = `.clay-menu-goo { position: relative; display: inline-grid; place-items: center; box-sizing: border-box; margin: 0; padding: 0; cursor: pointer; }
.clay-menu-goo svg { display: block; }
.clay-menu-dot { position: absolute; top: -1px; right: -2px; width: 8px; height: 8px; border-radius: 50%; background: var(--bevel-brass); box-shadow: 0 0 0 2px var(--bevel-surface); }

.clay-menu :focus-visible, .clay-roster:focus-visible { outline: 2px solid var(--bevel-brass); outline-offset: 2px; }
.clay-menu-edit:focus-visible { outline: none; }
.clay-menu-edit:focus-visible .clay-menu-track { outline: 2px solid var(--bevel-brass); outline-offset: 2px; }

`;

export const SHELL_C = `/* Popovers: the menu, the people panel, the status note. Below the dock, above it in a bottom corner. */
.clay-menu-list, .clay-people, .clay-menu-note { position: absolute; z-index: 1; top: calc(100% + 8px); right: 0; box-sizing: border-box; margin: 0; color: var(--bevel-ink); text-align: left; }
.clay-people, .clay-menu-note { border: 1px solid var(--bevel-line-2); background: var(--bevel-surface); box-shadow: var(--clay-shadow); }

.clay-menu-list { width: max-content; max-width: calc(100vw - 24px); max-height: calc(100dvh - 72px); overflow-y: auto; overscroll-behavior: contain; }
.clay-menu-list[popover] { position: fixed; inset: auto; margin: 0; }
.clay-menu-list [role^="menuitem"] { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; margin: 0; border: 0; background: none; text-align: left; text-decoration: none; cursor: pointer; }
.clay-menu-list [role^="menuitem"]:hover:not([aria-disabled="true"]), .clay-menu-list [role^="menuitem"]:focus-visible { outline: none; background: var(--bevel-sunk); }
.clay-menu-list [role^="menuitem"][aria-disabled="true"] { cursor: default; }
.clay-menu-pair { display: flex; gap: 12px; padding: 3px 9px; }
.clay-menu-list .clay-menu-pair [role="menuitem"] { flex: none; width: auto; justify-content: flex-start; gap: 9px; }
.clay-menu-list kbd { flex: none; white-space: nowrap; }
.clay-menu-row { display: flex; align-items: center; gap: 2px; }
.clay-menu-list .clay-menu-row > [part~="item"] { flex: 1; width: auto; min-width: 0; }
.clay-menu-list .clay-menu-row > [part~="dismiss"] { flex: none; width: 28px; justify-content: center; padding: 0; }
.clay-menu-row > [part~="dismiss"] svg { display: block; width: 10px; height: 10px; fill: currentColor; }
.clay-menu-upgrade { display: inline-flex; align-items: center; gap: 8px; }
.clay-menu-upgrade::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--bevel-brass); }
.clay-menu-toggle .clay-menu-track { flex: none; }
.clay-menu-version { box-sizing: border-box; margin: 0; padding: 7px 9px; }

.clay-menu-note { z-index: 2; width: max-content; max-width: 264px; padding: 8px 12px; font-size: 13px; line-height: 1.45; }

.clay-menu-stepper { display: flex; align-items: center; gap: 2px; padding-left: 9px; font: 400 13px/1.35 var(--bevel-font-sans); color: var(--bevel-ink); }
.clay-menu-stepper-label { flex: 1; margin-right: 12px; white-space: nowrap; }
.clay-menu-stepper-value { min-width: 5.5em; text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
.clay-menu-list .clay-menu-stepper [role="menuitem"] { flex: none; display: inline-grid; place-items: center; box-sizing: border-box; width: 36px; min-height: 36px; padding: 0; }
.clay-menu-stepper svg { display: block; width: 16px; height: 16px; fill: currentColor; }

`;

export const SHELL_BASE = SHELL_A + SHELL_B + SHELL_C;

export const SHELL_FLOATING = `/* The dock: the roster (when a page opts in) and the capsule, fixed in one corner. */
.clay-menu-dock { position: fixed; z-index: 2147482000; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right)); }
.clay-menu-dock[data-corner$="left"] { right: auto; left: max(12px, env(safe-area-inset-left)); flex-direction: row-reverse; }
.clay-menu-dock[data-corner^="bottom"] { top: auto; bottom: max(12px, env(safe-area-inset-bottom)); }
.clay-menu-dock[data-corner$="left"] :is(.clay-menu-list, .clay-people, .clay-menu-note) { right: auto; left: 0; }
.clay-menu-dock[data-corner^="bottom"] :is(.clay-menu-list, .clay-people, .clay-menu-note) { top: auto; bottom: calc(100% + 8px); }
`;

export const MENU_SKIN = `.clay-menu { height: 34px; padding: 0 4px 0 2px; border: 1px solid var(--bevel-line-3); background: var(--bevel-surface); box-shadow: var(--clay-shadow); }
.clay-menu-goo { width: 28px; height: 28px; min-height: 0; border-radius: 0; border: 2px solid transparent; background: none; color: var(--bevel-ink); }
.clay-menu-goo::before { content: ""; position: absolute; inset: -8px -8px -8px -4px; }
.clay-menu-goo svg { width: 18px; height: auto; fill: currentColor; }
.clay-menu-goo:hover svg { translate: 0 -1px; }
.clay-menu-goo:active, .clay-menu-goo[aria-expanded="true"] { background: var(--bevel-face-in); border-color: var(--bevel-edge-in) var(--bevel-edge-in-hi) var(--bevel-edge-in-hi) var(--bevel-edge-in); }
.clay-menu-goo:active svg, .clay-menu-goo[aria-expanded="true"] svg { translate: 1px 1px; }
.clay-menu-list { min-width: 284px; padding: 6px; border: 1px solid var(--bevel-line-2); background: var(--bevel-surface); box-shadow: var(--clay-shadow); }
.clay-menu-list [role^="menuitem"] { min-height: 32px; padding: 5px 9px; font: 400 13px/1.35 var(--bevel-font-sans); color: var(--bevel-ink); }
.clay-menu-list [role^="menuitem"][aria-disabled="true"] { color: var(--bevel-faint); }
.clay-menu-list [role^="menuitem"][aria-disabled="true"] kbd { opacity: .6; }
.clay-menu-list .clay-menu-pair [role="menuitem"] { min-height: 30px; padding: 4px 6px 4px 9px; border: 1px solid var(--bevel-line); }
.clay-menu-list kbd { font: 500 11px/1 var(--bevel-font-mono); padding: 3px 5px; border: 1px solid var(--bevel-line-2); background: var(--bevel-sunk); color: var(--bevel-muted); }
.clay-menu-list [part~="quiet"] { font-size: 12px; color: var(--bevel-muted); }
.clay-menu-sep { height: 1px; margin: 4px 2px; background: var(--bevel-line); }
.clay-menu-version { font: 400 11.5px/1.4 var(--bevel-font-mono); color: var(--bevel-muted); }
`;

// Last, so no skin can shrink a touch target or bring motion back.
export const MENU_TOUCH = `@media (pointer: coarse), (max-width: 680px) {
  .clay-menu-list [role^="menuitem"] { min-height: 44px; font-size: 15px; }
  .clay-menu-list .clay-menu-pair [role="menuitem"] { min-height: 44px; }
  .clay-menu-list .clay-menu-stepper [role="menuitem"] { width: 44px; min-height: 44px; }
  :is(.clay-menu-dock, .clay-seo) :is(input, textarea, select) { font-size: 16px; }
  .clay-seo-input, .clay-people-input { min-height: 40px; }
  .clay-menu-btn { min-height: 40px; }
}
@media (prefers-reduced-motion: reduce) {
  .clay-menu-track, .clay-menu-thumb { transition: none; }
}
`;
