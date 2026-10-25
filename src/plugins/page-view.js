// The reader half of plugins=page. A Document opened in view mode follows saved
// files through the receive-only saved transport (sync/saved-stream.js): the first
// full body it accepts is the represented receipt, and start() projects exactly
// those bytes onto the article before any listener or tool mount exists. The editor
// half, plugins/page.js, is edit-only. resolveModules adds this module; no URL names
// it.
//
// When the resolved plan also carries generic sync, sync already streams the saved
// lane: this module opens no stream of its own and takes the frames that lane
// applied instead. The loader passes that choice from the plan it resolved, so the
// reader never reparses the script URL to guess what else is loaded.
import { createSavedStream } from "../sync/saved-stream.js";
import { servedDocumentEtag } from "../core/host-attrs.js";
import { start as startReader } from "../page/view.js";

let reader = null;
let acquisition = null;
let settle = null;
let cancelled = false;

// The promise the loader holds clay:ready for: it settles once the reader has
// started its saved transport, or null with no single article, so clay:ready
// never waits on the network and fires even if the stream never opens.
export let ready = null;

// The first saved file's outcome: the started reader, or null on a blocked or
// recoverable status. The stream keeps running after that null, so a later
// accepted file still starts one. Await this, not `ready`, for the file.
export let acquired = null;

const oneArticle = () => document.querySelectorAll("article[data-page]").length === 1;

function acquire() {
  if (!oneArticle()) return Promise.resolve(null);
  return new Promise((resolve) => {
    settle = resolve;
    const stream = createSavedStream({
      documentURL: window.location.href,
      servedEtag: servedDocumentEtag,
      onSnapshot: (candidate) => {
        if (cancelled) return false;
        try {
          // The reader adopts this same stream: one connection carries the file from
          // acquisition onward, so a save that lands while the reader starts is not
          // lost between two streams.
          reader = startReader({ represented: candidate, documentURL: window.location.href, servedEtag: servedDocumentEtag, stream });
        } catch (error) {
          // An unreadable body leaves the article on screen untouched and is never
          // acknowledged; the stream stays open for the next saved file.
          console.warn("clayjs: the reader could not start from the saved file", error);
          return false;
        }
        acquisition = null;
        resolve(reader);
        return true;
      },
      // A blocked or recoverable first read settles acquired with no reader. The
      // stream keeps running, so a later accepted file still starts one, and
      // `ready` has already settled without waiting for either.
      onStatus: (status) => {
        if (cancelled) return;
        if (status?.state === "blocked" || status?.state === "recoverable") resolve(null);
      },
    });
    acquisition = stream;
    stream.start();
  });
}

// Generic sync owns the saved lane here, so the reader takes its frames from that
// lane's accepted disk applies and keeps no stream of its own.
function followSync() {
  if (!oneArticle()) return Promise.resolve(null);
  try {
    reader = startReader({ feed: document, documentURL: window.location.href });
  } catch (error) {
    console.warn("clayjs: the reader could not start over the page sync projects", error);
    return Promise.resolve(null);
  }
  return Promise.resolve(reader);
}

/**
 * Start the reader for the page in front of it. `sync` reports whether the plan
 * the loader resolved carries generic sync, and therefore whether the saved lane
 * already has an owner.
 */
export function start({ sync = false } = {}) {
  if (ready) return ready;
  cancelled = false;
  acquired = sync ? followSync() : acquire();
  // With generic sync the reader starts before this returns, so both promises
  // settle together; otherwise only the transport starts here and the first
  // file arrives later, from the stream.
  ready = sync ? acquired : Promise.resolve(null);
  return ready;
}

export function stop() {
  cancelled = true;
  acquisition?.stop();
  acquisition = null;
  reader?.stop();
  reader = null;
  settle?.(null);
  settle = null;
}
