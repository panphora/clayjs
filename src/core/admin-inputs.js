import { isEditMode, isOwner } from "./is-edit-mode.js";
import onDomReady from "../lib/dom-ready.js";
import { beforeSave } from "./snapshot.js";

export const SELECTOR_DISABLED = '[viewmode\\:disabled]';
export const SELECTOR_READONLY = '[viewmode\\:readonly]';

export function disableAdminInputsBeforeSave() {
  beforeSave(docElem => {
    docElem.querySelectorAll(SELECTOR_DISABLED).forEach(input => {
      input.setAttribute('disabled', '');
    });
    docElem.querySelectorAll(SELECTOR_READONLY).forEach(input => {
      input.setAttribute('readonly', '');
    });
  });
}

export function enableAdminInputsOnPageLoad() {
  if (!isEditMode) return;

  onDomReady(() => {
    enableAdminInputs();
  });
}

export function enableAdminInputs() {
  document.querySelectorAll(SELECTOR_DISABLED).forEach(input => {
    input.removeAttribute('disabled');
  });
  document.querySelectorAll(SELECTOR_READONLY).forEach(input => {
    input.removeAttribute('readonly');
  });
}

export function disableAdminInputs() {
  document.querySelectorAll(SELECTOR_DISABLED).forEach(input => {
    input.setAttribute('disabled', '');
  });
  document.querySelectorAll(SELECTOR_READONLY).forEach(input => {
    input.setAttribute('readonly', '');
  });
}

export function init() {
  disableAdminInputsBeforeSave();
  enableAdminInputsOnPageLoad();
}
