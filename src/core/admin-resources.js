import { isEditMode, isOwner } from "./is-edit-mode.js";
import onDomReady from "../lib/dom-ready.js";
import { beforeSave } from "./snapshot.js";

export const SELECTOR = '[editmode\\:resource]:is(style, link, script)';
export const SELECTOR_INERT = '[editmode\\:resource]:is(style, link, script)[type^="inert/"]';

export function disableAdminResourcesBeforeSave () {
  beforeSave(docElem => {
    docElem.querySelectorAll(SELECTOR).forEach(resource => {
      const currentType = resource.getAttribute('type') || 'text/javascript';
      if (!currentType.startsWith('inert/')) {
        resource.setAttribute('type', `inert/${currentType}`);
      }
    });
  });
}

export function enableAdminResourcesOnPageLoad () {
  if (!isEditMode) return;

  onDomReady(() => {
    enableAdminResources();
  });
}

// Runtime toggle functions
export function enableAdminResources() {
  document.querySelectorAll(SELECTOR_INERT).forEach(resource => {
    resource.type = resource.type.replace(/inert\//g, '');
    resource.replaceWith(resource.cloneNode(true));
  });
}

export function disableAdminResources() {
  document.querySelectorAll(SELECTOR).forEach(resource => {
    const currentType = resource.getAttribute('type') || 'text/javascript';
    if (!currentType.startsWith('inert/')) {
      resource.setAttribute('type', `inert/${currentType}`);
      resource.replaceWith(resource.cloneNode(true));
    }
  });
}

// Auto-initialize
export function init() {
  disableAdminResourcesBeforeSave();
  enableAdminResourcesOnPageLoad();
}
