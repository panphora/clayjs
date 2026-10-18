// The page editor's chrome: a faint toolbar, a plus button beside the caret's
// line, a toolbar over a text selection and a block menu (from the plus or "/").
// At rest everything is faint; moving the pointer adds .is-moved to the shell,
// which themes darken by a small step. All of it is themed through the
// --page-* tokens in editor.js (contract: default-page/v1/look/THEME-CONTRACT.md).
import { state, commands } from "../vendor/prosemirror.vendor.js";
import { schema } from "./schema.js";
import { BLOCK_TYPES, blockTypeOf, turnInto, insertAfter } from "./items.js";

export { BLOCK_TYPES, blockTypeOf, turnInto, insertAfter } from "./items.js";

const { Plugin, PluginKey, TextSelection } = state;
const M = schema.marks;

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

function toggleLink(view) {
  const st = view.state;
  if (markActive(st, M.link)) return commands.toggleMark(M.link)(st, view.dispatch);
  const href = window.prompt("Link to", "https://");
  if (!href || href === "https://") return false;
  return commands.toggleMark(M.link, { href })(st, view.dispatch);
}

function runMark(view, name) {
  if (name === "link") toggleLink(view);
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
    this.menuEl = el("div", "page-menu", { role: "menu", hidden: "" });
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
    return this.view.state.selection.$head.index(0);
  }

  fromPlus() {
    const st = this.view.state;
    const i = this.blockIndex();
    const node = st.doc.child(i);
    if (!(node.isTextblock && node.content.size === 0)) {
      this.view.dispatch(insertAfter(st, i).scrollIntoView());
    }
    this.view.focus();
    this.openMenu("turn", this.plus);
  }

  toggleMenu(mode, anchor) {
    if (this.menu) this.closeMenu();
    else this.openMenu(mode, anchor);
  }

  openMenu(mode, anchor, slashAt = null) {
    this.menu = { mode, anchor, slashAt, query: "", active: 0, items: BLOCK_TYPES };
    anchor.setAttribute("aria-expanded", "true");
    this.renderMenu();
  }

  closeMenu() {
    this.menu?.anchor.setAttribute("aria-expanded", "false");
    this.menu = null;
    this.menuEl.hidden = true;
    this.scrim.hidden = true;
  }

  renderMenu() {
    const m = this.menu;
    m.items = BLOCK_TYPES.filter((b) => b.label.toLowerCase().includes(m.query.toLowerCase()));
    if (!m.items.length) return this.closeMenu();
    m.active = Math.min(m.active, m.items.length - 1);
    const title = el("div", "page-menu-title");
    title.textContent = m.query ? `Turn into “${m.query}”` : "Turn into";
    const rows = m.items.map((b, i) => {
      const row = el("button", "page-menu-item", { type: "button", role: "menuitem", "data-index": String(i), "aria-selected": i === m.active ? "true" : "false" });
      const icon = el("span", "page-menu-icon");
      icon.textContent = b.icon;
      const label = el("span", "page-menu-label");
      label.textContent = b.label;
      row.append(icon, label);
      return row;
    });
    this.menuEl.replaceChildren(title, ...rows);
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
    const tr = turnInto(st, this.blockIndex(), item);
    if (tr) this.view.dispatch(tr.scrollIntoView());
    this.view.focus();
  }

  // Keys while the menu is open; anything else falls through to the editor.
  key(event) {
    const m = this.menu;
    if (!m) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      m.active = (m.active + (event.key === "ArrowDown" ? 1 : -1) + m.items.length) % m.items.length;
      this.renderMenu();
      return true;
    }
    if (event.key === "Enter") { this.pick(m.active); return true; }
    if (event.key === "Escape") { this.closeMenu(); return true; }
    return false;
  }

  // "/" typed in an empty block opens the menu; the text typed after it filters.
  slashQuery() {
    const m = this.menu;
    if (!m || m.slashAt === null) return;
    const { $head } = this.view.state.selection;
    const start = $head.start();
    if ($head.pos < m.slashAt || m.slashAt < start || this.view.state.doc.textBetween(m.slashAt - 1, m.slashAt) !== "/") return this.closeMenu();
    m.query = this.view.state.doc.textBetween(m.slashAt, $head.pos);
    m.active = 0;
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
      const r = this.menu.anchor === this.plus || this.menu.slashAt !== null ? (dom?.getBoundingClientRect?.() ?? edBox) : this.menu.anchor.getBoundingClientRect();
      const left = this.menu.anchor === this.turn ? r.left : r.left;
      this.menuEl.style.setProperty("--page-pop-x", `${Math.max(8, Math.min(left - shellBox.left, shellBox.width - 280))}px`);
      this.menuEl.style.setProperty("--page-pop-y", `${r.bottom - shellBox.top + 6}px`);
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
      handleKeyDown: (view, event) => chrome?.key(event) ?? false,
      handleTextInput(view, from, to, text) {
        if (text !== "/" || !chrome) return false;
        const $from = view.state.doc.resolve(from);
        if ($from.depth !== 1 || $from.parent.content.size !== 0 || $from.parent.type.spec.code) return false;
        view.dispatch(view.state.tr.insertText("/", from, to));
        chrome.openMenu("turn", chrome.plus, from + 1);
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
