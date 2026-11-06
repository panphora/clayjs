import { createShell } from "./shell.js";
import { attachDomItems } from "./dom-items.js";
import { MENU_SAFETY, SHELL_BASE, SHELL_FLOATING, MENU_SKIN, MENU_TOUCH } from "./shell-style.js";
import { activeLook, labelOf, looks, nameOf, paintLook } from "./looks.js";

function attachLooks({ addItem, removeItem, slot }) {
  const announce = () => {
    const name = activeLook() && nameOf(activeLook());
    document.dispatchEvent(new CustomEvent("clay:variant-change", { detail: { active: name, shown: name } }));
  };
  const draw = () => {
    const all = looks();
    if (all.length < 2 || !slot?.hasAttribute("clay-menu-looks")) return removeItem("clay.look");
    const current = activeLook();
    const by = (delta) => () => choose(nameOf(all[(all.indexOf(activeLook()) + delta + all.length) % all.length]));
    addItem({
      id: "clay.look",
      section: "start",
      stepper: {
        label: "Switch look",
        value: `${labelOf(current)} ${all.indexOf(current) + 1}/${all.length}`,
        prev: by(-1),
        next: by(1),
        prevLabel: "Previous look",
        nextLabel: "Next look",
      },
    });
  };
  const choose = (name) => {
    if (!looks().some((style) => nameOf(style) === name)) return { ok: false, code: "unknown-variant" };
    document.documentElement.setAttribute("look", name);
    paintLook(name);
    window.clay?.save?.soon?.();
    draw();
    announce();
    return { ok: true };
  };
  if (looks().length >= 2) {
    window.clay.variants = {
      list: () => looks().map((style) => ({ name: nameOf(style), label: labelOf(style), active: style === activeLook() })),
      get active() {
        return activeLook() && nameOf(activeLook());
      },
      get shown() {
        return activeLook() && nameOf(activeLook());
      },
      preview: choose,
      choose,
      keep: () => Promise.resolve({ ok: false, code: "not-editing" }),
    };
    document.addEventListener("clay:drafts-restored", () => {
      draw();
      announce();
    });
    draw();
  }
}

export function start() {
  if (document.querySelector('clay-editor-ui[data-clay-ui="menu"]')) return;
  const shell = createShell({ sections: [null] });
  const { slot, embedded, skin, addItem, removeItem, open, close, note, goo } = shell;
  shell.mount(embedded ? [MENU_SAFETY, SHELL_BASE, skin ?? MENU_SKIN, MENU_TOUCH] : [MENU_SAFETY, SHELL_BASE, SHELL_FLOATING, MENU_SKIN, MENU_TOUCH]);
  attachLooks({ addItem, removeItem, slot });
  addItem({ id: "clay.download", label: "Download a copy", run: () => window.clay.visitorDrafts.download() });
  attachDomItems(shell);
  window.clay.menu = { addItem, removeItem, open, close, note, embedded, button: goo };
  document.dispatchEvent(new CustomEvent("clay:menu-ready"));
}
