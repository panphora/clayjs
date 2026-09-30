// clay.quickcrop: the vendored cropper, framed by ClayJS's own Bevel dialog.
//
// quickcrop draws the crop stage; how it is framed is an adapter's job (its
// `modal` option). Left to itself it would wrap themodal by reaching for themodal's
// classes, which ClayJS's modal no longer has, or fall back to a frame of its own
// that a page stylesheet can repaint. So every request that would have landed on
// either ('auto', or a themodal-shaped object such as clay.modal, which is what the
// CMS passes) is framed here instead. 'builtin' and a caller's own adapter pass
// through untouched. The stage itself is quickcrop's, and so is its geometry.
import vendorQuickcrop from "../vendor/quickcrop.vendor.js";
import { bevelDialog, dismissOf, keepFocusIn } from "../ui/bevel-dialog.js";
import { bevelButton } from "../ui/bevel-controls.js";

const WIDTH = 844;

function isThemodal(m) {
  return !!m && typeof m === "object" &&
    typeof m.open === "function" && typeof m.close === "function" &&
    typeof m.onYes === "function" && "html" in m;
}

export const bevelCropAdapter = {
  // The stage has to fit inside the panel: the overlay's 16px inset, the panel's 2px
  // border and the inner padding (clamp(20px, 6vw, 40px) a side), with room below for
  // the button row. Widths come from clientWidth, which leaves out a classic scrollbar as the overlay does.
  fit() {
    const side = Math.min(40, Math.max(20, document.documentElement.clientWidth * 0.06));
    return {
      width: Math.max(120, Math.min(WIDTH, document.documentElement.clientWidth - 32) - 4 - 2 * side),
      height: Math.max(120, window.innerHeight - 220),
    };
  },
  open({ content, confirmLabel, onConfirm, onCancel }) {
    const { root, overlay, panel, body, footer, close } = bevelDialog({
      zIndex: "2147483001", width: `${WIDTH}px`, closable: true,
    });
    body.append(content);
    const confirm = bevelButton(confirmLabel, { variant: "primary", onClick: () => onConfirm() });
    footer.append(confirm);

    close.addEventListener("click", () => onCancel());
    panel.addEventListener("submit", (event) => event.preventDefault());
    let pressedOnBackdrop = false;
    overlay.addEventListener("mousedown", (event) => { pressedOnBackdrop = event.target === overlay; });
    overlay.addEventListener("click", (event) => {
      if (pressedOnBackdrop && event.target === overlay) onCancel();
      pressedOnBackdrop = false;
    });
    // Capture, and stopped there, so a dialog underneath (a CMS confirm through
    // clay.modal) does not take the same key as its own: Escape cancels this crop,
    // Tab stays inside it.
    const onKey = (event) => {
      if (event.key === "Tab") {
        event.stopPropagation();
        keepFocusIn(panel, event);
        return;
      }
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCancel();
    };
    document.addEventListener("keydown", onKey, true);

    // The page does not scroll behind the crop, as it did not under themodal. The
    // previous value comes back, so a modal underneath keeps its own lock.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      root.remove();
    };
    // A modal opened on top supersedes this crop the way it supersedes itself: the
    // crop is cancelled, so its promise settles and the next crop can open.
    dismissOf.set(root, () => { finish(); onCancel(); });

    root.setAttribute("aria-hidden", "false");
    document.body.append(root);
    confirm.focus();

    return { close: finish };
  },
};

export function quickcrop(file, options = {}) {
  const modal = options.modal ?? "auto";
  const framed = modal === "auto" || isThemodal(modal);
  return vendorQuickcrop(file, framed ? { ...options, modal: bevelCropAdapter } : options);
}

export default quickcrop;
