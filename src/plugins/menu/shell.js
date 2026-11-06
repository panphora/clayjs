import CLAYGOO from "./claygoo.svg.js";
import { mountEditorUI } from "../../ui/editor-ui.js";

const SKIN_VERSION = "1";
const EDGE_GAP = 8;
const DISMISS_ICON = '<svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1 0 5 4l4-4 1 1-4 4 4 4-1 1-4-4-4 4-1-1 4-4-4-4z"/></svg>';
const ARROW_PREV = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"/></svg>';
const ARROW_NEXT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/></svg>';
export const TRACK = '<span class="clay-menu-track" aria-hidden="true"><span class="clay-menu-thumb"></span></span>';
const NOTE_MS = 6000;

// The first [clay-menu-slot] on the page holds the menu. With none, it floats in a corner.
function findSlot() {
  const slots = document.querySelectorAll("[clay-menu-slot]");
  if (slots.length > 1) console.warn("[clay] This page has more than one clay-menu-slot. The menu uses the first.");
  return slots[0] || null;
}

// A skin the page wrote, in <style clay-menu-skin="1" media="not all">. The media keeps it
// off the page itself. An unknown version means the default skin.
function pageSkin() {
  const style = document.querySelector("style[clay-menu-skin]");
  if (!style) return null;
  if (style.getAttribute("clay-menu-skin") !== SKIN_VERSION) {
    console.warn(`[clay] This runtime reads clay-menu-skin="${SKIN_VERSION}". The menu keeps its default look.`);
    return null;
  }
  return style.textContent;
}

export function createShell({ capsuleStart = "", sections = [null] } = {}) {
  const slotted = new Set(sections.flat().filter(Boolean));
  const slot = findSlot();
  const embedded = Boolean(slot);
  const skin = embedded ? pageSkin() : null;

  const root = document.createElement("div");
  root.className = "clay-menu-dock";
  root.setAttribute("clay", "editor-ui");
  root.setAttribute("part", "dock");
  if (embedded) root.dataset.embedded = "";
  root.dataset.corner = "top-right";
  root.innerHTML =
    `<div class="clay-menu" part="capsule" clay="editor-ui">` +
    capsuleStart +
    `<button type="button" class="clay-menu-goo" part="button" aria-haspopup="menu" aria-expanded="false" aria-label="Clay menu">${CLAYGOO}</button>` +
    `</div>` +
    `<div class="clay-menu-list" part="list" role="menu" aria-label="Clay menu" hidden></div>` +
    `<div class="clay-menu-note" part="note" role="status" hidden></div>`;

  const goo = root.querySelector(".clay-menu-goo");
  const list = root.querySelector(".clay-menu-list");
  const noteEl = root.querySelector(".clay-menu-note");
  const items = new Map();
  const beforeOpen = [];

  if (embedded) {
    const icon = slot.querySelector("template[clay-menu-icon]");
    if (icon) goo.replaceChildren(icon.content.cloneNode(true));
    const name = slot.getAttribute("clay-menu-label");
    if (name) {
      goo.setAttribute("aria-label", name);
      goo.title = name;
      list.setAttribute("aria-label", name);
    }
  }

  // Embedded, the list opens in the top layer, so a header's overflow cannot clip it.
  const topLayer = embedded && typeof list.showPopover === "function";
  if (topLayer) list.setAttribute("popover", "manual");

  function placeList() {
    const anchor = goo.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = list;
    const left = Math.max(EDGE_GAP, Math.min(anchor.right - width, window.innerWidth - width - EDGE_GAP));
    const below = anchor.bottom + EDGE_GAP;
    const top = below + height > window.innerHeight - EDGE_GAP ? Math.max(EDGE_GAP, anchor.top - height - EDGE_GAP) : below;
    list.style.left = `${Math.round(left)}px`;
    list.style.top = `${Math.round(top)}px`;
  }

  // Focus inside the shadow root: document.activeElement only ever names the host.
  const focusedEl = () => root.getRootNode().activeElement || null;
  const isOpen = () => !list.hidden;

  function setExpanded(open) {
    list.hidden = !open;
    goo.setAttribute("aria-expanded", open ? "true" : "false");
    if (!topLayer) return;
    if (open) {
      list.showPopover();
      placeList();
    } else if (list.matches(":popover-open")) {
      list.hidePopover();
    }
  }

  const buttons = () => [...list.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])')];

  function focusItem(index) {
    const all = buttons();
    if (!all.length) return;
    all[(index + all.length) % all.length].focus();
  }

  function close() {
    if (!isOpen()) return;
    setExpanded(false);
  }

  function open() {
    if (isOpen()) return;
    for (const fn of beforeOpen) fn();
    render();
    setExpanded(true);
  }

  function itemButton(item) {
    const link = item.href && !item.disabled;
    const button = document.createElement(link ? "a" : "button");
    if (link) {
      button.href = item.href;
      button.target = "_blank";
      button.rel = "noopener";
    } else {
      button.type = "button";
    }
    button.setAttribute("role", "menuitem");
    button.setAttribute("part", item.quiet ? "item quiet" : "item");
    button.dataset.menuId = item.id;
    if (item.badge && item.id === "upgrade") {
      const label = document.createElement("span");
      label.className = "clay-menu-upgrade";
      label.textContent = item.label;
      button.append(label);
    } else {
      button.textContent = item.label;
    }
    if (item.keys) {
      const kbd = document.createElement("kbd");
      kbd.textContent = item.keys;
      button.append(kbd);
    }
    if (item.toggle) {
      button.setAttribute("role", "menuitemcheckbox");
      button.setAttribute("aria-checked", item.checked ? "true" : "false");
      button.classList.add("clay-menu-toggle");
      button.insertAdjacentHTML("beforeend", TRACK);
    }
    if (item.disabled) button.setAttribute("aria-disabled", "true");
    button.addEventListener("click", () => {
      if (item.disabled) return;
      if (!item.toggle && !item.keepOpen) close();
      if (item.run) item.run({ anchor: goo });
    });
    return button;
  }

  function itemNode(item) {
    if (item.text) {
      const line = document.createElement("p");
      line.className = "clay-menu-version";
      line.setAttribute("part", "text");
      line.dataset.menuId = item.id;
      line.textContent = item.label;
      return line;
    }
    if (item.pair) {
      const pair = document.createElement("div");
      pair.className = "clay-menu-pair";
      pair.dataset.menuId = item.id;
      for (const part of item.pair) pair.append(itemButton(part));
      return pair;
    }
    if (item.stepper) return stepperRow(item);
    if (item.dismiss) return dismissibleRow(item);
    return itemButton(item);
  }

  function dismissibleRow(item) {
    const row = document.createElement("div");
    row.className = "clay-menu-row";
    row.dataset.menuId = item.id;
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.setAttribute("role", "menuitem");
    dismiss.setAttribute("part", "dismiss");
    dismiss.dataset.menuId = `${item.id}.dismiss`;
    dismiss.setAttribute("aria-label", item.dismiss.label);
    dismiss.title = item.dismiss.label;
    dismiss.innerHTML = DISMISS_ICON;
    dismiss.addEventListener("click", async () => {
      dismiss.disabled = true;
      let result;
      try {
        result = await item.dismiss.run?.();
      } catch (error) {
        console.warn("[clay] A menu item could not be removed.", error);
        dismiss.disabled = false;
        note("That didn't work. Try again.");
        return;
      }
      if (result === false) {
        dismiss.disabled = false;
        return;
      }
      removeItem(item.id);
    });
    row.append(itemButton(item), dismiss);
    return row;
  }

  function stepperRow(item) {
    const { label, value, prevLabel, nextLabel } = item.stepper;
    const row = document.createElement("div");
    row.className = "clay-menu-stepper";
    row.setAttribute("part", "stepper");
    row.dataset.menuId = item.id;
    const text = document.createElement("span");
    text.className = "clay-menu-stepper-label";
    text.textContent = label;
    const shown = document.createElement("span");
    shown.className = "clay-menu-stepper-value";
    shown.setAttribute("aria-live", "polite");
    shown.textContent = value;
    const step = (suffix, icon, name) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.setAttribute("part", "step");
      button.setAttribute("aria-label", name);
      button.dataset.menuId = `${item.id}.${suffix}`;
      button.innerHTML = icon;
      button.addEventListener("click", () => items.get(item.id)?.stepper?.[suffix]?.());
      return button;
    };
    row.append(text, step("prev", ARROW_PREV, prevLabel), shown, step("next", ARROW_NEXT, nextLabel));
    return row;
  }

  function grouped() {
    const inSection = (name) => [...items.values()].filter((item) => item.section === name);
    const extra = [...items.keys()].filter((id) => !slotted.has(id) && !items.get(id).section);
    const fixed = sections.map((ids) => (ids || extra).map((id) => items.get(id)).filter(Boolean));
    return [inSection("start"), ...fixed, inSection("end")].filter((group) => group.length);
  }

  function render() {
    const now = focusedEl();
    const focused = now && list.contains(now) ? now.dataset.menuId : null;
    list.textContent = "";
    grouped().forEach((group, index) => {
      if (index) {
        const sep = document.createElement("div");
        sep.className = "clay-menu-sep";
        sep.setAttribute("role", "separator");
        sep.setAttribute("part", "separator");
        list.append(sep);
      }
      for (const item of group) list.append(itemNode(item));
    });
    const dot = goo.querySelector(".clay-menu-dot");
    const wanted = [...items.values()].some((item) => item.badge);
    if (wanted && !dot) {
      const mark = document.createElement("span");
      mark.className = "clay-menu-dot";
      mark.setAttribute("aria-hidden", "true");
      goo.append(mark);
    } else if (!wanted && dot) {
      dot.remove();
    }
    if (focused) {
      const again = buttons().find((button) => button.dataset.menuId === focused);
      if (again) again.focus();
      else focusItem(0);
    }
  }

  const clean = ({ id, label, run, badge, keys, disabled, href, keepOpen }) => ({
    id,
    href: typeof href === "string" ? href : "",
    label: String(label ?? ""),
    run: typeof run === "function" ? run : null,
    badge: Boolean(badge),
    keys: keys ? String(keys) : "",
    disabled: Boolean(disabled),
    keepOpen: Boolean(keepOpen),
  });

  function addItem({ id, label, run, badge, keys, disabled, text, pair, href, section, quiet, dismiss, toggle, checked, keepOpen, stepper } = {}) {
    if (!id) return null;
    const item = clean({ id, label, run, badge, keys, disabled, href, keepOpen });
    if (section === "start" || section === "end") item.section = section;
    if (quiet) item.quiet = true;
    if (stepper) {
      item.stepper = {
        label: String(stepper.label ?? ""),
        value: String(stepper.value ?? ""),
        prev: typeof stepper.prev === "function" ? stepper.prev : null,
        next: typeof stepper.next === "function" ? stepper.next : null,
        prevLabel: String(stepper.prevLabel || "Previous"),
        nextLabel: String(stepper.nextLabel || "Next"),
      };
      const shown = [...list.querySelectorAll(".clay-menu-stepper")].find((row) => row.dataset.menuId === id)?.querySelector(".clay-menu-stepper-value");
      // Only the value changed: update it in place, so focus stays on the arrow. The
      // buttons read their callbacks from the stored item when pressed.
      const before = items.get(id);
      const same = before?.stepper && ["label", "prevLabel", "nextLabel"].every((key) => before.stepper[key] === item.stepper[key]) && before.section === item.section && before.quiet === item.quiet;
      if (same && shown) {
        items.set(id, item);
        shown.textContent = item.stepper.value;
        return id;
      }
    }
    if (text) item.text = true;
    if (Array.isArray(pair)) item.pair = pair.map(clean);
    if (toggle) {
      item.toggle = true;
      item.checked = Boolean(checked);
    }
    if (dismiss) item.dismiss = { label: String(dismiss.label || "Dismiss"), run: typeof dismiss.run === "function" ? dismiss.run : null };
    items.set(id, item);
    render();
    return id;
  }

  function removeItem(id) {
    if (items.delete(id)) render();
  }

  function note(text) {
    if (!text) return;
    noteEl.textContent = text;
    noteEl.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      noteEl.hidden = true;
      noteEl.textContent = "";
    }, NOTE_MS);
  }

  let noteTimer = 0;

  goo.addEventListener("click", () => {
    if (isOpen()) close();
    else open();
  });

  document.addEventListener("click", (event) => {
    if (isOpen() && !event.composedPath().includes(root)) close();
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!isOpen()) return;
      event.preventDefault();
      close();
      goo.focus();
      return;
    }
    if (event.target === goo && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (isOpen()) close();
      else {
        open();
        focusItem(0);
      }
      return;
    }
    if (!isOpen()) return;
    if (event.key === "Enter" && list.contains(event.target)) {
      event.preventDefault();
      event.target.click();
      return;
    }
    const all = buttons();
    if (!all.length) return;
    const at = all.indexOf(focusedEl());
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(at < 0 ? 0 : at + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(at < 0 ? all.length - 1 : at - 1);
    }
  });

  function mount(css) {
    const ui = mountEditorUI({ name: "menu", content: root, css, parent: slot || document.body, attributes: { "clay-mode-toggle": "" } });
    if (embedded) {
      window.addEventListener("resize", close);
      window.addEventListener("scroll", () => { if (topLayer && isOpen()) placeList(); }, { capture: true, passive: true });
    }
    return ui;
  }

  return { root, goo, list, slot, embedded, skin, items, addItem, removeItem, render, open, close, isOpen, note, beforeOpen, focusedEl, mount };
}
