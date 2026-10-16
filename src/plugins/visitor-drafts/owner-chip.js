import { isDraftMode } from "../../core/is-edit-mode.js";

export const COPY = {
  draft: "You're seeing a private draft, like a visitor.",
  draftAction: "Edit the original",
  edit: "You're editing the original. Visitors get these changes.",
  editAction: "Back to my draft",
  close: "Hide this note",
};

const CHIP_CSS = `.clay-owner {
  --hcp-ground: #FDF8F0;
  --hcp-surface: #FFFCF6;
  --hcp-sunk: #F4ECDF;
  --hcp-ink: #2B241B;
  --hcp-ink-2: #4A4033;
  --hcp-muted: #6B5942;
  --hcp-line: #E8DCC6;
  --hcp-line-2: #D8C8AF;
  --hcp-brass: #8F6310;
  --hcp-shadow: 0 1px 2px rgba(23, 28, 36, .06), 0 14px 34px -14px rgba(43, 36, 27, .32);
  --hcp-sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --hcp-lift: 0px;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  .clay-owner {
    --hcp-surface: #11131E; --hcp-sunk: #1A1D2C;
    --hcp-ink: #ECEAF2; --hcp-ink-2: #C9CDE0; --hcp-muted: #8A90AB;
    --hcp-line: #262B42; --hcp-line-2: #353B52;
    --hcp-brass: #D9A445;
    --hcp-shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 16px 38px -14px rgba(0, 0, 0, .7);
    color-scheme: dark;
  }
}
.clay-owner, .clay-owner *, .clay-owner *::before, .clay-owner *::after {
  box-sizing: border-box; margin: 0; padding: 0; border: 0;
  font: inherit; letter-spacing: normal; text-transform: none; text-shadow: none;
  line-height: inherit; color: inherit; background: none; float: none; max-width: none;
}
.clay-owner {
  position: fixed; left: 12px; bottom: calc(12px + var(--hcp-lift)); z-index: 2147482000;
  display: flex; align-items: center; gap: 10px;
  max-width: min(460px, calc(100vw - 24px));
  padding: 8px 8px 8px 12px;
  font-family: var(--hcp-sans); font-size: 13px; font-weight: 400; line-height: 1.45;
  color: var(--hcp-ink-2); text-align: left; background: var(--hcp-surface);
  border: 1px solid var(--hcp-line-2); border-left: 3px solid var(--hcp-brass);
  box-shadow: var(--hcp-shadow);
  -webkit-font-smoothing: antialiased;
}
.clay-owner__action {
  flex: none; font-weight: 600; color: var(--hcp-brass); cursor: pointer;
  text-decoration: underline; text-underline-offset: 2px; text-decoration-color: var(--hcp-line-2);
  white-space: nowrap;
}
.clay-owner__action:hover { color: var(--hcp-ink); }
.clay-owner__x {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; font-size: 15px; color: var(--hcp-muted); cursor: pointer;
}
.clay-owner__x:hover { color: var(--hcp-ink); }
.clay-owner__action:focus-visible, .clay-owner__x:focus-visible { outline: 2px solid var(--hcp-brass); outline-offset: 2px; }
@media (pointer: coarse) {
  .clay-owner__action, .clay-owner__x { min-height: 44px; }
  .clay-owner__x { width: 44px; }
}
@media (prefers-reduced-motion: reduce) { .clay-owner { transition: none; } }
@media (forced-colors: active) { .clay-owner { border: 1px solid CanvasText; } }
@media print { .clay-owner { display: none; } }
`;

function stylesOnce() {
  if (document.getElementById("clay-owner-style")) return;
  const style = document.createElement("style");
  style.id = "clay-owner-style";
  style.setAttribute("clay", "editor-ui");
  style.textContent = CHIP_CSS;
  document.head.appendChild(style);
}

export function mountOwnerChip() {
  if (document.getElementById("clay-owner")) return null;
  stylesOnce();

  const draft = isDraftMode;
  const chip = document.createElement("div");
  chip.id = "clay-owner";
  chip.className = "clay-owner";
  chip.setAttribute("clay", "editor-ui");
  chip.setAttribute("sap-ignore", "");
  chip.setAttribute("role", "status");

  const lead = document.createElement("span");
  lead.className = "clay-owner__lead";
  lead.textContent = draft ? COPY.draft : COPY.edit;

  const action = document.createElement("button");
  action.type = "button";
  action.className = "clay-owner__action";
  action.textContent = draft ? COPY.draftAction : COPY.editAction;
  action.addEventListener("click", () => {
    const api = window.clay && window.clay.visitorDrafts;
    if (!api) return;
    if (draft) api.editOriginal();
    else api.backToDraft();
  });

  const close = document.createElement("button");
  close.type = "button";
  close.className = "clay-owner__x";
  close.setAttribute("aria-label", COPY.close);
  close.textContent = "\u00d7";
  close.addEventListener("click", () => { chip.remove(); liftOff(); });

  chip.append(lead, action, close);
  document.body.appendChild(chip);

  let frame = 0;
  function lift() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const y = window.innerHeight - 3;
      let raise = 0;
      const hits = document.elementsFromPoint ? document.elementsFromPoint(24, y) : [];
      for (const hit of hits) {
        for (let el = hit; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
          if (chip.contains(el)) break;
          const position = getComputedStyle(el).position;
          if (position === "fixed" || position === "sticky") {
            raise = Math.max(raise, Math.ceil(window.innerHeight - el.getBoundingClientRect().top));
            break;
          }
        }
      }
      chip.style.setProperty("--hcp-lift", (raise > 0 && raise < window.innerHeight / 3 ? raise : 0) + "px");
    });
  }

  function liftOff() {
    removeEventListener("scroll", lift);
    removeEventListener("resize", lift);
  }

  addEventListener("scroll", lift, { passive: true });
  addEventListener("resize", lift);
  lift();

  return chip;
}
