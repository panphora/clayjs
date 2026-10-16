export const INTRO_CSS = `.clay-intro, .clay-about {
  --hcp-ground: #FDF8F0;
  --hcp-surface: #FFFCF6;
  --hcp-sunk: #F4ECDF;
  --hcp-ink: #2B241B;
  --hcp-ink-2: #4A4033;
  --hcp-muted: #6B5942;
  --hcp-line: #E8DCC6;
  --hcp-line-2: #D8C8AF;
  --hcp-brass: #8F6310;
  --hcp-brass-soft: #F0E4CC;
  --hcp-face: #F1E7D4;
  --hcp-edge-hi: #FFF9ED;
  --hcp-edge-lo: #D6C3A5;
  --hcp-shadow: 0 1px 2px rgba(23, 28, 36, .06), 0 14px 34px -14px rgba(43, 36, 27, .32);
  --hcp-sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --hcp-serif: Newsreader, Georgia, "Times New Roman", serif;
  --hcp-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  .clay-intro, .clay-about {
    --hcp-ground: #0B0C13; --hcp-surface: #11131E; --hcp-sunk: #1A1D2C;
    --hcp-ink: #ECEAF2; --hcp-ink-2: #C9CDE0; --hcp-muted: #8A90AB;
    --hcp-line: #262B42; --hcp-line-2: #353B52;
    --hcp-brass: #D9A445; --hcp-brass-soft: #3A2F17;
    --hcp-face: #22273E; --hcp-edge-hi: #3C4260; --hcp-edge-lo: #1B2033;
    --hcp-shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 16px 38px -14px rgba(0, 0, 0, .7);
    color-scheme: dark;
  }
}

html:has(> body > .clay-intro), body:has(> .clay-intro) { height: auto !important; min-height: 100%; overflow-y: auto !important; }

.clay-intro, .clay-intro *, .clay-intro *::before, .clay-intro *::after,
.clay-about, .clay-about *::before, .clay-about *::after {
  box-sizing: border-box; margin: 0; padding: 0; border: 0;
  font: inherit; letter-spacing: normal; text-transform: none; text-shadow: none;
  line-height: inherit; color: inherit; background: none; float: none; max-width: none;
}
.clay-intro {
  position: relative; z-index: 1; display: block;
  min-height: 100svh;
  background: var(--hcp-ground);
  font-family: var(--hcp-sans); font-size: 16px; font-weight: 400; line-height: 1.5;
  color: var(--hcp-ink); text-align: left;
  -webkit-font-smoothing: antialiased;
}
.clay-intro__inner {
  display: flex; flex-direction: column; gap: 18px;
  width: 100%; max-width: 720px; min-height: 100svh; margin: 0 auto;
  padding: max(24px, 6vh) 16px 32px;
}
.clay-intro .clay-intro__kicker {
  font-family: var(--hcp-mono); font-size: 11px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase;
  color: var(--hcp-brass);
}
.clay-intro__name {
  font-family: var(--hcp-serif); font-size: clamp(30px, 7vw, 44px); font-weight: 500; line-height: 1.12;
  color: var(--hcp-ink); font-variation-settings: "opsz" 48;
}
.clay-intro__inner > p { font-size: 18px; line-height: 1.55; color: var(--hcp-ink-2); }
.clay-intro__inner > a { color: var(--hcp-brass); text-decoration: underline; text-underline-offset: 2px; }
.clay-intro__inner > video, .clay-intro__inner > img {
  display: block; width: 100%; height: auto; aspect-ratio: 16 / 9;
  background: var(--hcp-sunk); border: 1px solid var(--hcp-line);
}
.clay-intro__inner > ul, .clay-intro__inner > ol { padding-left: 22px; font-size: 18px; line-height: 1.55; color: var(--hcp-ink-2); }
.clay-intro__inner > ul { list-style: disc; }
.clay-intro__inner > ol { list-style: decimal; }

.clay-intro__actions { display: flex; flex-direction: column; gap: 14px; align-items: stretch; }
.clay-intro__download {
  align-self: flex-start;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 0 18px;
  font-family: var(--hcp-sans); font-size: 15px; font-weight: 500; line-height: 1.5;
  white-space: nowrap; text-decoration: none; cursor: pointer; user-select: none;
  color: var(--hcp-ground); background: var(--hcp-ink);
  border: 2px solid;
  border-color: color-mix(in srgb, var(--hcp-ink), white 24%) color-mix(in srgb, var(--hcp-ink), black 32%) color-mix(in srgb, var(--hcp-ink), black 32%) color-mix(in srgb, var(--hcp-ink), white 24%);
  transition: background .2s ease;
}
.clay-intro__download:hover { background: color-mix(in srgb, var(--hcp-ink), var(--hcp-ground) 12%); }

.clay-intro__signup {
  display: flex; flex-direction: column; gap: 9px;
  padding: 14px 16px;
  background: var(--hcp-surface); border: 1px solid var(--hcp-line); border-left: 3px solid var(--hcp-brass);
}
.clay-intro__signup label { font-size: 14px; line-height: 1.45; color: var(--hcp-ink-2); }
.clay-intro__row { display: flex; gap: 8px; }
.clay-intro__row input {
  flex: 1 1 auto; min-width: 0; height: 40px; padding: 0 10px;
  font-family: var(--hcp-sans); font-size: 15px; color: var(--hcp-ink);
  background: var(--hcp-ground); border: 1px solid var(--hcp-line-2);
}
.clay-intro__row input::placeholder { color: var(--hcp-muted); }
.clay-intro__row button {
  flex: none; height: 40px; padding: 0 14px;
  font-family: var(--hcp-sans); font-size: 14px; font-weight: 500;
  color: var(--hcp-ink); background: var(--hcp-face); cursor: pointer;
  border: 2px solid; border-color: var(--hcp-edge-hi) var(--hcp-edge-lo) var(--hcp-edge-lo) var(--hcp-edge-hi);
}
.clay-intro__row button:hover { background: color-mix(in srgb, var(--hcp-face), var(--hcp-edge-hi) 45%); }
.clay-intro__hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.clay-intro__msg { font-size: 14px; line-height: 1.5; color: var(--hcp-ink-2); }
.clay-intro__msg[hidden] { display: none; }
.clay-intro__row[hidden] { display: none; }

.clay-intro__start {
  margin-top: auto;
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; min-height: 56px; padding: 0 20px;
  font-family: var(--hcp-sans); font-size: 16px; font-weight: 500;
  color: var(--hcp-ground); background: var(--hcp-ink); cursor: pointer;
  border: 2px solid;
  border-color: color-mix(in srgb, var(--hcp-ink), white 24%) color-mix(in srgb, var(--hcp-ink), black 32%) color-mix(in srgb, var(--hcp-ink), black 32%) color-mix(in srgb, var(--hcp-ink), white 24%);
  transition: background .2s ease;
}
.clay-intro__start::after { content: "\\2193"; font-size: 15px; line-height: 1; }
.clay-intro__start:hover { background: color-mix(in srgb, var(--hcp-ink), var(--hcp-ground) 12%); }
.clay-intro__download:focus-visible, .clay-intro__start:focus-visible,
.clay-intro__row button:focus-visible, .clay-intro__row input:focus-visible,
.clay-about:focus-visible { outline: 2px solid var(--hcp-brass); outline-offset: 2px; }

.clay-about {
  position: fixed; top: 12px; right: 12px; z-index: 2147482000;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  height: 34px; padding: 0 12px;
  font-family: var(--hcp-sans); font-size: 13px; font-weight: 500; line-height: 1.5;
  white-space: nowrap; cursor: pointer; user-select: none;
  color: var(--hcp-ink); background: var(--hcp-face);
  border: 2px solid; border-color: var(--hcp-edge-hi) var(--hcp-edge-lo) var(--hcp-edge-lo) var(--hcp-edge-hi);
  box-shadow: var(--hcp-shadow);
  transition: background .2s ease;
}
.clay-about:hover { background: color-mix(in srgb, var(--hcp-face), var(--hcp-edge-hi) 45%); }

@media (min-width: 560px) {
  .clay-intro__actions { flex-direction: row; flex-wrap: wrap; align-items: center; }
  .clay-intro__signup { flex: 1 1 320px; max-width: 520px; }
}
@media (pointer: coarse) {
  .clay-intro__download, .clay-intro__start, .clay-intro__row input, .clay-intro__row button { min-height: 44px; }
  .clay-about { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .clay-intro, .clay-intro *, .clay-about { transition: none; animation: none; }
}
@media (forced-colors: active) {
  .clay-intro__download, .clay-intro__start, .clay-intro__row button, .clay-about { border: 1px solid ButtonText; }
  .clay-intro__signup { border: 1px solid CanvasText; }
}
@media print { .clay-intro, .clay-about { display: none; } }
`;
