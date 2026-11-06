// The menu plugin: an Edit switch and claygoo in the top right, for anyone who can
// edit. Everything it draws is `clay="editor-ui"`, so none of it reaches the saved
// file, a sync frame, the dirty check or undo.
import { canEdit, isDraftMode, isEditMode, mode as startMode } from "../core/is-edit-mode.js";
import onDomReady from "../lib/dom-ready.js";
import { modeRefusalText } from "../core/mode-refusal.js";
import { MENU_BASE, MENU_FLOATING, MENU_SKIN, MENU_TOUCH, MENU_SURFACE } from "./menu/style.js";
import { attachPlacement } from "./menu/placement.js";
import { attachActions } from "./menu/actions.js";
import { attachPeople } from "./menu/people.js";
import { attachVariants } from "./menu/variants.js";
import { attachDomItems } from "./menu/dom-items.js";
import { followLook } from "../ui/page-colour.js";
import { createShell, TRACK } from "./menu/shell.js";
import { MENU_SAFETY } from "./menu/shell-style.js";

const SEO_ITEM = true;
const INTRO_GAP = 12;
const GRIP =
  '<svg viewBox="0 0 6 12" aria-hidden="true" focusable="false"><rect width="2" height="2"/><rect x="4" width="2" height="2"/>' +
  '<rect y="5" width="2" height="2"/><rect x="4" y="5" width="2" height="2"/><rect y="10" width="2" height="2"/><rect x="4" y="10" width="2" height="2"/></svg>';

// Built-in items keep fixed slots, so the order never depends on which plugin
// registered first. Any other id goes in its own section above the footer, in the
// order it was added.
// An item may also ask for the first or the last section with `section: "start" | "end"`.
const SECTIONS = [
  ["clay.undo", "clay.cms", "clay.ai", "clay.code"],
  ["seo", "clay.variants.keep", "clay.share", "clay.people"],
  ["clay.duplicate", "clay.download", "clay.export", "clay.reveal"],
  ["clay.versions"],
  null,
  ["clay.mode", "upgrade"],
];

// clay.mode is the live answer; the imported mode is the one the page booted with.
const currentMode = () =>
  window.clay && typeof window.clay.mode === "string" ? window.clay.mode : startMode;

function mount() {
  if (document.querySelector('clay-editor-ui[data-clay-ui="menu"]')) return;

  const shell = createShell({
    sections: SECTIONS,
    capsuleStart:
      `<button type="button" class="clay-menu-grip" aria-label="Move the menu. Drag it, or use the arrow keys to move it to another corner.">${GRIP}</button>` +
      `<button type="button" class="clay-menu-edit" part="edit" role="switch" aria-checked="false">` +
      TRACK +
      `<span class="clay-menu-label">Edit</span>` +
      `</button>` +
      `<span class="clay-menu-divider" aria-hidden="true"></span>`,
  });
  const { root, goo, slot, embedded, skin, addItem, removeItem, open, close, note: showNote, beforeOpen, focusedEl, mount: mountShell } = shell;
  const hideSwitch = embedded && slot.hasAttribute("no-edit-switch");
  const grip = root.querySelector(".clay-menu-grip");
  const edit = root.querySelector(".clay-menu-edit");

  if (embedded) {
    grip.hidden = true;
    if (hideSwitch) {
      edit.hidden = true;
      root.querySelector(".clay-menu-divider").hidden = true;
    }
  }

  let actions = null;
  let people = null;
  beforeOpen.push(() => {
    people?.close({ restore: false });
    actions?.refresh();
  });

  let busy = false;

  const applyHidden = () => {
    root.hidden = !canEdit && currentMode() !== "edit";
  };

  function setChecked() {
    edit.setAttribute("aria-checked", currentMode() === "edit" ? "true" : "false");
    if (hideSwitch) addItem({ id: "clay.mode", label: "Edit mode", toggle: true, checked: currentMode() === "edit", run: () => edit.click() });
  }
  setChecked();

  // The switch shows the mode that was committed, not the one a click asked for: a
  // change can land from the keyboard, from another plugin's lease or from a live entry
  // this menu did not start, and each commit is announced once on the document.
  document.addEventListener("clay:modechange", setChecked);

  edit.addEventListener("click", async () => {
    if (busy) return;
    const previous = edit.getAttribute("aria-checked");
    // Disabling the focused switch drops focus to the body; it goes back once the switch is done.
    const hadFocus = focusedEl() === edit;
    const next = currentMode() === "edit" ? "view" : "edit";
    busy = true;
    edit.setAttribute("aria-busy", "true");
    edit.disabled = true;
    let result;
    try {
      result = await window.clay?.setMode?.(next);
    } catch (err) {
      result = { ok: false, message: err && err.message };
    }
    // A reload is coming: stay busy until the page goes.
    if (result && result.reloading) return;
    busy = false;
    edit.removeAttribute("aria-busy");
    edit.disabled = false;
    if (hadFocus && edit.isConnected && !focusedEl() && document.activeElement === document.body) edit.focus();
    if (result && result.ok === false) {
      edit.setAttribute("aria-checked", previous);
      const text = modeRefusalText(result);
      if (text) showNote(text);
    } else {
      setChecked();
    }
  });

  // The intro sits at the top right in normal flow, so the group moves below its
  // bottom edge while it is on the page, and back when it goes.
  const doc = document;
  let introObserver = null;
  let watched = null;

  function place(intro) {
    if (root.dataset.corner.startsWith("top")) {
      root.style.top = `${Math.round(intro.getBoundingClientRect().bottom) + INTRO_GAP}px`;
    } else {
      root.style.removeProperty("top");
    }
  }

  const replace = () => {
    if (watched) place(watched);
    else root.style.removeProperty("top");
  };

  function watchIntro() {
    if (!root.isConnected) return;
    const intro = doc.querySelector(".clay-intro");
    if (intro === watched) return;
    if (introObserver) {
      introObserver.disconnect();
      introObserver = null;
    }
    watched = intro;
    if (!intro) {
      root.style.removeProperty("top");
      return;
    }
    if (typeof ResizeObserver === "function") {
      introObserver = new ResizeObserver(() => place(intro));
      introObserver.observe(intro);
    }
    place(intro);
  }

  const vars = document.createElement("style");
  vars.id = "clay-menu-vars";
  vars.setAttribute("clay", "editor-ui");
  document.head.append(vars);

  function reserveSpace() {
    const rect = root.getBoundingClientRect();
    vars.textContent =
      `:root { --clay-menu-width: ${Math.ceil(rect.width)}px; --clay-menu-height: ${Math.ceil(rect.height)}px; }`;
  }

  const css = embedded ? [MENU_SAFETY, MENU_BASE, skin ?? MENU_SKIN, MENU_TOUCH] : [MENU_SAFETY, MENU_BASE, MENU_FLOATING, MENU_SKIN, MENU_TOUCH];
  const ui = mountShell(css);
  if (!embedded) {
    attachPlacement({
      dock: root,
      container: ui.shadow,
      grip,
      storage: window.clay.storage && window.clay.storage.local,
      onMove: replace,
      onDragStart: () => {
        close();
        people?.close({ restore: false });
      },
    });
    reserveSpace();
    if (typeof ResizeObserver === "function") new ResizeObserver(reserveSpace).observe(root);

    new MutationObserver(watchIntro).observe(doc.body, { childList: true });
    watchIntro();
  }
  if (!skin) followLook(root, root.querySelector(".clay-menu"), MENU_SURFACE);

  const openSeo = () => import("./menu/seo.js").then((m) => m.open({ returnFocus: goo }));

  actions = attachActions({ addItem, note: showNote, currentMode });
  people = attachPeople({ root, capsule: root.querySelector(".clay-menu"), addItem, removeItem, closeMenu: close, note: showNote });
  attachVariants({ root, capsule: root.querySelector(".clay-menu"), addItem, removeItem, note: showNote, currentMode });
  attachDomItems({ addItem, removeItem, beforeOpen });

  if (SEO_ITEM) {
    addItem({
      id: "seo",
      label: "SEO settings…",
      run: openSeo,
    });

    const storage = window.clay.storage && window.clay.storage.session;
    if (storage && storage.get("reopen-seo") === true) {
      storage.remove("reopen-seo");
      openSeo().catch(() => {});
    }
  }

  // A view-mode owner's hint can be stale: the host's own answer decides, and a page the
  // host will not let this caller save hides the menu rather than offer a refused switch.
  followCapability = applyHidden;
  if (currentMode() !== "edit") import("../core/host-permission.js").then((m) => m.checkHostPermission()).catch(() => {});

  window.clay.menu = { addItem, removeItem, open, close, note: showNote, embedded, button: goo };
  document.dispatchEvent(new CustomEvent("clay:menu-ready"));
}

let mounted = false;
let followCapability = null;

const shouldMount = () => (canEdit || isEditMode) && !isDraftMode;

function mountOnce() {
  if (mounted || !shouldMount()) return;
  mounted = true;
  mount();
}

if (!isDraftMode) {
  onDomReady(mountOnce);
  document.addEventListener("clay:capabilitychange", () => {
    mountOnce();
    followCapability?.();
  });
}
