// View mode: readers see the saved article, and each newer file the host sends
// on the saved lane (every checkpoint is a save) is morphed into it. Live sync
// never touches a frozen element's contents, so this is the only writer here.
// No ProseMirror, no projection code: the writer's save already rendered it.
// A toggle the reader opened or closed keeps the reader's state across updates.
import { morph } from "../vendor/hyper-morph.vendor.js";

const ARTICLE = "article[data-page]";

export function applySavedArticle(html, doc = document, readerOpen = new Map(), savedOpen = new Map()) {
  const live = doc.querySelector(ARTICLE);
  if (!live || typeof html !== "string") return false;
  const incoming = new doc.defaultView.DOMParser().parseFromString(html, "text/html").querySelector(ARTICLE);
  if (!incoming) return false;
  for (const details of incoming.querySelectorAll("details[data-id]")) {
    const id = details.getAttribute("data-id");
    savedOpen.set(id, details.hasAttribute("open"));
    if (readerOpen.has(id)) details.toggleAttribute("open", readerOpen.get(id));
  }
  const rev = incoming.getAttribute("data-rev");
  if (rev && rev === live.getAttribute("data-rev") && incoming.innerHTML === live.innerHTML) return false;
  // raw: the sync policy ignores everything under [clay~=freeze], which is all of it.
  // Scripts never run: a tool's fallback is markup, and tools mount from the store.
  morph(live, incoming.innerHTML, { policy: "raw", morphStyle: "innerHTML", scripts: { handle: false }, key: (el) => el.getAttribute("data-id") || null });
  if (rev) live.setAttribute("data-rev", rev);
  return true;
}

// A toggle counts as the reader's own when its state differs from what the
// last saved article said: clicks, find-in-page and keyboard all fire `toggle`,
// and a toggle the morph caused matches the saved state.
export function startPageView(doc = document) {
  const readerOpen = new Map();
  const savedOpen = new Map();
  for (const details of doc.querySelectorAll(`${ARTICLE} details[data-id]`)) savedOpen.set(details.getAttribute("data-id"), details.hasAttribute("open"));
  const onToggle = (event) => {
    const details = event.target;
    if (details.tagName !== "DETAILS" || !details.closest(ARTICLE)) return;
    const id = details.getAttribute("data-id");
    if (!id) return;
    if (details.open === savedOpen.get(id)) readerOpen.delete(id);
    else readerOpen.set(id, details.open);
  };
  const onFrame = (event) => applySavedArticle(event.detail?.html, doc, readerOpen, savedOpen);
  doc.addEventListener("toggle", onToggle, true);
  doc.addEventListener("clay:sync-applied", onFrame);
  return () => {
    doc.removeEventListener("toggle", onToggle, true);
    doc.removeEventListener("clay:sync-applied", onFrame);
  };
}
