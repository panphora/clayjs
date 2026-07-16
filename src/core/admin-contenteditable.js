import { isEditMode, isOwner } from "./is-edit-mode.js";
import onDomReady from "../lib/dom-ready.js";
import { beforeSave } from "./snapshot.js";

export const SELECTOR = '[editmode\\:contenteditable]';

export function disableContentEditableBeforeSave () {
  beforeSave(docElem => {
    docElem.querySelectorAll(SELECTOR).forEach(resource => {
      const originalValue = resource.getAttribute("contenteditable");
      resource.setAttribute("inert-contenteditable", originalValue);
      resource.removeAttribute("contenteditable");
    });
  });
}

export function enableContentEditableForAdminOnPageLoad () {
  if (!isEditMode) return;

  onDomReady(() => {
    enableContentEditable();
  });
}

// Runtime toggle functions
export function enableContentEditable() {
  document.querySelectorAll(SELECTOR).forEach(el => {
    let val = el.getAttribute("inert-contenteditable");
    if (!["false", "plaintext-only"].includes(val)) val = "true";
    el.setAttribute("contenteditable", val);
    el.removeAttribute("inert-contenteditable");
  });
}

export function disableContentEditable() {
  document.querySelectorAll(SELECTOR).forEach(el => {
    const val = el.getAttribute("contenteditable") || "true";
    el.setAttribute("inert-contenteditable", val);
    el.removeAttribute("contenteditable");
  });
}

// Auto-initialize
export function init() {
  disableContentEditableBeforeSave();
  enableContentEditableForAdminOnPageLoad();
}
