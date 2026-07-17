import themodal from "./modal.js";
import onDomReady from "../lib/dom-ready.js";
import toast from "./toast.js";
import copyToClipboard from "../utils/copy-to-clipboard.js";

const CLOSE_BUTTON_SVG = `<svg viewBox="0 0 134 134" fill="none" xmlns="http://www.w3.org/2000/svg"><path class="micromodal__close-bg" d="M132 132.5 1 1.5h131v131Z" /><path class="micromodal__close-x" fill-rule="evenodd" clip-rule="evenodd" d="M0 0h3v1.5h1.5V3H6v1.5h1.5V6H9v1.5h1.5V9H12v1.5h1.5V12H15v1.5h1.5V15H18v1.5h1.5V18H21v1.5h1.5V21H24v1.5h1.5V24H27v1.5h1.5V27H30v1.5h1.5V30H33v1.5h1.5V33H36v1.5h1.5V36H39v1.5h1.5V39H42v1.5h1.5V42H45v1.5h1.5V45H48v1.5h1.5V48H51v1.5h1.5V51H54v1.5h1.5V54H57v1.5h1.5V57H60v1.5h1.5V60H63v1.5h1.5V63H66v1.5h1.5V66H69v1.5h1.5V69H72v1.5h1.5V72H75v1.5h1.5V75H78v1.5h1.5V78H81v1.5h1.5V81H84v1.5h1.5V84H87v1.5h1.5V87H90v1.5h1.5V90H93v1.5h1.5V93H96v1.5h1.5V96H99v1.5h1.5V99h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v1.5h1.5v3h-3V132H129v-1.5h-1.5V129H126v-1.5h-1.5V126H123v-1.5h-1.5V123H120v-1.5h-1.5V120H117v-1.5h-1.5V117H114v-1.5h-1.5V114H111v-1.5h-1.5V111H108v-1.5h-1.5V108H105v-1.5h-1.5V105H102v-1.5h-1.5V102H99v-1.5h-1.5V99H96v-1.5h-1.5V96H93v-1.5h-1.5V93H90v-1.5h-1.5V90H87v-1.5h-1.5V87H84v-1.5h-1.5V84H81v-1.5h-1.5V81H78v-1.5h-1.5V78H75v-1.5h-1.5V75H72v-1.5h-1.5V72H69v-1.5h-1.5V69H66v-1.5h-1.5V66H63v-1.5h-1.5V63H60v-1.5h-1.5V60H57v-1.5h-1.5V57H54v-1.5h-1.5V54H51v-1.5h-1.5V51H48v-1.5h-1.5V48H45v-1.5h-1.5V45H42v-1.5h-1.5V42H39v-1.5h-1.5V39H36v-1.5h-1.5V36H33v-1.5h-1.5V33H30v-1.5h-1.5V30H27v-1.5h-1.5V27H24v-1.5h-1.5V24H21v-1.5h-1.5V21H18v-1.5h-1.5V18H15v-1.5h-1.5V15H12v-1.5h-1.5V12H9v-1.5H7.5V9H6V7.5H4.5V6H3V4.5H1.5V3H0V0ZM108.8 22h5.2v5.1h-2.6v2.6H109v2.6h-2.6v2.6h-2.6v2.5h-2.6v5.2h2.6V45h2.6v2.6h2.6v2.6h2.5v2.6h2.6V58h-5.1v-2.6h-2.6V53h-2.6v-2.6h-2.6v-2.6h-2.5v-2.6h-5.2v2.6H91v2.6h-2.6v2.6h-2.6v2.5h-2.6V58H78v-5.1h2.6v-2.6H83v-2.6h2.6v-2.6h2.6v-2.5h2.6v-5.2h-2.6V35h-2.6v-2.6h-2.6v-2.6h-2.5v-2.6H78V22h5.2v2.6h2.5V27h2.6v2.6h2.6v2.6h2.5v2.6h5.2v-2.6h2.5v-2.6h2.6v-2.6h2.6v-2.5h2.5V22Z" /></svg>`;
const CONFIRM_BUTTON_SVG = `<div style="width: 28px;"><svg viewBox="0 0 60 33" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M34.5 0.75H43.5V5.25H49V9.75H54.5V14.25H60V18.75H54.5V23.25H49V27.75H43.5V32.25H34.5V27.75H40V23.25H45.5V18.75H0V14.25H45.5V9.75H40V5.25H34.5V0.75Z" fill="white"/></svg></div>`;

function createModal(promptText, yesCallback, extraContent = "", includeInput = false, defaultValue = "") {
  const inputHtml = includeInput
    ? `<div><input class="micromodal__input" type="text" value="${defaultValue}" required></div>`
    : "";

  themodal.html = `<div>
    <div class="micromodal__heading">${promptText}</div>
    ${inputHtml}
    ${extraContent}
  </div>`;
  themodal.closeHtml = CLOSE_BUTTON_SVG;
  themodal.yes = CONFIRM_BUTTON_SVG;

  const promise = new Promise((resolve, reject) => {
    themodal.onYes(() => {
      let promptResult;
      if (includeInput) {
        promptResult = document.querySelector(".micromodal__input").value;
        if (!promptResult) return false; // keep modal open on empty input
      }
      // Run the validation callback synchronously so a throw can keep the
      // modal open (callers rely on this — e.g. delete-site confirms by
      // throwing when the typed name doesn't match).
      if (yesCallback) {
        try {
          yesCallback(promptResult);
        } catch (err) {
          toast(err.message || 'An error occurred', 'error');
          return false; // keep modal open, user can retry
        }
      }
      // Defer resolve so downstream .then() handlers don't fire inside this
      // modal's onYes loop — themodal is a singleton, and chained ask()/
      // consent() calls need a clean themodal to set up their state.
      setTimeout(() => resolve(promptResult), 0);
      return true; // allow modal to close
    });

    themodal.onNo = () => {
      setTimeout(reject, 0);
    };
  });

  themodal.open();

  setTimeout(() => {
    const modalContainer = document.querySelector('.micromodal-parent');
    if (modalContainer) {
      modalContainer.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-copy]');
        if (btn) {
          copyToClipboard(btn.dataset.copy);
          toast('Copied', 'success');
        }
      });
    }
  }, 0);

  // Fire-and-forget callers (e.g. consent(msg, cb) with no await) don't consume
  // the reject path; dismissal now rejects, so swallow it here to avoid an
  // unhandled rejection. Awaiters still observe the rejection via their await.
  promise.catch(() => {});

  return promise;
}

// Public API functions
export function ask(promptText, yesCallback, defaultValue = "", extraContent = "") {
  return createModal(promptText, yesCallback, extraContent, true, defaultValue);
}

export function consent(promptText, yesCallback, extraContent = "") {
  return createModal(promptText, yesCallback, extraContent, false);
}

/**
 * Display an informational modal with a title and optional content paragraphs
 * @param {string} promptText - The title/heading text
 * @param {...string} content - Additional content paragraphs (variadic)
 * @returns {Promise} Resolves when user confirms, rejects on close
 */
export function tell(promptText, ...content) {
  const contentHtml = content.length > 0
    ? content.map(c => `<div class="micromodal__tell-content">${c}</div>`).join("")
    : "";

  themodal.html = `<div class="micromodal__tell">
    <div class="micromodal__tell-title">${promptText}</div>
    ${contentHtml}
  </div>`;
  themodal.closeHtml = CLOSE_BUTTON_SVG;
  themodal.yes = CONFIRM_BUTTON_SVG;

  const promise = new Promise((resolve, reject) => {
    themodal.onYes(() => {
      setTimeout(resolve, 0);
      return true;
    });

    themodal.onNo = () => {
      setTimeout(reject, 0);
    };
  });

  themodal.open();

  // See createModal: swallow the reject for fire-and-forget tell() callers;
  // awaiters still observe it via their await.
  promise.catch(() => {});

  return promise;
}

/**
 * Display a modal with a code snippet and copy functionality
 * @param {string} title - The modal heading
 * @param {string} content - The code to display
 * @param {string} extraContent - Optional raw HTML rendered below the copy button.
 *   Callers style their own container; use `<div class="snippet-warning">…</div>`
 *   for the standard yellow-bordered warning box.
 */
export function snippet(title, content, extraContent = '') {

  // Create the modal content with copy button
  const modalContent = `
    <div class="snippet-code-block">
      <pre>${content}</pre>
    </div>

    <button type="button" class="micromodal__secondary-btn copy-snippet-btn" style="margin-bottom: 14px;">copy</button>

    ${extraContent || ''}
  `;

  // Use the existing modal system
  themodal.html = `<div>
    <div class="micromodal__heading">${title}</div>
    ${modalContent}
  </div>`;

  themodal.closeHtml = CLOSE_BUTTON_SVG;
  themodal.yes = '';

  const promise = new Promise((resolve) => {
    // Local copy function
    const handleCopy = function(event) {
      if (event.target.closest('.copy-snippet-btn')) {
        copyToClipboard(content);
        toast('Copied to clipboard!', 'success');
      }
    };

    // Add event listener to the modal container after it opens
    setTimeout(() => {
      const modalContainer = document.querySelector('.micromodal-parent');
      if (modalContainer) {
        modalContainer.addEventListener('click', handleCopy);
      }
    }, 0);

    themodal.onYes(() => {
      // Clean up the event listener synchronously — the DOM may be torn down
      // before our deferred resolve fires otherwise.
      const modalContainer = document.querySelector('.micromodal-parent');
      if (modalContainer) {
        modalContainer.removeEventListener('click', handleCopy);
      }
      setTimeout(resolve, 0);
      return true;
    });

    themodal.onNo = () => {
      const modalContainer = document.querySelector('.micromodal-parent');
      if (modalContainer) {
        modalContainer.removeEventListener('click', handleCopy);
      }
      setTimeout(resolve, 0);
    };
  });

  themodal.open();

  return promise;
}

// Auto-initialize - cleanup any leftover modal elements
export function init() {
  onDomReady(() => {
    const micromodalParentElem = document.querySelector(".micromodal-parent");
    if (micromodalParentElem) {
      micromodalParentElem.remove();
      document.body.style.overflow = "";
    }
  });
}

// Auto-init when module is imported
init();
