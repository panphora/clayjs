// The page editor's chrome: a faint toolbar, a plus button beside the caret's
// line, a toolbar over a text selection and a block menu (from the plus or "/").
// At rest everything is faint; moving the pointer adds .is-moved to the shell,
// which themes darken by a small step. All of it is themed through the
// --page-* tokens in editor.js (contract: default-page/v1/look/THEME-CONTRACT.md).
import { state, commands } from "../vendor/prosemirror.vendor.js";
import { schema } from "./schema.js";
import { BlockSelection, outline, moveBlock, indentBlocks, outdentBlocks } from "./blocks.js";
import { currentSpan, selectBlocks, duplicateBlocks, deleteBlocks } from "./blocksel.js";
import { openAltEditor, setImageAttrs } from "./media.js";
import { openLinkEditor } from "./link.js";
import { BLOCK_TYPES, MENU_ITEMS, blockTypeOf, turnInto, insertAfter, rankItems, runItem, retype } from "./items.js";

export { BLOCK_TYPES, blockTypeOf, turnInto, insertAfter } from "./items.js";

const { Plugin, PluginKey, TextSelection } = state;
const M = schema.marks;
const N = schema.nodes;

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

const selectedRoots = (st) => {
  const ents = outline(st.doc);
  const { lo, hi } = st.selection.span(st.doc);
  return ents.slice(lo, hi + 1).filter((e) => e.up === ents[lo].up);
};

const imageId = (view, index) => view.state.doc.child(index).attrs.id;

export const ACTION_ITEMS = [
  { key: "turn", label: "Turn into", icon: "↻", hint: "›", only: "text", run: (view, chrome) => chrome.openMenu("turn", chrome.plus) },
  { key: "duplicate", label: "Duplicate", icon: "⧉", hint: `${MOD}D`, run: (view) => duplicateBlocks(view.state, view.dispatch) },
  { key: "up", label: "Move up", icon: "↑", hint: `${MOD}⇧↑`, run: (view) => moveBlock(-1)(view.state, view.dispatch) },
  { key: "down", label: "Move down", icon: "↓", hint: `${MOD}⇧↓`, run: (view) => moveBlock(1)(view.state, view.dispatch) },
  { key: "indent", label: "Indent", icon: "→", hint: "Tab", run: (view) => indentBlocks(view.state, view.dispatch) },
  { key: "outdent", label: "Outdent", icon: "←", hint: "⇧Tab", run: (view) => outdentBlocks(view.state, view.dispatch) },
  { key: "delete", label: "Delete", icon: "×", hint: "Del", run: (view) => deleteBlocks(view.state, view.dispatch) },
  { key: "alt", label: "Alt text…", icon: "Aa", only: "image", focus: false, run: (view, chrome, index) => openAltEditor(view, imageId(view, index)) },
  { key: "small", label: "Small", icon: "▫", only: "image", run: (view, chrome, index) => setImageAttrs(view, imageId(view, index), { width: 240 }) },
  { key: "medium", label: "Medium", icon: "◻", only: "image", run: (view, chrome, index) => setImageAttrs(view, imageId(view, index), { width: 480 }) },
  { key: "full", label: "Full width", icon: "⬜", only: "image", run: (view, chrome, index) => setImageAttrs(view, imageId(view, index), { width: null }) },
];

const actionsFor = (st) => {
  if (!(st.selection instanceof BlockSelection)) return [];
  const roots = selectedRoots(st);
  const text = roots.every((e) => e.node.isTextblock);
  const image = roots.length === 1 && roots[0].node.type === N.image;
  return ACTION_ITEMS.filter((a) => (a.only === "text" ? text : a.only === "image" ? image : true));
};

const svg = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  plus: svg('<path d="M8 3.5v9M3.5 8h9"/>'),
  strong: svg('<path d="M5 3h4a2.5 2.5 0 0 1 0 5H5zM5 8h4.6a2.5 2.5 0 0 1 0 5H5z"/>'),
  em: svg('<path d="M10 3H6.5M9.5 13H6M9 3l-2 10"/>'),
  strike: svg('<path d="M3 8h10M10.8 5.2C10.5 4 9.4 3.2 8 3.2c-1.7 0-2.8.9-2.8 2.1M5.2 10.8c.3 1.2 1.4 2 2.8 2 1.7 0 2.8-.9 2.8-2.1"/>'),
  code: svg('<path d="M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5"/>'),
  link: svg('<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.7.7M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.7-.7"/>'),
};
const MARK_TOOLS = [
  ["strong", "Bold"],
  ["em", "Italic"],
  ["strike", "Strikethrough"],
  ["code", "Code"],
  ["link", "Link"],
];

function markActive(st, type) {
  const { from, to, empty, $from } = st.selection;
  if (empty) return !!type.isInSet(st.storedMarks || $from.marks());
  return st.doc.rangeHasMark(from, to, type);
}

function runMark(view, name) {
  if (name === "link") openLinkEditor(view);
  else commands.toggleMark(M[name])(view.state, view.dispatch);
  view.focus();
}

const el = (tag, cls, attrs = {}) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

function toolButton(name, label) {
  const b = el("button", "page-tool", { type: "button", "data-cmd": name, "aria-label": label, title: label });
  b.innerHTML = ICONS[name];
  return b;
}

const MOVED_MS = 1600;
let menuCount = 0;
export const chromeKey = new PluginKey("page-chrome");

class Chrome {
  constructor(view) {
    this.view = view;
    this.shell = view.dom.parentElement;
    this.menu = null;
    this.movedTimer = 0;

    this.dock = el("div", "page-dock", { role: "toolbar", "aria-label": "Formatting" });
    this.turn = el("button", "page-tool page-tool-turn", { type: "button", "aria-haspopup": "menu" });
    this.dock.append(this.turn, el("span", "page-tool-sep"), ...MARK_TOOLS.map(([n, l]) => toolButton(n, l)));
    this.plus = el("button", "page-plus", { type: "button", "aria-label": "Add a block", title: "Add a block" });
    this.plus.innerHTML = ICONS.plus;
    this.bubble = el("div", "page-bubble", { role: "toolbar", "aria-label": "Selection", hidden: "" });
    this.bubble.append(...MARK_TOOLS.map(([n, l]) => toolButton(n, l)));
    this.menuId = `page-menu-${++menuCount}`;
    this.menuEl = el("div", "page-menu", { role: "menu", id: this.menuId, hidden: "" });
    this.scrim = el("div", "page-scrim", { hidden: "" });
    this.shell.insertBefore(this.dock, view.dom);
    this.shell.append(this.plus, this.bubble, this.scrim, this.menuEl);

    const keepFocus = (e) => e.preventDefault();
    for (const part of [this.dock, this.plus, this.bubble, this.menuEl]) part.addEventListener("mousedown", keepFocus);
    for (const bar of [this.dock, this.bubble]) {
      bar.addEventListener("click", (e) => {
        const b = e.target.closest("[data-cmd]");
        if (b) runMark(this.view, b.dataset.cmd);
      });
    }
    this.turn.addEventListener("click", () => this.toggleMenu("turn", this.turn));
    this.plus.addEventListener("click", () => this.fromPlus());
    this.scrim.addEventListener("click", () => this.closeMenu());
    this.menuEl.addEventListener("click", (e) => {
      const row = e.target.closest(".page-menu-item");
      if (row) this.pick(Number(row.dataset.index));
    });
    this.onMove = () => {
      this.shell.classList.add("is-moved");
      clearTimeout(this.movedTimer);
      this.movedTimer = setTimeout(() => this.shell.classList.remove("is-moved"), MOVED_MS);
    };
    this.onKey = () => { clearTimeout(this.movedTimer); this.shell.classList.remove("is-moved"); };
    this.onResize = () => this.place();
    this.onDocDown = (e) => {
      if (!this.menu) return;
      if ([this.menuEl, this.plus, this.turn].some((part) => part.contains(e.target))) return;
      this.closeMenu();
    };
    document.addEventListener("mousedown", this.onDocDown, true);
    this.shell.addEventListener("mousemove", this.onMove);
    this.shell.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.onResize);
    this.update(view, null);
  }

  blockIndex() {
    const st = this.view.state, sel = st.selection;
    const pos = sel instanceof BlockSelection ? sel.from : sel.head;
    return Math.min(st.doc.resolve(pos).index(0), st.doc.childCount - 1);
  }

  gutterIndex() {
    return this.blockIndex();
  }

  fromPlus() {
    this.view.focus();
    this.openMenu("insert", this.plus, null, this.gutterIndex());
  }

  toggleMenu(mode, anchor) {
    if (this.menu) this.closeMenu();
    else this.openMenu(mode, anchor);
  }

  openMenu(mode, anchor, slashAt = null, index = null) {
    this.menu = { mode, anchor, slashAt, index, query: "", active: 0, items: [] };
    anchor.setAttribute("aria-expanded", "true");
    this.view.dom.setAttribute("aria-haspopup", "menu");
    this.view.dom.setAttribute("aria-controls", this.menuId);
    this.renderMenu();
  }

  closeMenu() {
    this.menu?.anchor.setAttribute("aria-expanded", "false");
    this.menu = null;
    this.menuEl.hidden = true;
    this.scrim.hidden = true;
    for (const name of ["aria-haspopup", "aria-controls", "aria-activedescendant"]) this.view.dom.removeAttribute(name);
  }

  menuItems(m) {
    if (m.mode === "actions") return actionsFor(this.view.state);
    return rankItems(m.mode === "turn" ? BLOCK_TYPES : MENU_ITEMS, m.query);
  }

  openActions(anchor = this.plus) {
    const st = this.view.state;
    const { lo, hi } = currentSpan(st);
    this.view.dispatch(st.tr.setSelection(selectBlocks(st.doc, lo, hi)));
    this.openMenu("actions", anchor, null, lo);
  }

  renderMenu() {
    const m = this.menu;
    m.items = this.menuItems(m);
    m.active = Math.min(m.active, Math.max(0, m.items.length - 1));
    const nodes = [];
    if (m.mode === "turn") {
      const title = el("div", "page-menu-title");
      title.textContent = m.query ? `Turn into “${m.query}”` : "Turn into";
      nodes.push(title);
    }
    if (!m.items.length) {
      const none = el("div", "page-menu-empty");
      none.textContent = "No matching blocks";
      nodes.push(none);
    }
    m.items.forEach((b, i) => {
      const active = i === m.active;
      const row = el("button", `page-menu-item${active ? " is-active" : ""}`, { type: "button", role: "menuitem", tabindex: "-1", id: `${this.menuId}-${i}`, "data-index": String(i), "aria-selected": active ? "true" : "false" });
      const icon = el("span", "page-menu-icon");
      icon.textContent = b.icon;
      const label = el("span", "page-menu-label");
      label.textContent = b.label;
      row.append(icon, label);
      if (b.hint) {
        const hint = el("span", "page-menu-hint");
        hint.textContent = b.hint;
        row.append(hint);
      }
      nodes.push(row);
    });
    this.menuEl.replaceChildren(...nodes);
    if (m.items.length) this.view.dom.setAttribute("aria-activedescendant", `${this.menuId}-${m.active}`);
    else this.view.dom.removeAttribute("aria-activedescendant");
    this.menuEl.hidden = false;
    this.scrim.hidden = false;
    this.place();
  }

  pick(i) {
    const m = this.menu;
    const item = m?.items[i];
    if (!item) return;
    let st = this.view.state;
    if (m.slashAt !== null) {
      const end = st.selection.head;
      if (end >= m.slashAt) {
        this.view.dispatch(st.tr.delete(m.slashAt - 1, end));
        st = this.view.state;
      }
    }
    this.closeMenu();
    if (m.mode === "turn") {
      let tr = null;
      if (st.selection instanceof BlockSelection) {
        tr = st.tr;
        for (const root of selectedRoots(st)) retype(tr, root.i, item);
      } else tr = turnInto(st, this.blockIndex(), item);
      if (tr) this.view.dispatch(tr.scrollIntoView());
      this.view.focus();
    } else if (m.mode === "actions") {
      item.run(this.view, this, m.index);
      if (!this.menu && item.focus !== false) this.view.focus();
    } else {
      runItem(this.view, item, m.slashAt !== null ? this.blockIndex() : m.index);
    }
  }

  // Keys while the menu is open; anything else falls through to the editor.
  key(event) {
    const m = this.menu;
    if (!m) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (m.items.length) {
        m.active = (m.active + (event.key === "ArrowDown" ? 1 : -1) + m.items.length) % m.items.length;
        this.renderMenu();
      }
      return true;
    }
    if (event.key === "Enter") {
      if (m.items.length) this.pick(m.active);
      return true;
    }
    if (event.key === "Escape") { this.closeMenu(); return true; }
    return false;
  }

  // "/" typed at the start of a line or after a space opens the menu; the text
  // typed after it filters. With no match the menu stays up saying so, until a
  // space ends the session or Backspace brings a match back.
  slashQuery() {
    const m = this.menu;
    if (!m || m.slashAt === null) return;
    const { $head } = this.view.state.selection;
    const start = $head.start();
    if ($head.pos < m.slashAt || m.slashAt < start || this.view.state.doc.textBetween(m.slashAt - 1, m.slashAt) !== "/") return this.closeMenu();
    m.query = this.view.state.doc.textBetween(m.slashAt, $head.pos);
    m.active = 0;
    if (/\s$/.test(m.query) && !this.menuItems(m).length) return this.closeMenu();
    this.renderMenu();
  }

  place() {
    const view = this.view;
    const st = view.state;
    const shellBox = this.shell.getBoundingClientRect();
    const edBox = view.dom.getBoundingClientRect();
    const i = this.blockIndex();
    let at = 0;
    for (let k = 0; k < i; k++) at += st.doc.child(k).nodeSize;
    const dom = view.nodeDOM(at);
    if (dom && dom.getBoundingClientRect) {
      const r = dom.getBoundingClientRect();
      const lineH = parseFloat(getComputedStyle(dom).lineHeight) || r.height;
      this.plus.style.setProperty("--page-plus-top", `${r.top - shellBox.top + Math.min(r.height, lineH) / 2}px`);
      this.plus.style.setProperty("--page-plus-left", `${r.left - shellBox.left}px`);
    }
    this.plus.style.setProperty("--page-text-left", `${edBox.left - shellBox.left}px`);

    const sel = st.selection;
    if (!this.bubble.hidden) {
      const a = view.coordsAtPos(sel.from), b = view.coordsAtPos(sel.to, -1);
      const mid = (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2;
      this.bubble.style.setProperty("--page-pop-x", `${mid - shellBox.left}px`);
      this.bubble.style.setProperty("--page-pop-y", `${Math.min(a.top, b.top) - shellBox.top}px`);
    }
    if (this.menu) {
      const m = this.menu;
      let left, top;
      if (m.slashAt !== null) {
        const c = view.coordsAtPos(m.slashAt - 1);
        left = c.left;
        top = c.bottom + 6;
        const height = this.menuEl.offsetHeight;
        if (top + height > window.innerHeight - 8 && c.top - 6 - height >= 8) top = c.top - 6 - height;
      } else {
        const r = m.anchor === this.plus ? (dom?.getBoundingClientRect?.() ?? edBox) : m.anchor.getBoundingClientRect();
        left = r.left;
        top = r.bottom + 6;
      }
      this.menuEl.style.setProperty("--page-pop-x", `${Math.max(8, Math.min(left - shellBox.left, shellBox.width - 280))}px`);
      this.menuEl.style.setProperty("--page-pop-y", `${top - shellBox.top}px`);
    }
  }

  update(view, prev) {
    this.view = view;
    if (this.menu && this.menu.slashAt === null && prev && prev.doc !== view.state.doc) this.closeMenu();
    const st = view.state;
    const node = st.doc.child(this.blockIndex());
    this.turn.textContent = `${blockTypeOf(node).label} ▾`;
    for (const b of this.dock.querySelectorAll("[data-cmd]")) b.setAttribute("aria-pressed", String(markActive(st, M[b.dataset.cmd])));
    const showBubble = !st.selection.empty && st.selection instanceof TextSelection && view.hasFocus();
    this.bubble.hidden = !showBubble;
    if (showBubble) for (const b of this.bubble.querySelectorAll("[data-cmd]")) b.setAttribute("aria-pressed", String(markActive(st, M[b.dataset.cmd])));
    this.slashQuery();
    this.place();
  }

  destroy() {
    clearTimeout(this.movedTimer);
    this.shell.removeEventListener("mousemove", this.onMove);
    this.shell.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("mousedown", this.onDocDown, true);
    for (const part of [this.dock, this.plus, this.bubble, this.scrim, this.menuEl]) part.remove();
  }
}

export function chromePlugin() {
  let chrome = null;
  return new Plugin({
    key: chromeKey,
    view(view) {
      chrome = new Chrome(view);
      return chrome;
    },
    props: {
      handleKeyDown(view, event) {
        if (!chrome) return false;
        if (event.key === "/" && (event.metaKey || event.ctrlKey) && !event.altKey && !chrome.menu) {
          event.preventDefault();
          chrome.openActions();
          return true;
        }
        return chrome.key(event);
      },
      handleTextInput(view, from, to, text) {
        if (text !== "/" || !chrome) return false;
        const $from = view.state.doc.resolve(from);
        if ($from.depth !== 1 || !$from.parent.isTextblock || $from.parent.type.spec.code) return false;
        if ($from.parentOffset > 0 && !/\s/.test(view.state.doc.textBetween(from - 1, from))) return false;
        view.dispatch(view.state.tr.insertText("/", from, to));
        chrome.openMenu("insert", chrome.plus, from + 1);
        return true;
      },
      handleDOMEvents: {
        blur(view) {
          if (chrome) chrome.bubble.hidden = true;
          return false;
        },
      },
    },
  });
}
