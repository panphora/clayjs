import { jest } from "@jest/globals";
import { docKey } from "../../src/lib/doc-storage.js";

// Scenario: the menu's editing items call the services that already do the job. Undo
// and Redo follow the page's history and only exist when the page asked for the undo
// plugin, Ask AI enters edit mode first or resumes across the reload, and Download
// saves what a save would send now. Every case boots through the real loader.

const SLOT = "/notes.html";
const BODY = '<div id="content">start</div>';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

async function boot({ cookie = true, edit = false, plugins = "menu", resume = null, settle = true } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  if (cookie) document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  window.history.replaceState({}, "", edit ? `${SLOT}?editmode=true` : SLOT);
  if (resume != null) sessionStorage.setItem(docKey("menu-resume"), JSON.stringify(resume));
  document.head.innerHTML = "";
  document.body.innerHTML = BODY;
  window.fetch = async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: { get: () => null },
    text: async () => "",
    json: async () => ({}),
  });
  window.clay = {};
  const params = new URLSearchParams(`plugins=${plugins}&exclude=richclay,source`);
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  if (settle) await flush();
}

const listOf = () => document.querySelector(".clay-menu-list");
const noteOf = () => document.querySelector(".clay-menu-note");
const buttonOf = (id) => document.querySelector(`[role="menuitem"][data-menu-id="${id}"]`);
const isDisabled = (id) => buttonOf(id).getAttribute("aria-disabled") === "true";

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function undoChange(canUndo, canRedo) {
  document.dispatchEvent(new CustomEvent("clay:undo-change", { detail: { canUndo, canRedo } }));
}

function setupDownload() {
  const names = [];
  const createObjectURL = jest.fn(() => "blob:x");
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = jest.fn();
  const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    names.push(this.download);
  });
  return { names, createObjectURL, anchorClick };
}

test("view mode still records what an edit session would load", async () => {
  await boot({ plugins: "menu,undo" });

  expect(Array.isArray(window.clay.editPlugins)).toBe(true);
  expect(window.clay.editPlugins).toContain("undo");
  expect(window.clay.editPlugins).toContain("menu");
  expect(Object.isFrozen(window.clay.editPlugins)).toBe(true);
});

test("a page that did not ask for undo gets no pair and no Ask AI item", async () => {
  await boot({ plugins: "menu" });

  expect(listOf()).not.toBeNull();
  expect(buttonOf("clay.undo")).toBeNull();
  expect(buttonOf("clay.undo.undo")).toBeNull();
  expect(buttonOf("clay.ai")).toBeNull();
  expect(buttonOf("clay.download")).not.toBeNull();
});

test("both halves of the pair stay disabled in view mode, whatever history says", async () => {
  await boot({ plugins: "menu,undo" });

  expect(isDisabled("clay.undo.undo")).toBe(true);
  expect(isDisabled("clay.undo.redo")).toBe(true);

  undoChange(true, true);

  expect(isDisabled("clay.undo.undo")).toBe(true);
  expect(isDisabled("clay.undo.redo")).toBe(true);
});

test("in edit mode the pair follows history and clicks reach the undo service", async () => {
  await boot({ plugins: "menu,undo", edit: true });

  const undo = { undo: jest.fn(), redo: jest.fn(), canUndo: true, canRedo: false };
  window.clay.undo = undo;

  undoChange(true, false);
  expect(isDisabled("clay.undo.undo")).toBe(false);
  expect(isDisabled("clay.undo.redo")).toBe(true);

  click(buttonOf("clay.undo.undo"));
  expect(undo.undo).toHaveBeenCalledTimes(1);
  click(buttonOf("clay.undo.redo"));
  expect(undo.redo).not.toHaveBeenCalled();

  undoChange(false, true);
  expect(isDisabled("clay.undo.undo")).toBe(true);
  expect(isDisabled("clay.undo.redo")).toBe(false);
});

test("Ask AI opens the editor in edit mode, and says so when it cannot", async () => {
  await boot({ plugins: "menu,ai-edit", edit: true });

  const open = jest.fn(async () => true);
  window.clay.aiEdit = { open };

  click(buttonOf("clay.ai"));
  await flush();

  expect(open).toHaveBeenCalledTimes(1);
  expect(open.mock.calls[0][0]).toBe(document.body);

  open.mockImplementation(async () => false);
  click(buttonOf("clay.ai"));
  await flush();

  expect(noteOf().textContent).toBe("Ask AI isn't available on this page right now.");
  expect(noteOf().hidden).toBe(false);
});

test("Ask AI from view mode enters edit live and runs the action", async () => {
  await boot({ plugins: "menu,ai-edit" });

  const setMode = jest.fn(async () => ({ ok: true }));
  window.clay.setMode = setMode;
  const open = jest.fn(async () => true);
  window.clay.aiEdit = { open };

  click(buttonOf("clay.ai"));
  await flush();

  expect(setMode).toHaveBeenCalledTimes(1);
  expect(setMode).toHaveBeenCalledWith("edit");
  expect(open).toHaveBeenCalledTimes(1);
  expect(open.mock.calls[0][0]).toBe(document.body);
  expect(window.clay.storage.session.get("menu-resume")).toBeUndefined();
});

test("Ask AI from view mode leaves its receipt for the reload", async () => {
  await boot({ plugins: "menu,ai-edit" });

  window.clay.setMode = jest.fn(async () => ({ ok: true, reloading: true }));
  const open = jest.fn(async () => true);
  window.clay.aiEdit = { open };

  click(buttonOf("clay.ai"));
  await flush();

  expect(open).not.toHaveBeenCalled();
  expect(window.clay.storage.session.get("menu-resume")).toBe("ai");
});

test("Ask AI says why when the mode change is refused", async () => {
  await boot({ plugins: "menu,ai-edit" });

  window.clay.setMode = jest.fn(async () => ({ ok: false, code: "permission-denied" }));
  const open = jest.fn(async () => true);
  window.clay.aiEdit = { open };

  click(buttonOf("clay.ai"));
  await flush();

  expect(noteOf().textContent).toBe("You don't have permission to edit this document.");
  expect(open).not.toHaveBeenCalled();
  expect(window.clay.storage.session.get("menu-resume")).toBeUndefined();
});

test("a receipt left by the reload runs the action once in edit mode", async () => {
  await boot({ plugins: "menu,ai-edit", edit: true, resume: "ai", settle: false });

  const open = jest.fn(async () => true);
  window.clay.aiEdit = { open };
  for (let i = 0; i < 50 && !buttonOf("clay.ai"); i++) await wait(10);
  await wait(120);
  await flush();

  expect(open).toHaveBeenCalledTimes(1);
  expect(open.mock.calls[0][0]).toBe(document.body);
  expect(window.clay.storage.session.get("menu-resume")).toBeUndefined();
});

test("Download in edit mode saves what a save would send now", async () => {
  await boot({ plugins: "menu", edit: true });
  window.clay.getHTML = () => "<html>copy</html>";
  const { names, createObjectURL, anchorClick } = setupDownload();

  try {
    click(buttonOf("clay.download"));
    await flush();

    expect(names).toHaveLength(1);
    expect(names[0]).toBe("notes.html");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    if (typeof blob.text === "function") expect(await blob.text()).toBe("<html>copy</html>");
  } finally {
    anchorClick.mockRestore();
  }
});

test("Download in view mode fetches the saved file, and says when it cannot", async () => {
  await boot({ plugins: "menu" });
  delete window.clay.getHTML;
  const fetchMock = jest.fn(async () => ({ ok: true, text: async () => "<html>saved</html>" }));
  window.fetch = fetchMock;
  const { names, createObjectURL, anchorClick } = setupDownload();

  try {
    click(buttonOf("clay.download"));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(location.href);
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: "no-store", credentials: "same-origin" });
    expect(names).toHaveLength(1);
    expect(names[0]).toBe("notes.html");
    const blob = createObjectURL.mock.calls[0][0];
    if (typeof blob.text === "function") expect(await blob.text()).toBe("<html>saved</html>");

    window.fetch = jest.fn(async () => ({ ok: false }));
    click(buttonOf("clay.download"));
    await flush();

    expect(noteOf().textContent).toBe("Couldn't build the download. Try again.");
    expect(noteOf().hidden).toBe(false);
  } finally {
    anchorClick.mockRestore();
  }
});
