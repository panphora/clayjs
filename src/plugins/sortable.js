/*

   Make elements drag-and-drop sortable

   How to use:
   - add `sortable` attribute to an element to make children sortable
   - e.g. <div sortable></div>
   - add `onsorting` attribute to execute code during drag
   - e.g. <ul sortable onsorting="console.log('Dragging!')"></ul>
   - add `onsorted` attribute to execute code when items are sorted
   - e.g. <ul sortable onsorted="console.log('Items reordered!')"></ul>

   This wrapper conditionally loads the full Sortable.js vendor script (~118KB)
   only when in edit mode, using dynamic import().

*/
import { isEditMode } from "../core/is-edit-mode.js";
import Mutation from "../lib/mutation.js";
import { getVendorUrl } from "../lib/load-vendor-script.js";

function makeSortable(sortableElem, Sortable) {
  let options = {};

  // Check if Sortable instance already exists
  if (Sortable.get(sortableElem)) return;

  const groupName = sortableElem.getAttribute('sortable');
  if (groupName) options.group = groupName;

  // Check for handles, but exclude those inside nested sortable elements
  const handles = sortableElem.querySelectorAll('[sortable-handle]');
  const nestedSortables = sortableElem.querySelectorAll('[sortable]');

  // Check if any handle is NOT inside a nested sortable
  const hasDirectHandle = Array.from(handles).some(handle => {
    return !Array.from(nestedSortables).some(nested => nested.contains(handle));
  });

  if (hasDirectHandle) {
    options.handle = '[sortable-handle]';
  }

  // Add onsorting callback if attribute exists (fires during drag)
  const onsortingCode = sortableElem.getAttribute('onsorting');
  if (onsortingCode) {
    options.onMove = function(evt) {
      try {
        const asyncFn = new Function(`return (async function(evt) { ${onsortingCode} })`)();
        asyncFn.call(sortableElem, evt);
      } catch (error) {
        console.error('Error in onsorting execution:', error);
      }
    };
  }

  // After a drop, run any author onsorted code, then notify reactive libraries.
  const onsortedCode = sortableElem.getAttribute('onsorted');
  options.onEnd = function(evt) {
    if (onsortedCode) {
      try {
        const asyncFn = new Function(`return (async function(evt) { ${onsortedCode} })`)();
        asyncFn.call(sortableElem, evt);
      } catch (error) {
        console.error('Error in onsorted execution:', error);
      }
    }
    // SortableJS fires no native input/change on drop. Tell reactive libs that
    // listen for input (e.g. Sap re-derives its list order / $index; any other
    // input-driven library too) that the DOM order changed.
    sortableElem.dispatchEvent(new Event('input', { bubbles: true }));
  };

  Sortable.create(sortableElem, options);
}

async function init() {
  if (!isEditMode) return;

  // Load the vendor script
  const vendorUrl = getVendorUrl(import.meta.url, '../vendor/Sortable.vendor.js');
  await import(vendorUrl);
  const Sortable = window.Sortable;

  // Set up sortable on page load
  document.querySelectorAll('[sortable]').forEach(el => makeSortable(el, Sortable));

  // Set up listener for dynamically added elements.
  // require:'observed' so drag works inside no-save / save-* regions (e.g. the
  // CMS panel); pausable:false so it keeps wiring during a live-sync pause.
  Mutation.onAddElement({
    selectorFilter: "[sortable]",
    debounce: 200,
    require: 'observed',
    pausable: false
  }, (changes) => {
    changes.forEach(({ element }) => {
      makeSortable(element, Sortable);
    });
  });
}

// Auto-init when module is imported
init();

export { init };
export default init;
