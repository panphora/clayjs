// The reader half of plugins=page. A Document opened in view mode follows saved
// files through the receive-only saved transport (sync/saved-stream.js): the first
// full body it accepts is the represented receipt, and start() projects exactly
// those bytes onto the article before any listener or tool mount exists. The editor
// half, plugins/page.js, is edit-only. resolveModules adds this module; no URL names
// it.
import { createSavedStream } from "../sync/saved-stream.js";
import { servedDocumentEtag } from "../core/host-attrs.js";
import { start } from "../page/view.js";

let reader = null;
let acquisition = null;
let settle = null;
let cancelled = false;

function acquire() {
  if (document.querySelectorAll("article[data-page]").length !== 1) return Promise.resolve(null);
  return new Promise((resolve) => {
    settle = resolve;
    const stream = createSavedStream({
      documentURL: window.location.href,
      servedEtag: servedDocumentEtag,
      onSnapshot: (candidate) => {
        if (cancelled) return false;
        try {
          reader = start({ represented: candidate, documentURL: window.location.href, servedEtag: servedDocumentEtag });
        } catch (error) {
          console.warn("clayjs: the reader could not start from the saved file", error);
          stream.stop();
          resolve(null);
          return true;
        }
        stream.stop();
        acquisition = null;
        resolve(reader);
        return true;
      },
      onStatus: (status) => {
        if (cancelled || status?.state !== "blocked") return;
        resolve(null);
      },
    });
    acquisition = stream;
    stream.start();
  });
}

export const ready = acquire();

export function stop() {
  cancelled = true;
  acquisition?.stop();
  acquisition = null;
  reader?.stop();
  reader = null;
  settle?.(null);
  settle = null;
}
