import { createFeatureLoader } from "../page/feature-loader.js";
import { FEATURES, featureForType } from "../page/features/registry.js";
import { mergeEngine } from "../sync/merge-engine.js";
import { serializeLive } from "../live/ops.js";
import { registerUnsavedState } from "../lib/unsaved-state.js";
import { hostMeta, hostSupports } from "../core/host-meta.js";
import { savePageForce, setLastSavedBaselines, holdAllSaves, releaseAllSaves, getLastSavedBytes } from "../core/save.js";
import { captureForComparisonAndDirty, captureForSaveAndComparison } from "../core/snapshot.js";
import { storeOf, checkpointWithin, requestCheckpoint, fastLane, pageLaneReady, pageWriterReady } from "./live.js";
import { parseJsonRelaxed } from "../vendor/hyper-morph-json.vendor.js";
import { saveStateFor, BLOCKED_TEXT, RETRY_TEXT, downloadPageCopy, downloadSnapshot, copyPageText } from "../page/save-states.js";
import toast, { toastPersistent, dismissPersistent } from "../ui/toast.js";
import { claim } from "../page/runtime-owner.js";
import { authorIdentity } from "../page/ybind/author.js";
import { createInstall, disposeInstall, addDisposer, finishError, isCurrent, ownsView, runBoot } from "../page/boot.js";
import { capabilityAdvertised } from "../page/tool-capability.js";
import { toolViews } from "../page/tool-views.js";
import { style } from "../lib/hostile-css.js";

const ARTICLE_SEL = "article[data-page]";
const TAG_SEL = 'script[type="application/json"][merge="page"][clay~="live"]';
const BLOCKED = { state: "blocked", code: "unsupported-host", message: "This host does not support page editing" };
const RETRY_BOUND_MS = 45000;
const GENERIC_ERROR = "Couldn't save";
const GENERIC_OFFLINE = "Offline, not saved";
const REPLACED_TEXT = "This page was changed outside the editor. Reload to see it.";
const TOO_LARGE_TEXT = "That change is too large to share, so it was not saved. Reload the page to keep editing.";
const OVERWRITTEN_TEXT = "Some changes you made were replaced by a change made outside the editor.";
const REPLACED_HOLD = "The page was changed outside the editor; reload to see it.";
const LOADING_MS = 150;
const LOADING_TEXT = "Loading the editor\u2026";

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// A tag that is not a page this release reads. It is decided from the JSON alone, so a
// page that cannot be booted says so without the page's own code.
function unreadablePage(value) {
  if (!isPlainObject(value)) {
    console.warn("clayjs: page plugin: the page tag is not JSON, leaving the page as saved HTML");
    return "invalid-page-json";
  }
  if (value.v !== 1 || !isPlainObject(value.y) || Object.hasOwn(value, "blocks") || Object.hasOwn(value, "deleted")) {
    console.warn("clayjs: page plugin: the page tag is not a strict Yjs page, leaving the page as saved HTML");
    return "unsupported-page-format";
  }
  return null;
}

// The page's own code reaches ProseMirror and Yjs, so it is a separate download: the
// plugin chunk evaluates without either vendor, and the room join starts while they
// arrive. The editor step and the binding step both ask for it, and a page holds one
// copy. A step that needs it awaits pageCodeReady(); the synchronous paths read
// pageCode, which the boot has awaited before the room's state reaches them.
let pageCode = null;
let pageCodeLoading = null;
function pageCodeReady() {
  // The first import is the file the page was read from: it brings the projection,
  // the decoder and both vendors, and the rest ask for what it already holds.
  pageCodeLoading ??= import("../page/adopt-boot.js").then((adoptBoot) => Promise.all([
    import("../page/adopt.js"),
    import("../page/merge.js"),
    import("../page/projection.js"),
    import("../page/save-projection.js"),
    import("../page/ybind/decode.js"),
    import("../page/ybind/binding.js"),
    import("../page/ybind/provider.js"),
    import("../page/ybind/migrate.js"),
  ]).then(([adopt, merge, projection, saveProjection, decode, binding, provider, migrate]) => {
    pageCode = {
      installAdoption: adoptBoot.installAdoption,
      ADOPTION_TIMEOUT_MS: adoptBoot.ADOPTION_TIMEOUT_MS,
      classifyFile: adopt.classifyFile,
      readBack: adopt.readBack,
      mergePageModels: merge.mergePageModels,
      canon: projection.canon,
      renderFromTags: saveProjection.renderFromTags,
      blocksFromYValue: decode.blocksFromYValue,
      createYPageBinding: binding.createYPageBinding,
      yValueOf: provider.yValueOf,
      seedPageFromArticle: migrate.seedPageFromArticle,
    };
    return pageCode;
  }));
  return pageCodeLoading;
}

// The recovery list hangs off the mounted view and the title follows its heading, so
// these arrive with the editor's code rather than beside the room join.
async function mountCodeReady(code) {
  const [recover, title] = await Promise.all([
    import("../page/recover.js"),
    import("../page/document-title-runtime.js"),
  ]);
  return Object.assign(code, {
    createRecoverList: recover.createRecoverList,
    focusBlock: recover.focusBlock,
    observeDocumentTitle: title.observeDocumentTitle,
  });
}

// The parts a document asks for, read off the document itself: the state a view holds
// can have gained a block the saved article never had, from the room or from an
// adoption, and input waits for those parts as it does for the saved article's.
function docFeatureIds(doc) {
  const ids = new Set();
  doc.forEach((node) => {
    const id = featureForType(node.type.name);
    if (id) ids.add(id);
  });
  return [...ids];
}

// A wait longer than a moment says so. One quiet line inside the article, drawn as
// editor UI so it never reaches a snapshot, and gone the moment the boot settles.
function clearLoadingStatus(inst) {
  if (inst.statusTimer) {
    clearTimeout(inst.statusTimer);
    inst.statusTimer = null;
  }
  inst.statusNote?.remove();
  inst.statusNote = null;
}

function armLoadingStatus(inst, article) {
  clearLoadingStatus(inst);
  inst.statusTimer = setTimeout(() => {
    inst.statusTimer = null;
    if (!isCurrent(inst)) return;
    const note = article.ownerDocument.createElement("div");
    note.className = "page-boot-status";
    note.setAttribute("clay", "editor-ui");
    note.setAttribute("sap-ignore", "");
    note.setAttribute("role", "status");
    style(note, [
      "display:block", "margin:0 0 1em", "font:500 13px/1.6 system-ui, sans-serif",
      "color:color-mix(in srgb, currentColor 55%, transparent)", "user-select:none",
    ]);
    note.textContent = LOADING_TEXT;
    article.prepend(note);
    inst.statusNote = note;
  }, LOADING_MS);
}

let generation = 0;
let active = null;
// A boot that ends in error says so after the installation it ended is gone, so the
// result outlives the dispose that releases what that boot started.
let ended = null;

// Shorter than installAdoption's 10 s hold, so an unelected room still adopts.
export const WRITER_WAIT_MS = 8_000;

function scrollToHashBlock(view, loc = globalThis.location) {
  const raw = loc?.hash?.slice(1);
  if (!raw) return;
  let id;
  try { id = decodeURIComponent(raw); } catch { return; }
  let found = -1;
  view.state.doc.forEach((node, pos) => { if (found < 0 && node.attrs.id === id) found = pos; });
  if (found < 0) return;
  globalThis.requestAnimationFrame?.(() => view.nodeDOM(found)?.scrollIntoView?.({ block: "start" }));
}

function dispatchState(state, code, message) {
  document.dispatchEvent(new CustomEvent("clay:page-save-state", { detail: { state, code, message } }));
}

function dismissGeneric() {
  dismissPersistent(GENERIC_ERROR);
  dismissPersistent(GENERIC_OFFLINE);
}

function clearRetry(inst) {
  if (inst.retryTimer) {
    clearTimeout(inst.retryTimer);
    inst.retryTimer = null;
  }
  inst.retryShown = false;
  dismissPersistent(RETRY_TEXT);
}

function armRetry(inst, code, message) {
  dismissGeneric();
  dispatchState("retrying", code, message);
  // One clock for a run of temporary failures: a later retry of the same save
  // does not push the bound out again, and once it has passed the toast stands.
  if (inst.retryTimer || inst.retryShown) return;
  inst.retryTimer = setTimeout(() => {
    inst.retryTimer = null;
    inst.retryShown = true;
    toastPersistent(RETRY_TEXT, "warning");
  }, RETRY_BOUND_MS);
}

function showBlocked(inst, code, message) {
  clearRetry(inst);
  dismissGeneric();
  dispatchState("blocked", code, message);
  toastPersistent(BLOCKED_TEXT, "error", {
    detail: message,
    actions: [
      { label: "Download a copy", onClick: downloadPageCopy },
      { label: "Copy text", onClick: copyPageText },
    ],
  });
}

function showSaved(inst) {
  clearRetry(inst);
  dismissPersistent(BLOCKED_TEXT);
  dispatchState("saved", null, "");
}

// The first save of a seeded page is the page's only admission: a room opened on a file
// without the tag holds no page store, so nothing may join until that write landed. It
// outlives the installation that started it, so a replacement that arrives while it is
// on the wire waits for its outcome instead of joining, and the tag it writes stays in
// the document only once the file has it.
let firstSave = null;

const forgetFirstSave = (entry) => {
  if (firstSave === entry) firstSave = null;
};

// A boot that ends before the outcome keeps nothing of the tag it generated: the file
// has not been written, so the document must not hold a tag that says it has.
function writeSeedTag(source) {
  const tag = source.seedTag;
  const article = source.element;
  if (tag && !tag.isConnected && article?.isConnected && !document.querySelector(TAG_SEL)) article.before(tag);
  let request;
  try {
    request = savePageForce();
  } finally {
    tag?.remove();
  }
  return request;
}

// The tag the first save wrote, back in the document where readSource found the
// article: one tag, exactly as the file now has it.
function attachSeedTag(source) {
  const tag = source.seedTag;
  if (!tag || tag.isConnected) return;
  if (document.querySelector(TAG_SEL)) return;
  const article = source.element;
  if (article?.isConnected) article.before(tag);
}

function seededFirstSave(source) {
  if (firstSave) return firstSave.promise;
  const entry = { promise: null };
  try {
    entry.promise = Promise.resolve(writeSeedTag(source));
  } catch (error) {
    return Promise.reject(error);
  }
  firstSave = entry;
  entry.promise.then((result) => { if (!result?.ok) forgetFirstSave(entry); }, () => forgetFirstSave(entry));
  return entry.promise;
}

// An incoming document with no page tag whose article is not the one this tab
// last saved: something outside the editor replaced the page, and this tab's
// state no longer belongs to the file.
// On a host that keeps no page data every file comes untagged and is merged
// instead (adopt-boot.js); only a file with no lone article replaced the page.
function pageReplaced(html, savedRev, mergeTagless = false) {
  if (typeof html !== "string" || !html) return false;
  let doc;
  try { doc = new DOMParser().parseFromString(html, "text/html"); } catch { return false; }
  const articles = doc.querySelectorAll(ARTICLE_SEL);
  if (mergeTagless) return articles.length !== 1 && !doc.querySelector(TAG_SEL);
  if (articles.length !== 1 || doc.querySelector(TAG_SEL)) return false;
  return articles[0].getAttribute("data-rev") !== savedRev;
}

function savedRevOf(inst) {
  if (!inst.store || !pageCode) return inst.savedRev;
  try { return pageCode.renderFromTags([JSON.stringify(inst.store.value)]).rev; } catch { return inst.savedRev; }
}

// Nothing of this tab's may reach the file again: the editor is read-only, the
// binding is detached from the store (no frame, no flush), and every save is
// held, so the old article cannot be written back over the replacement.
function stopEditing(inst) {
  const view = inst.view;
  if (view) {
    view.setProps({ editable: () => false });
    view.setProps({ dispatchTransaction: (tr) => view.updateState(view.state.apply(tr)) });
  }
  try { inst.binding?.dispose(); } catch (error) { console.error("clayjs: page plugin binding failed to dispose", error); }
  if (inst.savesHeld) return;
  inst.savesHeld = true;
  holdAllSaves(REPLACED_HOLD);
}

// The tab's own page, when the store no longer holds it (another page replaced it, or the
// room refused it): the saved document with the article rendered from the tab's document.
function downloadTabCopy(inst) {
  if (!inst.tabValue) return downloadPageCopy();
  const { forSave } = captureForSaveAndComparison();
  const doc = new DOMParser().parseFromString(forSave, "text/html");
  const articles = doc.querySelectorAll(ARTICLE_SEL);
  if (articles.length !== 1) return downloadPageCopy();
  const rendered = pageCode.renderFromTags([JSON.stringify(inst.tabValue)]);
  articles[0].innerHTML = rendered.html;
  if (rendered.rev == null) articles[0].removeAttribute("data-rev");
  else articles[0].setAttribute("data-rev", rendered.rev);
  return downloadSnapshot(`<!DOCTYPE html>\n${doc.documentElement.outerHTML}`);
}

function stopWithNotice(inst, text) {
  if (inst.replaced) return;
  inst.replaced = true;
  stopEditing(inst);
  toastPersistent(text, "warning", {
    actions: [
      { label: "Reload", onClick: () => window.location.reload() },
      { label: "Download your copy", onClick: () => downloadTabCopy(inst) },
    ],
  });
}

const showReplaced = (inst) => stopWithNotice(inst, REPLACED_TEXT);
const showTooLarge = (inst) => stopWithNotice(inst, TOO_LARGE_TEXT);

function applySaveState(inst, state, code, message) {
  if (state === "saved") showSaved(inst);
  else if (state === "retrying") armRetry(inst, code, message);
  else if (state === "blocked") showBlocked(inst, code, message);
}

function listen(inst, type, handler) {
  document.addEventListener(type, handler);
  inst.listeners.push([type, handler]);
}

function listenForSaves(inst) {
  listen(inst, "clay:save-error", (event) => {
    const code = event.detail?.code ?? null;
    applySaveState(inst, saveStateFor({ code }), code, event.detail?.msg ?? "");
  });
  listen(inst, "clay:save-offline", (event) => {
    const code = event.detail?.code ?? null;
    applySaveState(inst, saveStateFor({ code, offline: true }), code, event.detail?.msg ?? "");
  });
  listen(inst, "clay:save-conflict", (event) => {
    const code = event.detail?.code ?? null;
    applySaveState(inst, saveStateFor({ code }), code, event.detail?.msg ?? "");
  });
  listen(inst, "clay:save-saved", (event) => {
    applySaveState(inst, saveStateFor({ ok: true }), null, event.detail?.msg ?? "");
    inst.savedRev = savedRevOf(inst);
    inst.adoption?.saved(getLastSavedBytes());
  });
  listen(inst, "clay:live-notice", (event) => {
    if (event.detail?.name !== "page") return;
    if (event.detail?.code === "op-too-large") return;
    if (event.detail?.code === "unknown-store") {
      showReplaced(inst);
      return;
    }
    const code = event.detail?.code ?? null;
    applySaveState(inst, saveStateFor({ code }), code, event.detail?.message ?? "");
  });
}

function restoreArticle(inst) {
  const article = inst.article;
  if (!article) return;
  let html = inst.bootHtml;
  let rev = inst.bootRev;
  if (inst.store && pageCode) {
    try {
      const rendered = pageCode.renderFromTags([JSON.stringify(inst.store.value)]);
      html = rendered.html;
      rev = rendered.rev;
    } catch (error) {
      console.error("clayjs: page plugin could not render the saved article", error);
    }
  }
  article.innerHTML = html;
  if (rev == null) article.removeAttribute("data-rev");
  else article.setAttribute("data-rev", rev);
}

// What a mounted editor installs besides its view: the document listeners that
// follow saves and replacements, the room's subscription to it, its unsaved
// participant, the recovery list, the tool views and this install's claim on the
// article. A boot that ends without an editor releases the same resources here, so
// nothing stays wired to a view that is gone.
function releaseMounted(inst) {
  for (const [type, handler] of inst.listeners) document.removeEventListener(type, handler);
  inst.listeners = [];
  try { inst.adoption?.dispose(); } catch (error) { console.error("clayjs: page plugin adoption failed to dispose", error); }
  inst.adoption = null;
  try { inst.recover?.destroy(); } catch (error) { console.error("clayjs: page plugin recover list failed to dispose", error); }
  inst.recover = null;
  inst.aiTool?.dispose();
  inst.aiTool = null;
  inst.toolHost?.dispose();
  inst.toolHost = null;
  if (inst.view) toolViews.delete(inst.view);
  if (inst.article) {
    const shell = inst.article.querySelector(".page-shell");
    if (shell) shell.remove();
  }
  try { inst.binding?.dispose(); } catch (error) { console.error("clayjs: page plugin binding failed to dispose", error); }
  try { inst.binding?.ydoc?.destroy(); } catch (error) { console.error("clayjs: page plugin document failed to destroy", error); }
  inst.binding = null;
  inst.flush = null;
  inst.releaseArticle?.();
  inst.releaseArticle = null;
}

// Adoption did not land, so this tab must not hold a view of its own making: the
// mounted editor and everything it subscribed are released, its shell leaves the
// article, and the article comes back from the state the room accepted (or the
// source captured before the mount). The editor's own DOM is never read back into
// the page.
function abandonEditor(inst) {
  const view = inst.view;
  if (view && !view.isDestroyed && typeof view.destroy === "function") {
    try { view.destroy(); } catch (error) { console.error("clayjs: page plugin view failed to destroy", error); }
  }
  inst.titleObserver?.dispose();
  inst.titleObserver = null;
  clearLoadingStatus(inst);
  releaseMounted(inst);
  restoreArticle(inst);
}

function dispose() {
  generation += 1;
  const inst = active;
  active = null;
  if (!inst) return;
  disposeInstall(inst);
  if (inst.retryTimer) {
    clearTimeout(inst.retryTimer);
    inst.retryTimer = null;
  }
  dismissPersistent(RETRY_TEXT);
  dismissPersistent(BLOCKED_TEXT);
  dismissPersistent(REPLACED_TEXT);
  for (const message of inst.notices?.values() ?? []) dismissPersistent(message);
  if (inst.savesHeld) {
    inst.savesHeld = false;
    releaseAllSaves({ replay: false, reason: REPLACED_HOLD });
  }
  inst.titleObserver?.dispose();
  inst.titleObserver = null;
  clearLoadingStatus(inst);
  if (inst.view && !inst.view.isDestroyed) {
    try { inst.view.destroy(); } catch (error) { console.error("clayjs: page plugin view failed to destroy", error); }
  }
  releaseMounted(inst);
  restoreArticle(inst);
}

export function createSteps(inst, options) {
  let meta = null;
  let binding = null;
  let editorView = null;
  let editorReadyResolve = null;
  let identity = null;
  let features = null;
  let featuresReady = null;
  let savedContent = [];
  let initialSave = false;
  let toolsStore = null;
  let aiTool = null;
  let toolsOpening = null;

  // The view parts install onto the editor, which exists only after the mount; an
  // install that starts before it waits here, and a disposed install releases it.
  const editorReady = new Promise((resolve) => { editorReadyResolve = resolve; });
  inst.editorReadyResolve = editorReadyResolve;
  addDisposer(inst, () => editorReadyResolve?.());
  addDisposer(inst, () => clearLoadingStatus(inst));

  // A document with a tool block, at boot or when one arrives, opens the store its
  // tools keep state in and the host that mounts them. A document with no tool
  // never waits for either.
  const TOOLS_SEL = 'script[type="application/json"][merge="page.tools"][clay~="live"]';
  const openTools = () => {
    if (toolsOpening) return toolsOpening;
    toolsOpening = (async () => {
      // A tool written into the article by hand or by an agent arrives without the
      // store its state lives in, and without one the tool could not keep its state:
      // the page gets the empty store an editor-made page starts with.
      if (!document.querySelector(TOOLS_SEL)) {
        const tools = document.createElement("script");
        tools.setAttribute("type", "application/json");
        tools.setAttribute("merge", "page.tools");
        tools.setAttribute("clay", "live");
        tools.textContent = "{}";
        document.head.appendChild(tools);
      }
      if (document.querySelector(TOOLS_SEL)) {
        try {
          toolsStore = window.clay.live("page.tools");
          await toolsStore.ready;
        } catch (error) {
          console.warn("clayjs: page plugin could not open the tool store", error);
        }
      }
      if (!isCurrent(inst)) return null;
      const [{ createToolHost }, { tablesFromDoc }] = await Promise.all([
        import("../page/tools.js"),
        import("../page/tool-data.js"),
      ]);
      if (!isCurrent(inst)) return null;
      const toolHost = createToolHost({
        store: toolsStore, mode: "edit",
        tables: () => tablesFromDoc(editorView?.state.doc ?? binding.doc()).map(({ id, cols, rows }) => ({ id, cols, rows })),
      });
      inst.toolHost = toolHost;
      if (capabilityAdvertised(meta)) {
        const { createAiTool } = await import("../page/ai-tool.js");
        if (!isCurrent(inst)) return null;
        const transport = window.clay?.wire?.pageTool ?? options.transport ?? null;
        aiTool = createAiTool({ getView: () => inst.view, store: toolsStore, transport, acceptState: options.acceptState });
        inst.aiTool = aiTool;
      }
      return toolHost;
    })().catch((error) => {
      toolsOpening = null;
      throw error;
    });
    return toolsOpening;
  };
  // One notice per feature a person needed and that failed, until Retry succeeds.
  const notices = new Map();
  const notifyFailed = (id) => {
    if (notices.has(id)) return;
    const message = `The ${id} controls could not load. Reload the page after saving.`;
    notices.set(id, message);
    toastPersistent(message, "warning", {
      actions: [{
        label: "Retry",
        onClick: () => {
          features.ensure(id).then(() => {
            const open = notices.get(id);
            if (!open) return;
            notices.delete(id);
            dismissPersistent(open);
          }, () => {});
        },
      }],
    });
  };
  inst.notices = notices;
  // Making or revising a tool opens the store and the host first, so the panel
  // keeps what it makes.
  const openAi = async ({ target = null, remove = null } = {}) => {
    const { holdSlashRange, heldSlashRange } = await import("../page/chrome.js");
    if (editorView && remove) holdSlashRange(editorView, remove);
    await features.ensure("tool").catch(() => {});
    if (!isCurrent(inst) || !aiTool || !editorView) return;
    aiTool.open({ target, remove: remove ? heldSlashRange(editorView.state) : null });
  };
  const aiRequested = () => capabilityAdvertised(meta);

  // The article, its page tag and the file they describe, or the reason the page
  // is not edit mode's to mount. The file it found is captured here, before anything
  // moves; what the tag decodes to is the page's own code's to say, so it arrives in
  // source.ready while the room joins, and the join never waits for it.
  function readSource(inst) {
    const articles = document.querySelectorAll(ARTICLE_SEL);
    const tags = document.querySelectorAll(TAG_SEL);
    if (!articles.length && !tags.length) return { ok: false, reason: "no-page" };
    // A page saved without its merge state (HTML Clay, an outside edit, a download)
    // is booted from its article alone: the seed is deterministic, so every tab
    // rebuilding the same article holds the same state and their edits merge. The tag
    // that states it is built here but reaches the document only for the first save
    // that writes it, so a boot that ends before that save leaves no tag behind for
    // the next install to read as a page the file already has.
    const seeded = articles.length === 1 && tags.length === 0;
    if (articles.length !== 1 || (!seeded && tags.length !== 1)) {
      console.warn(`clayjs: page plugin needs exactly one article[data-page] and one merge="page" live tag; found ${articles.length} article(s) and ${tags.length} tag(s), leaving the page as saved HTML`);
      return { ok: false, reason: "ambiguous-page" };
    }
    const element = articles[0];
    // A tag this tab can read on its own is read here, so a page it cannot boot says so
    // before the room is opened.
    let value = null;
    if (!seeded) {
      try { value = parseJsonRelaxed(tags[0].textContent); } catch (error) { value = null; }
      const unreadable = unreadablePage(value);
      if (unreadable) return { ok: false, reason: unreadable };
    }
    const source = { article: element.cloneNode(true), tags: value ? [value] : null, element, blocks: null, seeded, seedTag: null };
    source.ready = (async () => {
      const code = await pageCodeReady();
      if (!isCurrent(inst)) return { ok: false, cancelled: true };
      if (seeded) {
        try {
          const seedTag = document.createElement("script");
          seedTag.setAttribute("type", "application/json");
          seedTag.setAttribute("merge", "page");
          seedTag.setAttribute("clay", "live");
          seedTag.textContent = serializeLive(code.seedPageFromArticle(element.cloneNode(true)));
          source.seedTag = seedTag;
          value = parseJsonRelaxed(seedTag.textContent);
        } catch (error) {
          console.warn("clayjs: page plugin could not rebuild the page it found, leaving the page as saved HTML", error);
          return { ok: false, reason: "invalid-page-source" };
        }
        const unreadable = unreadablePage(value);
        if (unreadable) return { ok: false, reason: unreadable };
        source.tags = [value];
      }
      try {
        source.blocks = code.blocksFromYValue(value);
      } catch (error) {
        console.warn("clayjs: page plugin: the page tag is not a valid Yjs page, leaving the page as saved HTML", error);
        return { ok: false, reason: "invalid-page-json" };
      }
      return { ok: true };
    })();
    armLoadingStatus(inst, element);
    return { ok: true, source };
  }

  // The editor's code, the page's own code and the feature views the saved article
  // demands are separate downloads, and they start together here beside the room join.
  // Nothing evaluates the editor until the coordinator calls it; the parts are
  // installed at the mount, so a failed one is the loader's own Retry notice there.
  async function loadEditorAssets(inst, source) {
    const editorImport = import("../page/editor.js");
    editorImport.catch(() => null);
    const codeImport = pageCodeReady();
    codeImport.catch(() => null);
    const read = await source.ready;
    if (!read.ok) return read;
    if (!isCurrent(inst)) return { ok: false, cancelled: true };
    const featureIds = [...new Set(Object.values(source.blocks).map((block) => featureForType(block.t)).filter(Boolean))];
    features = createFeatureLoader({
      load: (id) => FEATURES[id].load(),
      install: async (id, mod) => {
        if (!editorView) await editorReady;
        if (!isCurrent(inst) || !editorView) return null;
        const context = { view: editorView, upload: options.upload, board: binding.board, undo: binding.undo, redo: binding.redo, revise: aiRequested() ? (toolId, rev) => { openAi({ target: { toolId, rev } }); } : null };
        if (id === "tool") {
          context.toolHost = await openTools();
          if (!isCurrent(inst)) return null;
        }
        return editor.installPageFeature(context, id, mod);
      },
      reportError: (error, id) => {
        console.error("clayjs: an editor feature failed to load", error);
        notifyFailed(id);
      },
    });
    // The fetch only warms the module: the install waits for the mounted view, and the
    // boot waits for that install before it enables input. A failure here is reported
    // by that install, which offers the feature's Retry.
    for (const id of featureIds) features.prepare(id).catch(() => null);
    let editor = null;
    let code = null;
    try {
      const [editorModule, codeModule] = await Promise.all([editorImport, codeImport]);
      editor = editorModule;
      code = await mountCodeReady(codeModule);
    } catch (error) {
      // A host that blocked the download keeps the saved article and reads this reason.
      console.error("clayjs: page plugin could not load the editor", error);
      return { ok: false, reason: "editor-assets-failed" };
    }
    if (!isCurrent(inst)) return { ok: false, cancelled: true };
    return { ok: true, editor: editor.createPageEditor, refreshView: editor.refreshMountedView, featureIds, code };
  }

  async function prepareAuthority(inst, source) {
    // The page's own code is a download like the editor's: it starts here, beside
    // authority, and only a page that must rebuild its tag waits for it before the
    // join. Nothing else on this path touches a vendor.
    const codePromise = pageCodeReady();
    try { meta = await hostMeta(); } catch (error) { meta = null; }
    if (!isCurrent(inst)) return { ok: false, cancelled: true };
    if (!meta || !Array.isArray(meta.extensions) || !meta.extensions.includes("page")) {
      showBlocked(inst, BLOCKED.code, BLOCKED.message);
      return { ok: false, reason: "missing-capability" };
    }

    // The room was opened from a document that had no page tag, so it holds no page
    // store and would answer this tab's frames with unknown-store. One conditional
    // save of the document with the tag is the page's initial write; a tab that
    // loses that race reloads, which composes the state the winner initialized.
    inst.mergeTagless = !meta.extensions.includes("live-data");
    // A host that keeps no page data makes no first save, so the tag the article
    // rebuilds goes in now, before the article it was read from. A seeded page is the
    // one boot whose join needs the page's own code, which rebuilds that tag.
    if (source.seeded) {
      const read = await source.ready;
      if (!read.ok) return read;
      if (!isCurrent(inst)) return { ok: false, cancelled: true };
      if (inst.mergeTagless) attachSeedTag(source);
    }
    if ((source.seeded || firstSave) && (await hostSupports("live-data"))) {
      if (!isCurrent(inst)) return { ok: false, cancelled: true };
      const result = await seededFirstSave(source);
      // The tag goes back in only for the boot that is still the page's: a replacement
      // that waited on this save attaches its own, which is the state it joins on.
      if (result?.ok && isCurrent(inst)) attachSeedTag(source);
      if (!isCurrent(inst)) return { ok: false, cancelled: true };
      if (!result?.ok) {
        if (result?.status === 412) {
          window.location.reload();
          return { ok: false, reason: "first-save-conflict" };
        }
        showBlocked(inst, result?.code ?? null, result?.msg ?? "");
        return { ok: false, reason: "first-save-refused" };
      }
      initialSave = true;
    }

    let handle;
    try {
      handle = window.clay.live("page");
    } catch (error) {
      console.warn("clayjs: page plugin could not open the page store", error);
      return { ok: false, reason: "missing-page-store" };
    }
    try {
      await handle.ready;
    } catch (error) {
      console.warn("clayjs: page plugin could not join the page room", error);
      return { ok: false, reason: "admission-failed" };
    }
    if (!isCurrent(inst)) return { ok: false, cancelled: true };
    // A tag the page's own code cannot decode is the boot's reason to stop, and both
    // branches report the same one, so whichever settles first does not change it.
    const read = await source.ready;
    if (!read.ok) return read;
    const code = await codePromise;
    if (!isCurrent(inst)) return { ok: false, cancelled: true };
    const store = storeOf("page");
    if (!store) return { ok: false, reason: "missing-page-store" };
    inst.store = store;

    let flushFailed = false;
    let registered = null;
    const trackFlush = async (call) => {
      const result = await call();
      flushFailed = result?.ok === false;
      registered?.changed();
      return result;
    };
    identity = authorIdentity();
    binding = code.createYPageBinding({
      store,
      onStopped: (reason) => {
        inst.tabValue = code.yValueOf(binding.ydoc);
        if (reason === "lineage") {
          fastLane()?.abandon?.("page");
          showReplaced(inst);
        } else {
          showTooLarge(inst);
        }
      },
      authorToken: identity.token,
      ownedTokens: identity.owned,
      checkpointWithin,
      requestCheckpoint,
      registerUnsavedState: (def) => {
        registered = registerUnsavedState({
          id: def.id,
          isPending: () => flushFailed || def.isPending(),
          flush: () => trackFlush(() => def.flush()),
        });
        return registered;
      },
    });
    inst.binding = binding;
    inst.flush = (options) => trackFlush(() => binding.flush(options));
    listenForSaves(inst);
    return { ok: true, store, handle };
  }

  function mountAndAttach(inst, source, loaded) {
    const article = source.element;
    // The claim comes before this install records the article as its own to
    // restore: a claim another runtime holds is refused, and neither the owner's
    // article nor this install's restoration ownership may change.
    try {
      inst.releaseArticle = claim(article, "editor");
    } catch (error) {
      console.error("clayjs: page plugin could not claim the article", error);
      return { ok: false, reason: "article-owned" };
    }
    inst.source = source;
    inst.article = article;
    inst.bootHtml = source.article.innerHTML;
    inst.bootRev = source.article.getAttribute("data-rev");
    inst.savedRev = inst.bootRev;
    listen(inst, "clay:sync-applied", (event) => {
      if (inst.replaced) return;
      if (!pageReplaced(event.detail?.html, inst.savedRev, inst.mergeTagless)) return;
      showReplaced(inst);
    });

    // A page with blocks whose view parts are still coming keeps its saved article on
    // screen, and the editor out of sight, until they are here. One with none of those
    // blocks has nothing to wait for, so its saved article goes now. Either way it is
    // this capture, taken before anything changes, that puts the article back.
    savedContent = [...article.childNodes].filter((node) => node !== inst.statusNote);
    // The shell is built out of the page, in an element of the same document, so a
    // creation that fails never leaves half an editor over the saved article.
    const staging = article.ownerDocument.createElement("div");
    let view = null;
    try {
      view = loaded.editor(staging, {
        doc: binding.doc(),
        dispatch: binding.dispatch,
        history: false,
        undo: binding.undo,
        redo: binding.redo,
        board: binding.board,
        editable: false,
        features,
        onAiTool: aiRequested() ? (_view, remove) => { openAi({ remove }); } : null,
        reviseTool: aiRequested() ? (toolId, rev) => { openAi({ target: { toolId, rev } }); } : null,
      });
    } catch (error) {
      console.error("clayjs: page plugin could not mount the editor", error);
      staging.replaceChildren();
      inst.releaseArticle?.();
      inst.releaseArticle = null;
      inst.article = null;
      return { ok: false, reason: "mount-failed" };
    }
    editorView = view;
    inst.view = view;
    const shell = view.dom.closest(".page-shell");
    // A shell still waiting for its boot takes no input of any kind: a control inside
    // a non-editable editor would otherwise write before the boot says ready. It is
    // cleared at the one place input is enabled.
    if (shell) shell.inert = true;
    if (loaded.featureIds.length && shell) shell.style.visibility = "hidden";
    // One synchronous move: the finished shell replaces the saved surface as a
    // single change, and the article element itself stays where it is.
    if (!loaded.featureIds.length) for (const node of savedContent) node.remove();
    if (shell) article.appendChild(shell);
    loaded.refreshView?.(view);
    binding.attach(view);
    editorReadyResolve();
    // The parts the saved article demands install onto the mounted view now, whether
    // their fetch already landed or is still on the wire; the saved article stays and
    // input stays off until they are in.
    featuresReady = Promise.allSettled(loaded.featureIds.map((id) => features.ensure(id)));
    scrollToHashBlock(view);
    inst.recover = loaded.code.createRecoverList({
      binding,
      mount: view.dom.closest(".page-shell") ?? article,
      ownTokens: [identity.token, ...identity.owned],
      onRestored: (id) => loaded.code.focusBlock(view, id),
      onStale: () => toast("That change was updated. The list now shows the latest version.", "warning"),
    });
    inst.titleObserver = loaded.code.observeDocumentTitle(view);
    return { ok: true, view, featureIds: loaded.featureIds };
  }

  // Whether the room's page state already carries the hand edit: merging the article's
  // changes into the room's blocks changes nothing. It is the comparison a checkpoint
  // makes before it decides the room holds an edit, run against the room's state
  // instead of the saved tag, so a room a peer changed after the adoption holds the
  // edit too.
  async function roomHoldsArticle(inst, found) {
    try {
      const code = await pageCodeReady();
      const { HyperMorph } = await mergeEngine();
      const blocks = code.blocksFromYValue(inst.store.authoritative);
      const current = code.readBack(blocks, document);
      const merged = code.mergePageModels(found.baseItems, current, found.parsed, {
        doc: document,
        merge3: HyperMorph.merge3,
        mergeJson: HyperMorph.mergeJson,
      });
      return code.canon(merged.items) === code.canon(current);
    } catch {
      return false;
    }
  }

  // A tab that is not the room's writer does not adopt: the elected writer lands the
  // hand edit, and it reaches this tab as a page update through the room, which the
  // store hands to this tab's binding. A room that already holds the edit has nothing
  // to wait for. Otherwise the saved article stays up and takes no typing until the
  // writer's adoption arrives, and the wait is bounded like adoption itself.
  async function awaitWriterAdoption(inst, found) {
    const code = await pageCodeReady();
    if (await roomHoldsArticle(inst, found)) return { ok: true, outcome: "writer-adopts" };
    return new Promise((resolve) => {
      let off = null;
      let timer = null;
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        timer = null;
        off?.();
        off = null;
        resolve(result);
      };
      addDisposer(inst, () => finish({ ok: false, cancelled: true }));
      off = inst.store.onRebase((event) => {
        if (event.source === "remote") finish({ ok: true, outcome: "writer-adopts" });
      });
      timer = setTimeout(() => {
        console.warn("page: gave up waiting for the writer\u0027s adoption; the hand edit was not adopted");
        finish({ ok: false, reason: "adoption-timeout" });
      }, code.ADOPTION_TIMEOUT_MS);
    });
  }

  async function adoptSource(inst, source, mounted) {
    const code = await pageCodeReady();
    // A hand-edited article is adopted by the room's elected writer only. With a
    // lane but no writer yet, this tab claims the room (a redundant set of an
    // existing Yjs update: a valid nonempty frame that changes nothing) and then
    // waits for the election, so exactly one tab adopts.
    const found = code.classifyFile(source.article, source.tags);
    const needsAdoption = found.kind === "adopt";
    const awaitWriter = async () => {
      const lane = await pageLaneReady();
      if (!lane) return;
      if (!isCurrent(inst)) return;
      if (lane.status.writer === null) {
        const y = inst.store.value.y;
        const keys = Object.keys(y);
        const key = keys.length ? keys[0] : `claim-${binding.ydoc.clientID.toString(36)}`;
        const value = keys.length ? y[keys[0]] : code.yValueOf(binding.ydoc).y.seed;
        inst.store.handle.set(["y", key], value);
      }
      // A lane that never reports a writer must not cost the hand edit: give up
      // before adoption's own bound, and adopt as the file-mode tab would.
      let timer;
      await Promise.race([pageWriterReady(), new Promise((resolve) => { timer = setTimeout(resolve, WRITER_WAIT_MS); })]);
      clearTimeout(timer);
    };
    const ready = needsAdoption ? awaitWriter() : Promise.resolve();

    const adoption = code.installAdoption({
      view: mounted.view,
      source,
      ready,
      isAdopter: () => {
        const lane = fastLane();
        return !lane || lane.status.writer === null ? true : lane.isWriter();
      },
      requestCheckpoint: () => checkpointWithin(0),
      snapshot: () => captureForSaveAndComparison().forSave,
      mergeTagless: inst.mergeTagless,
      writerReady: awaitWriter,
      adopted: (rev) => fastLane()?.adopted?.("page", rev, inst.store.mark),
      notice: (counts) => {
        if (!counts.copy) return;
        toastPersistent(OVERWRITTEN_TEXT, "warning", {
          actions: [{ label: "Download your copy", onClick: () => downloadSnapshot(counts.copy) }],
        });
      },
    });
    inst.adoption = adoption;

    let outcome = await adoption.idle();
    if (!outcome) return { ok: true, outcome: "unchanged" };
    // Another tab is the room's writer, so this tab's adoption is the one that tab
    // lands: the wait ends when it reaches this tab, or as the timeout a refusal is.
    if (outcome.outcome === "writer-adopts") outcome = await awaitWriterAdoption(inst, found);
    // Adoption refused, timed out or failed: the room's state is the page's, not the
    // view this tab built over the saved article, so the editor goes and the article
    // comes back from what the room accepted. A disposed install restores nothing:
    // dispose already did.
    if (!outcome.ok && isCurrent(inst)) abandonEditor(inst);
    return outcome;
  }

  async function enableInput(inst, mounted) {
    // The blocks the document had at boot have their controls now, so the saved article
    // gives way to the editor.
    const showEditor = () => {
      for (const node of savedContent) node.remove();
      const shell = mounted.view.dom.closest(".page-shell");
      if (shell) shell.style.visibility = "";
    };
    // A replacement that landed while the page was still booting keeps the editor
    // read-only: the notice is already up, and this tab must not edit the old article.
    if (inst.replaced) {
      showEditor();
      stopEditing(inst);
      return { ok: false, reason: "page-replaced" };
    }
    await featuresReady;
    if (!isCurrent(inst)) return { ok: false, cancelled: true };
    // The gate: this installation's own view, still in the article it claimed, over
    // the binding the room accepted. Anything else is not something to type into.
    const shell = mounted.view.dom.closest(".page-shell");
    if (!ownsView(inst, mounted) || !shell || !shell.isConnected || mounted.view.isDestroyed) {
      return { ok: false, reason: "view-detached" };
    }
    // The document the view holds can ask for a part the saved article never did: a
    // peer put a table in the room, or a hand edit spliced one in during adoption.
    // Those are the last parts input waits for, before the article gives way.
    const booted = new Set(mounted.featureIds ?? []);
    const late = docFeatureIds(mounted.view.state.doc).filter((id) => !booted.has(id));
    if (late.length) {
      await Promise.allSettled(late.map((id) => features.ensure(id)));
      if (!isCurrent(inst)) return { ok: false, cancelled: true };
    }
    showEditor();
    // A replacement that landed during the feature wait keeps the editor read-only,
    // exactly as one that landed before it does.
    if (inst.replaced) {
      stopEditing(inst);
      return { ok: false, reason: "page-replaced" };
    }
    shell.inert = false;
    mounted.view.setProps({ editable: () => true });
    clearLoadingStatus(inst);

    // That initial write advanced the saved baselines from a capture taken before
    // the editor mounted, which is what the load-time settle would otherwise absorb
    // boot churn into. Install them once more from the booted page, so a tab that
    // was opened and left alone does not read as unsaved.
    if (initialSave) {
      const { forComparison, forDirty } = captureForComparisonAndDirty();
      setLastSavedBaselines(forComparison, forDirty);
    }
    return { ok: true };
  }

  // A boot that ends without an editor gives up what its branches acquired: the room's
  // subscription, its save participant and its listeners. A boot that mounted a view
  // releases its own through the paths above and keeps the editor on screen.
  const release = (inst) => {
    if (inst.view) return;
    abandonEditor(inst);
  };

  return { readSource, loadEditorAssets, prepareAuthority, mountAndAttach, adoptSource, enableInput, release };
}

async function run(inst, options = {}) {
  return runBoot(inst, createSteps(inst, options));
}

function install(options = {}) {
  dispose();
  ended = null;
  const gen = ++generation;
  const inst = {
    ...createInstall({
      gen,
      isCurrent: () => gen === generation,
      onPhase: (result) => {
        // A settled boot says so by taking the waiting line away, whatever it settled
        // as: there is nothing left to wait for.
        if (result.phase === "ready" || result.phase === "blocked" || result.phase === "error") clearLoadingStatus(inst);
        options.onPhase?.(result);
      },
    }),
    article: null, view: null, binding: null, adoption: null, source: null, store: null, toolHost: null, aiTool: null, bootHtml: "", bootRev: null, savedRev: null, releaseArticle: null, replaced: false, savesHeld: false, flush: null, listeners: [], retryTimer: null, retryShown: false, statusTimer: null, statusNote: null, notices: null, editorReadyResolve: null,
  };
  active = inst;
  return run(inst, options).catch((error) => {
    console.error("clayjs: page plugin failed to install", error);
    ended = finishError(inst, "boot-failed");
    if (active === inst) dispose();
    return ended;
  });
}

export const page = {
  ready: null,
  install,
  get status() {
    return active?.result ?? ended;
  },
  flush(options = {}) {
    const inst = active;
    if (!inst || !inst.flush) return Promise.resolve({ ok: false, code: "disposed" });
    return inst.flush(options);
  },
  dispose,
  get view() {
    return active?.view ?? null;
  },
};

page.ready = install();

export default page;
