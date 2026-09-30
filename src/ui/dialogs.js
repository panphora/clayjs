import themodal from "./modal.js";
import onDomReady from "../lib/dom-ready.js";
import toast from "./toast.js";
import copyToClipboard from "../utils/copy-to-clipboard.js";
import { bevelBox, bevelButton, bevelInput, bevelText, protectIcon } from "./bevel-controls.js";
import { TOKENS, FONT_SANS, FONT_MONO } from "./bevel.js";

// The confirm arrow, drawn in the button's own ink so it follows the primary button.
function confirmArrow() {
  const holder = document.createElement("span");
  holder.innerHTML = '<svg viewBox="0 0 60 33" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M34.5 0.75H43.5V5.25H49V9.75H54.5V14.25H60V18.75H54.5V23.25H49V27.75H43.5V32.25H34.5V27.75H40V23.25H45.5V18.75H0V14.25H45.5V9.75H40V5.25H34.5V0.75Z" fill="currentColor"/></svg>';
  const svg = holder.firstElementChild;
  protectIcon(svg, 28);
  return svg;
}

// Leaves room on the right for the corner close.
function heading(markup) {
  const el = bevelText("div", [
    "display:flex", "flex-direction:column", "gap:2px", "margin:0 0 14px", "padding-inline-end:36px",
    `font:600 22px/1.25 ${FONT_SANS}`, "letter-spacing:-.01em", "overflow-wrap:anywhere",
  ]);
  el.innerHTML = markup;
  return el;
}

// Caller markup (promptText, extraContent, tell's paragraphs) goes in as it is: those
// are markup by design, and callers pass elements through them. Only the frame around
// it is ClayJS's to style.
function createModal(promptText, yesCallback, extraContent = "", includeInput = false, defaultValue = "") {
  const content = bevelBox("div", ["display:block"]);
  content.append(heading(promptText));
  let input = null;
  if (includeInput) {
    input = bevelInput("input", { rules: ["margin:0 0 14px"] });
    input.setAttribute("value", String(defaultValue));
    input.required = true;
    content.append(input);
  }
  content.insertAdjacentHTML("beforeend", extraContent);

  themodal.html = content;
  themodal.closeHtml = "x";
  themodal.yes = confirmArrow();

  const promise = new Promise((resolve, reject) => {
    themodal.onYes(() => {
      let promptResult;
      if (includeInput) {
        promptResult = input.value;
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
    const modalContainer = document.querySelector('[data-clay-modal]');
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
  const box = bevelBox("div", ["display:flex", "flex-direction:column", "gap:20px", "max-width:440px", "margin:0 0 6px"]);
  box.append(bevelText("div", [`font:600 22px/1.25 ${FONT_SANS}`, "padding-inline-end:36px", "overflow-wrap:anywhere"]));
  box.firstChild.innerHTML = promptText;
  for (const c of content) {
    const paragraph = bevelText("div", [`font:16px/1.55 ${FONT_SANS}`, `color:${TOKENS["ink-2"]}`, "overflow-wrap:anywhere"]);
    paragraph.innerHTML = c;
    box.append(paragraph);
  }

  themodal.html = box;
  themodal.closeHtml = "x";
  themodal.yes = confirmArrow();

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
 *   Callers style their own container.
 */
export function snippet(title, content, extraContent = '') {
  const box = bevelBox("div", ["display:block"]);
  const well = bevelBox("div", [
    "display:block", "max-width:100%", "overflow-x:auto", "margin:0 0 14px", "padding:14px 16px",
    `background:${TOKENS.sunk}`, `border:1px solid ${TOKENS.line}`,
  ]);
  const pre = bevelText("pre", ["display:block", "margin:0", "white-space:nowrap", `font:13px/1.6 ${FONT_MONO}`]);
  pre.innerHTML = content;
  well.append(pre);
  const copy = bevelButton("copy", {
    small: true,
    extra: ["margin:0 0 14px"],
    onClick: () => {
      copyToClipboard(content);
      toast('Copied to clipboard!', 'success');
    },
  });
  box.append(heading(title), well, copy);
  box.insertAdjacentHTML("beforeend", extraContent || "");

  themodal.html = box;
  themodal.closeHtml = "x";
  themodal.yes = '';

  const promise = new Promise((resolve) => {
    themodal.onYes(() => {
      setTimeout(resolve, 0);
      return true;
    });

    themodal.onNo = () => {
      setTimeout(resolve, 0);
    };
  });

  themodal.open();

  return promise;
}

// Auto-initialize - cleanup any leftover modal elements
export function init() {
  onDomReady(() => {
    const micromodalParentElem = document.querySelector("[data-clay-modal]");
    if (micromodalParentElem) {
      micromodalParentElem.remove();
      document.body.style.overflow = "";
    }
  });
}

// Auto-init when module is imported
init();
