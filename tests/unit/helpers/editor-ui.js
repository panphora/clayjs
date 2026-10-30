import { deepActiveElement } from "../../../src/dom/active-element.js";

export const hostOf = (name) => document.querySelector(`clay-editor-ui[data-clay-ui="${name}"]`);

export const rootOf = (name) => hostOf(name)?.shadowRoot ?? null;

export function $(selector, name) {
  const root = name ? rootOf(name) : null;
  return (root || document).querySelector(selector);
}

export function $$(selector, name) {
  const root = name ? rootOf(name) : null;
  return Array.from((root || document).querySelectorAll(selector));
}

export const active = () => deepActiveElement();

export const sheetText = (name) => Array.from(rootOf(name).querySelectorAll("style"), (style) => style.textContent).join("\n");

export const toastStack = () => rootOf("toasts")?.querySelector("[data-clay-toasts]") ?? null;

export const toastText = () => toastStack()?.textContent ?? "";
