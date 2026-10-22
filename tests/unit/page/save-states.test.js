import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";

/**
 * The page save states: one frozen code table read by the indicator, the toast
 * and the plugin; a complete HTML export; the article's plain text; and the
 * persistent toast's detail and actions.
 */

let extensions = ["page"];

await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
  hostMeta: async () => ({ spec: 1, extensions, document: null }),
  hostSupports: async (name) => extensions.includes(name),
  hostMetaOutcome: () => "ok",
  querySaveOutcome: () => null,
  resetHostMeta: () => ({}),
}));

await jest.unstable_mockModule("../../../src/core/save.js", () => ({
  savePageForce: async () => ({ ok: true, msgType: "success" }),
  savePage: async () => ({ ok: true, msgType: "success" }),
  savePageThrottled: () => {},
  baselineSettled: () => true,
  isSaveConflicted: () => false,
  autosaveIsSuspended: () => false,
  suspendAutosave: () => {},
  resumeAutosave: () => {},
  holdAllSaves: () => {},
  releaseAllSaves: () => {},
  getLastSavedDirty: () => false,
  setLastSavedBaselines: () => {},
}));

await jest.unstable_mockModule("../../../src/live/local-lane.js", () => ({
  localLaneSupported: () => false,
  localTransport: () => ({}),
}));

window.clayEditMode = true;

const { live, storeOf } = await import("../../../src/plugins/live.js");
window.clay = { live };
const { page } = await import("../../../src/plugins/page.js");
const projection = await import("../../../src/page/save-projection.js");
const saveStates = await import("../../../src/page/save-states.js");
const { toastPersistent } = await import("../../../src/ui/toast.js");

const RETRYING = [
  "page-converting", "page-capacity", "busy", "rate-limited", "offline",
  "network", "network-error", "timeout", "save-history-pending",
];
const BLOCKED = [
  "page-condition-required", "page-conversion-refused", "page-conversion-required",
  "page-conversion-stale", "save-id-reused", "too-large", "unsupported-host",
  "save-history-refresh-required", "provenance-unsupported", "receipt-expired",
];

const tagHtml = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;
const articleHtml = (value) => {
  const { html, rev } = projection.renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};

function setPage(blocks) {
  const value = seedValue(blocks);
  document.head.innerHTML = tagHtml(value);
  document.body.innerHTML = articleHtml(value);
  if (!storeOf("page")) live("page");
  const store = storeOf("page");
  live("page").update((data) => {
    for (const key of Object.keys(data)) delete data[key];
    Object.assign(data, JSON.parse(JSON.stringify(value)));
  });
  store.confirm(store.mark);
  return { value, store };
}

afterEach(() => {
  page.dispose();
  extensions = ["page"];
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("every code maps to exactly one state, unknown codes fall to error, saved and offline win", () => {
  for (const code of RETRYING) expect(saveStates.saveStateFor({ code })).toBe("retrying");
  for (const code of BLOCKED) expect(saveStates.saveStateFor({ code })).toBe("blocked");
  expect(Object.keys(saveStates.SAVE_STATE_BY_CODE).sort()).toEqual([...RETRYING, ...BLOCKED].sort());
  expect(Object.isFrozen(saveStates.SAVE_STATE_BY_CODE)).toBe(true);

  expect(saveStates.saveStateFor()).toBe("error");
  expect(saveStates.saveStateFor({ code: null })).toBe("error");
  expect(saveStates.saveStateFor({ code: "no-such-code" })).toBe("error");

  expect(saveStates.saveStateFor({ ok: true })).toBe("saved");
  expect(saveStates.saveStateFor({ ok: true, code: "too-large" })).toBe("saved");
  expect(saveStates.saveStateFor({ ok: true, offline: true })).toBe("saved");

  expect(saveStates.saveStateFor({ offline: true })).toBe("retrying");
  expect(saveStates.saveStateFor({ offline: true, code: null })).toBe("retrying");
  expect(saveStates.saveStateFor({ offline: true, code: "too-large" })).toBe("retrying");
});

test("the two texts are the exact wording the indicator and toast show", () => {
  expect(saveStates.BLOCKED_TEXT).toBe("Can't save here. Your edits are still in this tab.");
  expect(saveStates.RETRY_TEXT).toBe("Still trying to save. Your edits are safe in this tab.");
});

const blobText = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

test("Download a copy writes one html blob with the projected article and no page store", async () => {
  const { store } = setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  await page.install();
  page.view.dispatch(page.view.state.tr.insertText("!", 6));

  const blobs = [];
  const anchors = [];
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { anchors.push(this); });
  URL.createObjectURL = jest.fn((blob) => { blobs.push(blob); return "blob:page-copy"; });
  URL.revokeObjectURL = jest.fn();
  try {
    expect(saveStates.downloadPageCopy()).toBe(true);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe("text/html");

    const html = await blobText(blobs[0]);
    const saved = new DOMParser().parseFromString(html, "text/html");
    const expected = projection.renderFromTags([JSON.stringify(storeOf("page").value)]);
    expect(saved.querySelector("article[data-page]").innerHTML).toBe(expected.html);
    expect(saved.querySelector("article[data-page]").getAttribute("data-rev")).toBe(expected.rev);

    // A copy opens through the article rebuild, so it carries no merge state:
    // the page editor's state is the host's, never a downloaded file's.
    expect(saved.querySelector('script[merge="page"]')).toBe(null);
    expect(html).not.toContain('merge="page"');
    expect(blocksFromYValue(store.value).p.c).toBe("Hello!");

    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toBe("index.html");
    expect(anchors[0].href).toContain("blob:page-copy");
  } finally {
    click.mockRestore();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  }
});

test("Copy text hands the article's plain text to the clipboard, never the editor chrome", async () => {
  setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  await page.install();
  page.view.dispatch(page.view.state.tr.insertText("!", 6));

  // Stand-in for the editor's own chrome, which lives inside the live article
  // and must not reach the clipboard.
  const chrome = document.createElement("div");
  chrome.textContent = "EDITOR-CHROME-MARKER";
  document.querySelector("article[data-page]").appendChild(chrome);

  const writeText = jest.fn(async () => {});
  const had = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  try {
    await expect(saveStates.copyPageText()).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0];
    expect(text).toBe("Hello!");
    expect(text).not.toContain("EDITOR-CHROME-MARKER");
  } finally {
    if (had) Object.defineProperty(navigator, "clipboard", had);
    else delete navigator.clipboard;
  }
});

test("Copy text reports failure when the clipboard refuses, and when there is no single article", async () => {
  setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  await page.install();

  const had = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async () => { throw new Error("denied"); } },
    configurable: true,
  });
  try {
    await expect(saveStates.copyPageText()).resolves.toBe(false);
    document.querySelector("article[data-page]").remove();
    await expect(saveStates.copyPageText()).resolves.toBe(false);
  } finally {
    if (had) Object.defineProperty(navigator, "clipboard", had);
    else delete navigator.clipboard;
  }
});

test("a persistent toast with options shows the detail and two actions that never dismiss it", () => {
  jest.useFakeTimers();
  try {
    const fired = [];
    toastPersistent(saveStates.BLOCKED_TEXT, "error", {
      detail: "The page is too large to save",
      actions: [
        { label: "Download a copy", onClick: () => fired.push("download") },
        { label: "Copy text", onClick: () => fired.push("copy") },
      ],
    });
    jest.advanceTimersByTime(10);

    const el = document.querySelector("[data-clay-toast]");
    expect(el.textContent).toContain(saveStates.BLOCKED_TEXT);
    expect(el.textContent).toContain("The page is too large to save");

    const buttons = [...el.querySelectorAll("button")].filter((b) => b.textContent);
    expect(buttons.map((b) => b.textContent)).toEqual(["Download a copy", "Copy text"]);

    buttons[0].click();
    buttons[0].click();
    expect(fired).toEqual(["download", "download"]);
    buttons[1].click();
    expect(fired).toEqual(["download", "download", "copy"]);

    jest.advanceTimersByTime(60000);
    expect(el.isConnected).toBe(true);

    const dismiss = el.querySelector('button[aria-label="Dismiss"]');
    expect(dismiss).not.toBeNull();
    dismiss.click();
    jest.advanceTimersByTime(500);
    expect(el.isConnected).toBe(false);
  } finally {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  }
});
