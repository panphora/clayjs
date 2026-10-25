import { createPageEditor, installPageFeature } from "../page/editor.js";
import { createFeatureLoader } from "../page/feature-loader.js";
import { FEATURES, featureForType } from "../page/features/registry.js";
import { readFile, installAdoption } from "../page/adopt-boot.js";
import { classifyFile } from "../page/adopt.js";
import { renderFromTags } from "../page/save-projection.js";
import { blocksFromYValue } from "../page/ybind/decode.js";
import { createYPageBinding } from "../page/ybind/binding.js";
import { authorIdentity } from "../page/ybind/author.js";
import { yValueOf } from "../page/ybind/provider.js";
import { seedPageFromArticle } from "../page/ybind/migrate.js";
import { serializeLive } from "../live/ops.js";
import { registerUnsavedState } from "../lib/unsaved-state.js";
import { hostMeta, hostSupports } from "../core/host-meta.js";
import { savePageForce, setLastSavedBaselines, holdAllSaves, releaseAllSaves, getLastSavedBytes } from "../core/save.js";
import { captureForComparisonAndDirty, captureForSaveAndComparison } from "../core/snapshot.js";
import { storeOf, checkpointWithin, requestCheckpoint, fastLane, pageLaneReady, pageWriterReady } from "./live.js";
import { parseJsonRelaxed } from "../vendor/hyper-morph-json.vendor.js";
import { saveStateFor, BLOCKED_TEXT, RETRY_TEXT, downloadPageCopy, downloadSnapshot, copyPageText } from "../page/save-states.js";
import toast, { toastPersistent, dismissPersistent } from "../ui/toast.js";
import { createRecoverList, focusBlock } from "../page/recover.js";
import { capabilityAdvertised } from "../page/tool-capability.js";
import { toolViews } from "../page/tool-views.js";
import { holdSlashRange, heldSlashRange } from "../page/chrome.js";

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

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

let generation = 0;
let active = null;

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

function abandon(inst) {
  inst.editorReadyResolve?.();
  if (active === inst) active = null;
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
  if (!inst.store) return inst.savedRev;
  try { return renderFromTags([JSON.stringify(inst.store.value)]).rev; } catch { return inst.savedRev; }
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
  const rendered = renderFromTags([JSON.stringify(inst.tabValue)]);
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
  if (inst.store) {
    try {
      const rendered = renderFromTags([JSON.stringify(inst.store.value)]);
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

function dispose() {
  generation += 1;
  const inst = active;
  active = null;
  if (!inst) return;
  inst.editorReadyResolve?.();
  if (inst.retryTimer) {
    clearTimeout(inst.retryTimer);
    inst.retryTimer = null;
  }
  for (const [type, handler] of inst.listeners) document.removeEventListener(type, handler);
  inst.listeners = [];
  dismissPersistent(RETRY_TEXT);
  dismissPersistent(BLOCKED_TEXT);
  dismissPersistent(REPLACED_TEXT);
  for (const message of inst.notices?.values() ?? []) dismissPersistent(message);
  if (inst.savesHeld) {
    inst.savesHeld = false;
    releaseAllSaves({ replay: false, reason: REPLACED_HOLD });
  }
  try { inst.adoption?.dispose(); } catch (error) { console.error("clayjs: page plugin adoption failed to dispose", error); }
  try { inst.recover?.destroy(); } catch (error) { console.error("clayjs: page plugin recover list failed to dispose", error); }
  try { inst.view?.destroy(); } catch (error) { console.error("clayjs: page plugin view failed to destroy", error); }
  inst.aiTool?.dispose();
  inst.toolHost?.dispose();
  if (inst.view) toolViews.delete(inst.view);
  if (inst.article) {
    const shell = inst.article.querySelector(".page-shell");
    if (shell) shell.remove();
  }
  try { inst.binding?.dispose(); } catch (error) { console.error("clayjs: page plugin binding failed to dispose", error); }
  try { inst.binding?.ydoc?.destroy(); } catch (error) { console.error("clayjs: page plugin document failed to destroy", error); }
  restoreArticle(inst);
}

async function run(inst, gen, options = {}) {
  const articles = document.querySelectorAll(ARTICLE_SEL);
  let tags = document.querySelectorAll(TAG_SEL);
  if (!articles.length && !tags.length) return abandon(inst);
  // A page saved without its merge state (HTML Clay, an outside edit, a download)
  // is booted from its article alone: the seed is deterministic, so every tab
  // rebuilding the same article holds the same state and their edits merge.
  const seeded = articles.length === 1 && tags.length === 0;
  if (seeded) {
    const saved = readFile(document);
    if (!saved) return abandon(inst);
    const tag = document.createElement("script");
    tag.setAttribute("type", "application/json");
    tag.setAttribute("merge", "page");
    tag.setAttribute("clay", "live");
    tag.textContent = serializeLive(seedPageFromArticle(saved.article));
    articles[0].before(tag);
    tags = document.querySelectorAll(TAG_SEL);
  }
  if (articles.length !== 1 || tags.length !== 1) {
    console.warn(`clayjs: page plugin needs exactly one article[data-page] and one merge="page" live tag; found ${articles.length} article(s) and ${tags.length} tag(s), leaving the page as saved HTML`);
    return abandon(inst);
  }

  const article = articles[0];
  const file = readFile(document);
  if (!file) return abandon(inst);
  let value = null;
  try { value = parseJsonRelaxed(tags[0].textContent); } catch (error) { value = null; }
  if (!isPlainObject(value) || value.v !== 1 || !isPlainObject(value.y) || Object.hasOwn(value, "blocks") || Object.hasOwn(value, "deleted")) {
    console.warn("clayjs: page plugin: the page tag is not a strict Yjs page, leaving the page as saved HTML");
    return abandon(inst);
  }
  let bootBlocks = null;
  try {
    bootBlocks = blocksFromYValue(value);
  } catch (error) {
    console.warn("clayjs: page plugin: the page tag is not a valid Yjs page, leaving the page as saved HTML", error);
    return abandon(inst);
  }
  const source = { article: file.article, tags: [value] };

  let meta = null;
  try { meta = await hostMeta(); } catch (error) { meta = null; }
  if (gen !== generation) return;
  if (!meta || !Array.isArray(meta.extensions) || !meta.extensions.includes("page")) {
    showBlocked(inst, BLOCKED.code, BLOCKED.message);
    return;
  }

  let binding = null;
  let editorView = null;
  let editorReadyResolve = null;
  // The editor the view parts install onto exists only after the room join, so an
  // install that starts earlier waits for it; the download overlaps the join meanwhile.
  const editorReady = new Promise((resolve) => { editorReadyResolve = resolve; });
  inst.editorReadyResolve = editorReadyResolve;
  // A document with a tool block, at boot or when one arrives, opens the store its
  // tools keep state in and the host that mounts them. A document with no tool
  // never waits for either.
  const TOOLS_SEL = 'script[type="application/json"][merge="page.tools"][clay~="live"]';
  let toolsStore = null;
  let aiTool = null;
  let toolsOpening = null;
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
      if (gen !== generation) return null;
      const [{ createToolHost }, { tablesFromDoc }] = await Promise.all([
        import("../page/tools.js"),
        import("../page/tool-data.js"),
      ]);
      const toolHost = createToolHost({
        store: toolsStore, mode: "edit",
        tables: () => tablesFromDoc(editorView?.state.doc ?? binding.doc()).map(({ id, cols, rows }) => ({ id, cols, rows })),
      });
      inst.toolHost = toolHost;
      if (capabilityAdvertised(meta)) {
        const { createAiTool } = await import("../page/ai-tool.js");
        if (gen !== generation) return null;
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
  const features = createFeatureLoader({
    load: (id) => FEATURES[id].load(),
    install: async (id, mod) => {
      if (!editorView) await editorReady;
      if (gen !== generation || !editorView) return null;
      const context = { view: editorView, upload: options.upload, board: binding.board, undo: binding.undo, redo: binding.redo, revise: aiRequested ? (toolId, rev) => { openAi({ target: { toolId, rev } }); } : null };
      if (id === "tool") {
        context.toolHost = await openTools();
        if (gen !== generation) return null;
      }
      return installPageFeature(context, id, mod);
    },
    reportError: (error, id) => {
      console.error("clayjs: an editor feature failed to load", error);
      notifyFailed(id);
    },
  });
  // Making or revising a tool opens the store and the host first, so the panel
  // keeps what it makes.
  const openAi = async ({ target = null, remove = null } = {}) => {
    if (editorView && remove) holdSlashRange(editorView, remove);
    await features.ensure("tool").catch(() => {});
    if (gen !== generation || !aiTool || !editorView) return;
    aiTool.open({ target, remove: remove ? heldSlashRange(editorView.state) : null });
  };
  const aiRequested = capabilityAdvertised(meta);
  // The view parts for the block types the saved article already has start loading
  // here, together with the room join, so the editor shows them and not an empty
  // section. A failure is reported by the loader, which shows its Retry notice.
  const savedFeatureIds = [...new Set(Object.values(bootBlocks).map((block) => featureForType(block.t)).filter(Boolean))];
  const featuresReady = Promise.allSettled(savedFeatureIds.map((id) => features.ensure(id)));

  // The room was opened from a document that had no page tag, so it holds no page
  // store and would answer this tab's frames with unknown-store. One conditional
  // save of the document with the tag is the page's initial write; a tab that
  // loses that race reloads, which composes the state the winner initialized.
  inst.mergeTagless = !meta.extensions.includes("live-data");
  let initialSave = false;
  if (seeded && (await hostSupports("live-data"))) {
    if (gen !== generation) return;
    const result = await savePageForce();
    if (gen !== generation) return;
    if (!result?.ok) {
      if (result?.status === 412) {
        window.location.reload();
        return;
      }
      showBlocked(inst, result?.code ?? null, result?.msg ?? "");
      return;
    }
    initialSave = true;
  }

  let handle;
  try {
    handle = window.clay.live("page");
  } catch (error) {
    console.warn("clayjs: page plugin could not open the page store", error);
    return abandon(inst);
  }
  await handle.ready;
  if (gen !== generation) return;
  const store = storeOf("page");
  if (!store) return abandon(inst);
  inst.store = store;

  let flushFailed = false;
  let registered = null;
  const trackFlush = async (call) => {
    const result = await call();
    flushFailed = result?.ok === false;
    registered?.changed();
    return result;
  };
  const identity = authorIdentity();
  binding = createYPageBinding({
    store,
    onStopped: (reason) => {
      inst.tabValue = yValueOf(binding.ydoc);
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
  // blocks has nothing to wait for, so its saved article goes now.
  const savedContent = [...article.childNodes];
  if (!savedFeatureIds.length) for (const node of savedContent) node.remove();
  const view = createPageEditor(article, {
    doc: binding.doc(),
    dispatch: binding.dispatch,
    history: false,
    undo: binding.undo,
    redo: binding.redo,
    board: binding.board,
    editable: false,
    features,
    onAiTool: aiRequested ? (_view, remove) => { openAi({ remove }); } : null,
    reviseTool: aiRequested ? (toolId, rev) => { openAi({ target: { toolId, rev } }); } : null,
  });
  editorView = view;
  inst.view = view;
  if (savedFeatureIds.length) view.dom.closest(".page-shell").style.visibility = "hidden";
  binding.attach(view);
  editorReadyResolve();
  scrollToHashBlock(view);
  inst.recover = createRecoverList({
    binding,
    mount: view.dom.closest(".page-shell") ?? article,
    ownTokens: [identity.token, ...identity.owned],
    onRestored: (id) => focusBlock(view, id),
    onStale: () => toast("That change was updated. The list now shows the latest version.", "warning"),
  });

  // A hand-edited article is adopted by the room's elected writer only. With a
  // lane but no writer yet, this tab claims the room (a redundant set of an
  // existing Yjs update: a valid nonempty frame that changes nothing) and then
  // waits for the election, so exactly one tab adopts.
  const needsAdoption = classifyFile(source.article, source.tags).kind === "adopt";
  const awaitWriter = async () => {
    const lane = await pageLaneReady();
    if (!lane) return;
    if (gen !== generation) return;
    if (lane.status.writer === null) {
      const y = store.value.y;
      const keys = Object.keys(y);
      const key = keys.length ? keys[0] : `claim-${binding.ydoc.clientID.toString(36)}`;
      const value = keys.length ? y[keys[0]] : yValueOf(binding.ydoc).y.seed;
      store.handle.set(["y", key], value);
    }
    // A lane that never reports a writer must not cost the hand edit: give up
    // before adoption's own bound, and adopt as the file-mode tab would.
    let timer;
    await Promise.race([pageWriterReady(), new Promise((resolve) => { timer = setTimeout(resolve, WRITER_WAIT_MS); })]);
    clearTimeout(timer);
  };
  const ready = needsAdoption ? awaitWriter() : Promise.resolve();

  const adoption = installAdoption({
    view,
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
    adopted: (rev) => fastLane()?.adopted?.("page", rev, store.mark),
    notice: (counts) => {
      if (!counts.copy) return;
      toastPersistent(OVERWRITTEN_TEXT, "warning", {
        actions: [{ label: "Download your copy", onClick: () => downloadSnapshot(counts.copy) }],
      });
    },
  });
  inst.adoption = adoption;

  await adoption.idle();
  if (gen !== generation) return;
  // The blocks the document had at boot have their controls now, so the saved article
  // gives way to the editor.
  const showEditor = () => {
    for (const node of savedContent) node.remove();
    const shell = view.dom.closest(".page-shell");
    if (shell) shell.style.visibility = "";
  };
  // A replacement that landed while the page was still booting keeps the editor
  // read-only: the notice is already up, and this tab must not edit the old article.
  if (inst.replaced) {
    showEditor();
    stopEditing(inst);
    return;
  }
  await featuresReady;
  if (gen !== generation) return;
  showEditor();
  // A replacement that landed during the feature wait keeps the editor read-only,
  // exactly as one that landed before it does.
  if (inst.replaced) {
    stopEditing(inst);
    return;
  }
  view.setProps({ editable: () => true });

  // That initial write advanced the saved baselines from a capture taken before
  // the editor mounted, which is what the load-time settle would otherwise absorb
  // boot churn into. Install them once more from the booted page, so a tab that
  // was opened and left alone does not read as unsaved.
  if (initialSave) {
    const { forComparison, forDirty } = captureForComparisonAndDirty();
    setLastSavedBaselines(forComparison, forDirty);
  }
}

function install(options = {}) {
  dispose();
  const gen = ++generation;
  const inst = { gen, article: null, view: null, binding: null, adoption: null, source: null, store: null, toolHost: null, aiTool: null, bootHtml: "", bootRev: null, savedRev: null, replaced: false, savesHeld: false, flush: null, listeners: [], retryTimer: null, retryShown: false, notices: null, editorReadyResolve: null };
  active = inst;
  return run(inst, gen, options).catch((error) => {
    console.error("clayjs: page plugin failed to install", error);
    if (active === inst) dispose();
  });
}

export const page = {
  ready: null,
  install,
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
