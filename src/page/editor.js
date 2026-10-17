// The page editor: a ProseMirror view over the flat block document, with the
// list, toggle, move, collapse and paste behaviour of blocks.js and the chrome
// of chrome.js. Local editing only; the live record and sync attach elsewhere.
//
// Theming: the base look below is built on --page-* tokens and sits in the
// `page` cascade layer, so a theme is one plain stylesheet that sets tokens on
// .page-shell (and adds scoped rules where it needs to); unlayered theme rules
// always win. Contract: plans/.../default-page/v1/look/THEME-CONTRACT.md
import { state, view as pmView, keymap, commands, history, dropcursor, gapcursor } from "../vendor/prosemirror.vendor.js";
import { schema } from "./schema.js";
import { identityPlugin, docFromBlocks, blockMap, keyBetween, newId } from "./model.js";
import { blockKeys, structurePlugin, collapsePlugin, pastePlugin, STEP } from "./blocks.js";
import { chromePlugin } from "./chrome.js";

const STYLE_ID = "page-editor-style";
const INDENTS = [1, 2, 3, 4, 5, 6, 7, 8];

const LIGHT = `
  --page-bg: #F7F6F2; --page-ink: #23221F; --page-ink-soft: #6B6862; --page-ink-faint: #9B968C;
  --page-rule: rgba(35, 34, 31, 0.10); --page-accent: #2F5E9E; --page-selection: rgba(88, 120, 170, 0.20);
  --page-check-border: rgba(35, 34, 31, 0.35); --page-check-fill: #23221F; --page-check-ink: #F7F6F2;
  --page-callout-bg: rgba(35, 34, 31, 0.04); --page-code-bg: rgba(35, 34, 31, 0.05);
  --page-chrome-ink-rest: rgba(35, 34, 31, 0.20); --page-chrome-ink-moved: rgba(35, 34, 31, 0.34);
  --page-chrome-bg-rest: rgba(35, 34, 31, 0.02); --page-chrome-bg-moved: rgba(35, 34, 31, 0.04);
  --page-chrome-line-rest: rgba(35, 34, 31, 0.06); --page-chrome-line-moved: rgba(35, 34, 31, 0.11);
  --page-pop-bg: #FBFAF7; --page-pop-ink: #23221F; --page-pop-muted: #6B6862; --page-pop-line: rgba(35, 34, 31, 0.10);
  --page-pop-shadow: 0 1px 2px rgba(35, 34, 31, 0.05), 0 8px 24px rgba(35, 34, 31, 0.08); --page-pop-hover: rgba(35, 34, 31, 0.06);
  --page-scrim: rgba(35, 34, 31, 0.12);`;

const DARK = `
  --page-bg: #1A1A18; --page-ink: #E7E4DC; --page-ink-soft: #A3A098; --page-ink-faint: #75726B;
  --page-rule: rgba(231, 228, 220, 0.10); --page-accent: #8DB0E6; --page-selection: rgba(120, 155, 210, 0.28);
  --page-check-border: rgba(231, 228, 220, 0.35); --page-check-fill: #E7E4DC; --page-check-ink: #1A1A18;
  --page-callout-bg: rgba(231, 228, 220, 0.05); --page-code-bg: rgba(231, 228, 220, 0.06);
  --page-chrome-ink-rest: rgba(231, 228, 220, 0.18); --page-chrome-ink-moved: rgba(231, 228, 220, 0.30);
  --page-chrome-bg-rest: rgba(231, 228, 220, 0.02); --page-chrome-bg-moved: rgba(231, 228, 220, 0.04);
  --page-chrome-line-rest: rgba(231, 228, 220, 0.06); --page-chrome-line-moved: rgba(231, 228, 220, 0.11);
  --page-pop-bg: #222220; --page-pop-ink: #E7E4DC; --page-pop-muted: #A3A098; --page-pop-line: rgba(231, 228, 220, 0.10);
  --page-pop-shadow: 0 1px 2px rgba(10, 10, 9, 0.3), 0 10px 28px rgba(10, 10, 9, 0.35); --page-pop-hover: rgba(231, 228, 220, 0.07);
  --page-scrim: rgba(10, 10, 9, 0.35);`;

export const PAGE_EDITOR_CSS = `
@layer page {
:where(.page-shell) {${LIGHT}
  --page-ink-strong: var(--page-ink); --page-caret: var(--page-accent);
  --page-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --page-font-display: var(--page-font); --page-font-heading: var(--page-font);
  --page-font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --page-font-size: 17px; --page-line-height: 1.65; --page-measure: 680px; --page-pad-top: 72px;
  --page-h1-size: 34px; --page-h1-weight: 600; --page-h1-tracking: -0.01em; --page-h1-line: 1.2;
  --page-h2-size: 21px; --page-h2-weight: 600; --page-h3-size: 17px; --page-h3-weight: 600;
  --page-block-gap: 0.35em; --page-indent: 1.6em;
  --page-marker: var(--page-ink-soft); --page-check-size: 16px; --page-check-radius: 4px; --page-done-ink: var(--page-ink-faint);
  --page-toggle-ink: var(--page-ink-soft); --page-callout-line: transparent; --page-code-ink: var(--page-ink);
  --page-chrome-shadow-rest: none; --page-chrome-shadow-moved: none; --page-chrome-radius: 7px; --page-plus-size: 24px; --page-fade: 240ms;
  --page-pop-radius: 10px; --page-bar-bg: var(--page-pop-bg); --page-bar-ink: var(--page-pop-ink);
}
@media (prefers-color-scheme: dark) { :where(:root:not([data-theme="light"]) .page-shell) {${DARK} } }
:where(:root[data-theme="dark"] .page-shell) {${DARK} }

.page-shell { position: relative; background: var(--page-bg); color: var(--page-ink); font-family: var(--page-font); font-size: var(--page-font-size); line-height: var(--page-line-height); padding: 0 16px; }
.page-editor { max-width: var(--page-measure); margin: 0 auto; padding: var(--page-pad-top) 0 30vh; outline: none; white-space: pre-wrap; overflow-wrap: break-word; caret-color: var(--page-caret); }
.page-editor ::selection { background: var(--page-selection); }
.page-editor > * { margin: var(--page-block-gap) 0; margin-inline-start: calc(var(--page-depth, 0) * var(--page-indent)); }
.page-editor > h1 { font-family: var(--page-font-display); font-size: var(--page-h1-size); font-weight: var(--page-h1-weight); letter-spacing: var(--page-h1-tracking); line-height: var(--page-h1-line); color: var(--page-ink-strong); margin-block: 0 0.6em; }
.page-editor > h2 { font-family: var(--page-font-heading); font-size: var(--page-h2-size); font-weight: var(--page-h2-weight); color: var(--page-ink-strong); line-height: 1.35; margin-block-start: 1.4em; }
.page-editor > h3 { font-family: var(--page-font-heading); font-size: var(--page-h3-size); font-weight: var(--page-h3-weight); color: var(--page-ink-strong); margin-block-start: 1.2em; }
.page-editor a { color: var(--page-accent); }
.page-editor code { font-family: var(--page-font-mono); font-size: 0.88em; background: var(--page-code-bg); color: var(--page-code-ink); border-radius: 4px; padding: 0.1em 0.3em; }
.page-editor pre { font-family: var(--page-font-mono); font-size: 0.88em; background: var(--page-code-bg); color: var(--page-code-ink); border-radius: 8px; padding: 12px 14px; }
.page-editor pre code { background: none; padding: 0; font-size: inherit; }
.page-editor .page-callout { background: var(--page-callout-bg); border: 1px solid var(--page-callout-line); border-radius: 8px; padding: 10px 14px; }
.page-editor hr { border: 0; border-top: 1px solid var(--page-rule); margin-block: 1.2em; }
.page-editor .page-hidden { display: none; }
.page-editor .page-li { position: relative; --li-indent: 0; padding-inline-start: calc((var(--li-indent) + 1) * var(--page-indent)); }
${INDENTS.map((n) => `.page-editor .page-li[data-indent="${n}"] { --li-indent: ${n}; }`).join("\n")}
.page-editor .page-li::before { position: absolute; inset-inline-start: calc(var(--li-indent) * var(--page-indent)); width: var(--page-indent); text-align: center; color: var(--page-marker); content: "\\2022"; }
.page-editor .page-li[data-kind="ordered"]::before { content: attr(data-marker); font-variant-numeric: tabular-nums; }
.page-editor .page-li[data-kind="check"]::before { content: ""; box-sizing: border-box; width: var(--page-check-size); height: var(--page-check-size); top: calc((1em * var(--page-line-height) - var(--page-check-size)) / 2); inset-inline-start: calc(var(--li-indent) * var(--page-indent) + (var(--page-indent) - var(--page-check-size)) / 2); border: 1px solid var(--page-check-border); border-radius: var(--page-check-radius); cursor: pointer; }
.page-editor .page-li[data-kind="check"][data-checked="true"]::before { content: "\\2713"; background: var(--page-check-fill); border-color: var(--page-check-fill); color: var(--page-check-ink); font-size: calc(var(--page-check-size) * 0.72); line-height: calc(var(--page-check-size) - 2px); font-weight: 700; }
.page-editor .page-li[data-kind="check"][data-checked="true"] { color: var(--page-done-ink); text-decoration: line-through; }
.page-editor .page-toggle { position: relative; padding-inline-start: var(--page-indent); }
.page-editor .page-toggle-button { position: absolute; inset-inline-start: 0; top: 0; width: var(--page-indent); height: calc(1em * var(--page-line-height)); display: grid; place-items: center; border: 0; padding: 0; background: none; color: var(--page-toggle-ink); font: inherit; line-height: 1; cursor: pointer; transition: transform var(--page-fade); }
.page-editor .page-toggle-button::before { content: "\\25B8"; }
.page-editor .page-toggle[aria-expanded="true"] > .page-toggle-button { transform: rotate(90deg); }

.page-dock, .page-plus { color: var(--page-chrome-ink-rest); background: var(--page-chrome-bg-rest); border: 1px solid var(--page-chrome-line-rest); box-shadow: var(--page-chrome-shadow-rest); border-radius: var(--page-chrome-radius); transition: color var(--page-fade), background-color var(--page-fade), border-color var(--page-fade), box-shadow var(--page-fade); }
.page-shell.is-moved .page-dock, .page-shell.is-moved .page-plus { color: var(--page-chrome-ink-moved); background: var(--page-chrome-bg-moved); border-color: var(--page-chrome-line-moved); box-shadow: var(--page-chrome-shadow-moved); }
.page-dock { position: sticky; top: 12px; z-index: 3; display: flex; align-items: center; gap: 2px; width: max-content; margin: 12px auto 0; padding: 3px; backdrop-filter: blur(6px); }
.page-dock + .page-editor { padding-top: max(16px, calc(var(--page-pad-top) - 48px)); }
.page-tool { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 6px; border: 0; border-radius: 5px; background: none; color: inherit; font: 500 13px/1 var(--page-font); cursor: pointer; }
.page-tool:hover, .page-tool[aria-pressed="true"] { background: var(--page-pop-hover); }
.page-tool-turn { gap: 4px; padding: 0 8px; }
.page-tool-sep { width: 1px; height: 16px; margin: 0 3px; background: currentColor; opacity: 0.5; }
.page-plus { position: absolute; z-index: 2; top: calc(var(--page-plus-top, 0px) - var(--page-plus-size) / 2); left: calc(var(--page-plus-left, 0px) - var(--page-plus-size) - 12px); width: var(--page-plus-size); height: var(--page-plus-size); display: grid; place-items: center; padding: 0; cursor: pointer; }
.page-plus[aria-expanded="true"] { color: var(--page-chrome-ink-moved); background: var(--page-chrome-bg-moved); }
.page-bubble, .page-menu { position: absolute; z-index: 4; background: var(--page-pop-bg); color: var(--page-pop-ink); border: 1px solid var(--page-pop-line); box-shadow: var(--page-pop-shadow); border-radius: var(--page-pop-radius); }
.page-bubble { display: flex; gap: 1px; padding: 3px; left: var(--page-pop-x, 0px); top: var(--page-pop-y, 0px); transform: translate(-50%, calc(-100% - 8px)); }
.page-menu { left: var(--page-pop-x, 0px); top: var(--page-pop-y, 0px); width: 260px; max-height: 340px; overflow-y: auto; padding: 6px; font-size: 14px; }
.page-menu-title { padding: 4px 10px 6px; color: var(--page-pop-muted); font-size: 12px; }
.page-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 34px; padding: 4px 10px; border: 0; border-radius: 7px; background: none; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.page-menu-item[aria-selected="true"], .page-menu-item:hover { background: var(--page-pop-hover); }
.page-menu-icon { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--page-pop-line); border-radius: 6px; color: var(--page-pop-muted); font-size: 12px; flex: none; }
.page-menu-hint { margin-inline-start: auto; color: var(--page-pop-muted); font-size: 12px; }
.page-scrim { display: none; }
.page-shell [hidden] { display: none !important; }

@media (max-width: 560px) {
  .page-dock { display: none; }
  .page-plus { position: fixed; top: auto; left: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); width: 44px; height: 44px; border-radius: 22px; }
  .page-bubble { position: fixed; left: 0; right: 0; top: auto; bottom: 0; transform: none; justify-content: center; gap: 4px; padding: 6px 16px calc(6px + env(safe-area-inset-bottom)); border-radius: 0; border-width: 1px 0 0; background: var(--page-bar-bg); color: var(--page-bar-ink); }
  .page-bubble .page-tool { min-width: 44px; height: 44px; }
  .page-scrim { display: block; position: fixed; inset: 0; z-index: 4; background: var(--page-scrim); }
  .page-menu { position: fixed; left: 0; right: 0; top: auto; bottom: 0; width: auto; max-height: 70vh; z-index: 5; padding: 8px 8px calc(8px + env(safe-area-inset-bottom)); border-radius: var(--page-pop-radius) var(--page-pop-radius) 0 0; border-width: 1px 0 0; }
  .page-menu-item { min-height: 48px; font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .page-dock, .page-plus, .page-toggle-button { transition: none; }
}
}
`;

const insertHardBreak = (st, dispatch) => {
  if (dispatch) dispatch(st.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
  return true;
};

const editKeys = {
  "Mod-z": history.undo,
  "Shift-Mod-z": history.redo,
  "Mod-y": history.redo,
  "Shift-Enter": insertHardBreak,
  "Mod-b": commands.toggleMark(schema.marks.strong),
  "Mod-i": commands.toggleMark(schema.marks.em),
};

export function pagePlugins() {
  return [
    chromePlugin(),
    keymap.keymap(blockKeys),
    keymap.keymap(editKeys),
    keymap.keymap(commands.baseKeymap),
    structurePlugin(),
    identityPlugin(),
    collapsePlugin(),
    pastePlugin(),
    history.history(),
    dropcursor.dropCursor(),
    gapcursor.gapCursor(),
  ];
}

export function pageState(blocks) {
  const record = blocks && Object.keys(blocks).length ? blocks : { [newId()]: { t: "paragraph", pos: keyBetween(), c: "" } };
  return state.EditorState.create({ doc: docFromBlocks(schema, record), plugins: pagePlugins() });
}

// Clicking a checklist box (drawn by ::before in the item's start gutter)
// toggles `checked`.
function checkboxClick(view, event) {
  const li = event.target.closest?.('.page-li[data-kind="check"]');
  if (!li || !view.dom.contains(li)) return false;
  const box = li.getBoundingClientRect();
  const start = parseFloat(getComputedStyle(li).paddingInlineStart) || 0;
  const x = getComputedStyle(li).direction === "rtl" ? box.right - event.clientX : event.clientX - box.left;
  if (x < 0 || x > start) return false;
  const pos = view.posAtDOM(li, 0) - 1;
  const node = view.state.doc.nodeAt(pos);
  if (!node) return false;
  event.preventDefault();
  view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, checked: !node.attrs.checked }));
  return true;
}

// Mounts the editor in `mount`, inside a .page-shell wrapper (the surface a
// theme styles). `onChange(record)` gets the block record (blockMap) after
// every transaction that changed the document.
export function createPageEditor(mount, { blocks = null, onChange = null } = {}) {
  const doc = mount.ownerDocument;
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = PAGE_EDITOR_CSS;
    doc.head.appendChild(style);
  }
  const shell = doc.createElement("div");
  shell.className = "page-shell";
  mount.appendChild(shell);
  let afterStep = false;
  const view = new pmView.EditorView(shell, {
    state: pageState(blocks),
    attributes: { class: "page-editor" },
    handleDOMEvents: { mousedown: checkboxClick },
    dispatchTransaction(tr) {
      if (afterStep && tr.docChanged && !tr.getMeta(STEP)) history.closeHistory(tr);
      if (tr.docChanged) afterStep = !!tr.getMeta(STEP);
      const before = view.state.doc;
      view.updateState(view.state.apply(tr));
      if (onChange && view.state.doc !== before) onChange(blockMap(view.state.doc));
    },
  });
  return view;
}
