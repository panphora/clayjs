// View mode: readers see the saved article, and each newer file the host sends
// on the saved lane (every checkpoint is a save) is morphed into it. Live sync
// never touches a frozen element's contents, so this is the only writer here.
// No ProseMirror, no projection code: the writer's save already rendered it.
// A toggle the reader opened or closed keeps the reader's state across updates.
import { morph } from "../vendor/hyper-morph.vendor.js";
import { createToolHost } from "./tools.js";

const ARTICLE = "article[data-page]";
const TOOL = 'section[data-type="tool"][data-id]';

export function applySavedArticle(html, doc = document, readerOpen = new Map(), savedOpen = new Map(), preserveTools = new Set()) {
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
  const kept = new Map();
  for (const root of live.querySelectorAll(TOOL)) {
    const id = root.getAttribute("data-id");
    if (!preserveTools.has(id)) continue;
    kept.set(id, root);
    root.replaceWith(root.cloneNode(false));
  }
  // raw: the sync policy ignores everything under [clay~=freeze], which is all of it.
  // Scripts never run: a tool's fallback is markup, and tools mount from the store.
  morph(live, incoming.innerHTML, {
    policy: "raw", morphStyle: "innerHTML", scripts: { handle: false },
    key: (el) => el.getAttribute("data-id") || null,
  });
  for (const root of live.querySelectorAll(TOOL)) {
    const original = kept.get(root.getAttribute("data-id"));
    if (original) root.replaceWith(original);
  }
  if (rev) live.setAttribute("data-rev", rev);
  return true;
}

// A toggle counts as the reader's own when its state differs from what the
// last saved article said: clicks, find-in-page and keyboard all fire `toggle`,
// and a toggle the morph caused matches the saved state.
export function startPageView(doc = document) {
  const readerOpen = new Map();
  const savedOpen = new Map();
  const mounted = new Map();
  const toolStore = { data: {} };
  const host = createToolHost({ store: toolStore, mode: "view" });
  let stopped = false;
  let sequence = 0;
  for (const details of doc.querySelectorAll(`${ARTICLE} details[data-id]`)) savedOpen.set(details.getAttribute("data-id"), details.hasAttribute("open"));
  const onToggle = (event) => {
    const details = event.target;
    if (details.tagName !== "DETAILS" || !details.closest(ARTICLE)) return;
    const id = details.getAttribute("data-id");
    if (!id) return;
    if (details.open === savedOpen.get(id)) readerOpen.delete(id);
    else readerOpen.set(id, details.open);
  };
  const toolsIn = async (source) => {
    if (!source.querySelector(`${ARTICLE} ${TOOL}`)) return null;
    const tag = source.querySelector('script[type="application/json"][merge="page"]');
    if (!tag) return null;
    const value = JSON.parse(tag.textContent);
    const { readYValue } = await import("./ybind/external.js");
    const { blocks } = await readYValue(value);
    const stateTag = source.querySelector('script[type="application/json"][merge="page.tools"]');
    const state = stateTag ? JSON.parse(stateTag.textContent) : {};
    return { blocks, state };
  };
  const syncTools = (decoded) => {
    toolStore.data = decoded?.state ?? {};
    const seen = new Set();
    for (const root of doc.querySelectorAll(`${ARTICLE} ${TOOL}`)) {
      const id = root.getAttribute("data-id");
      seen.add(id);
      const block = decoded?.blocks?.[id];
      const old = mounted.get(id);
      if (!block || block.t !== "tool" || !block.artifact || !block.rev) {
        old?.instance.dispose();
        mounted.delete(id);
        continue;
      }
      if (old && old.root === root && old.rev === block.rev && JSON.stringify(old.artifact) === JSON.stringify(block.artifact)) continue;
      old?.instance.dispose();
      mounted.set(id, { root, rev: block.rev, artifact: block.artifact, instance: host.mount(root, {
        id, artifact: block.artifact, rev: block.rev, seed: block.state,
      }) });
    }
    for (const [id, old] of mounted) if (!seen.has(id)) { old.instance.dispose(); mounted.delete(id); }
  };
  const onFrame = (event) => {
    const html = event.detail?.html;
    if (typeof html !== "string") return;
    const source = new doc.defaultView.DOMParser().parseFromString(html, "text/html");
    const turn = ++sequence;
    const incomingIds = new Set([...source.querySelectorAll(`${ARTICLE} ${TOOL}`)].map((el) => el.getAttribute("data-id")));
    const preserve = new Set([...mounted.keys()].filter((id) => incomingIds.has(id)));
    for (const [id, old] of mounted) if (!incomingIds.has(id)) { old.instance.dispose(); mounted.delete(id); }
    applySavedArticle(html, doc, readerOpen, savedOpen, preserve);
    if (!incomingIds.size) {
      syncTools(null);
      return;
    }
    toolsIn(source).then((decoded) => {
      if (stopped || turn !== sequence) return;
      syncTools(decoded);
    }).catch((error) => {
      if (stopped || turn !== sequence) return;
      console.warn("clayjs: could not decode saved tools", error);
      applySavedArticle(html, doc, readerOpen, savedOpen);
      syncTools(null);
    });
  };
  doc.addEventListener("toggle", onToggle, true);
  doc.addEventListener("clay:sync-applied", onFrame);
  if (doc.querySelector(`${ARTICLE} ${TOOL}`)) {
    const turn = ++sequence;
    toolsIn(doc).then((decoded) => { if (!stopped && turn === sequence) syncTools(decoded); })
      .catch((error) => { if (!stopped) console.warn("clayjs: could not decode saved tools", error); });
  }
  return () => {
    stopped = true;
    sequence++;
    host.dispose();
    doc.removeEventListener("toggle", onToggle, true);
    doc.removeEventListener("clay:sync-applied", onFrame);
  };
}
