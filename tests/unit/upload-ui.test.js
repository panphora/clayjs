import { jest } from "@jest/globals";

// Scenario: one upload row, drawn from a task snapshot, shared by Journal and Kanban.
// It shows a name, progress or an indeterminate indicator, a finishing label, Cancel,
// Retry only where a retry could answer differently, and Dismiss. It speaks through one
// polite live region and says nothing on every byte. Nothing it draws is saved.

const STATUS = ".clay-upload__status";

class FakeTask {
  constructor({ name = "photo.png", state = "uploading", loaded = 0, total = 100, percent = 0, result = null } = {}) {
    this.file = { name };
    this.snapshot = { id: "upload-1", attempt: 1, state, loaded, total, percent, result };
    this.listeners = new Set();
    this.cancelCalls = 0;
    this.retryCalls = 0;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }
  set(patch) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener(this.snapshot);
  }
  cancel() {
    this.cancelCalls += 1;
    this.set({ state: "cancelled", result: { ok: false, msg: "Upload cancelled", msgType: "skipped", code: "aborted", uploads: [] } });
  }
  retry() {
    this.retryCalls += 1;
    this.set({ state: "uploading", attempt: this.snapshot.attempt + 1, loaded: 0, percent: 0, result: null });
    return Promise.resolve(this.snapshot.result);
  }
  get listenerCount() { return this.listeners.size; }
}

const failed = (msg, code) => ({ ok: false, msg, msgType: "error", code, uploads: [] });
const succeeded = { ok: true, msg: "Uploaded", msgType: "success", code: null, uploads: [{ name: "a-1.png", url: "assets-x/a-1.png", access: "document" }] };

async function mount(task, container = document.createElement("div")) {
  const { mount: draw } = await import("../../src/plugins/upload-ui.js");
  document.body.append(container);
  const handle = draw(task, container);
  return { ...handle, container, root: rowsIn(container)[0] ?? null };
}

const part = (root, selector) => root.querySelector(selector);

// Each row mounts in its own shadow root, on a <clay-editor-ui data-clay-ui="upload"> host.
const rowsIn = (el) => [...el.querySelectorAll('clay-editor-ui[data-clay-ui="upload"]')].map((host) => host.shadowRoot.querySelector(".clay-upload")).filter(Boolean);

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  jest.resetModules();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("an uploading task shows its name, determinate progress and Cancel", async () => {
  const task = new FakeTask({ loaded: 40, total: 100, percent: 40 });
  const { root } = await mount(task);

  expect(root.getAttribute("clay")).toBe("editor-ui");
  expect(part(root, ".clay-upload__name").textContent).toBe("photo.png");
  const progress = part(root, ".clay-upload__progress");
  expect(progress.tagName).toBe("PROGRESS");
  expect(progress.hasAttribute("aria-label")).toBe(true);
  expect(progress.getAttribute("aria-label")).toContain("photo.png");
  expect(progress.getAttribute("value")).toBe("40");
  expect(progress.getAttribute("max")).toBe("100");
  expect(part(root, ".clay-upload__label").textContent).toBe("40%");
  expect(part(root, ".clay-upload__cancel").hidden).toBe(false);
  expect(part(root, ".clay-upload__retry").hidden).toBe(true);
  expect(part(root, ".clay-upload__dismiss").hidden).toBe(true);
});

test("an unknown total gives an indeterminate indicator, not a made-up percent", async () => {
  const task = new FakeTask({ loaded: 0, total: null, percent: null });
  const { root } = await mount(task);

  const progress = part(root, ".clay-upload__progress");
  expect(progress.hasAttribute("value")).toBe(false);
  expect(part(root, ".clay-upload__label").textContent).toBe("Uploading");
});

test("100% transmitted is still uploading, and says it is finishing", async () => {
  const task = new FakeTask({ loaded: 100, total: 100, percent: 100 });
  const { root } = await mount(task);

  expect(root.getAttribute("data-clay-upload-state")).toBe("uploading");
  expect(part(root, ".clay-upload__label").textContent).toBe("Finishing upload");
  expect(part(root, ".clay-upload__cancel").hidden).toBe(false);
  expect(part(root, ".clay-upload__retry").hidden).toBe(true);
});

test("a finished upload shows the host's message and no Cancel or Retry", async () => {
  const task = new FakeTask({ state: "succeeded", loaded: 100, total: 100, percent: 100, result: succeeded });
  const { root } = await mount(task);

  expect(root.getAttribute("data-clay-upload-state")).toBe("succeeded");
  expect(part(root, ".clay-upload__label").textContent).toBe("Uploaded");
  expect(part(root, ".clay-upload__progress").getAttribute("value")).toBe("100");
  expect(part(root, ".clay-upload__cancel").hidden).toBe(true);
  expect(part(root, ".clay-upload__retry").hidden).toBe(true);
  expect(part(root, ".clay-upload__dismiss").hidden).toBe(false);
});

test("Cancel asks the task to cancel and nothing else", async () => {
  const task = new FakeTask({ loaded: 10, total: 100, percent: 10 });
  const { root } = await mount(task);

  click(part(root, ".clay-upload__cancel"));

  expect(task.cancelCalls).toBe(1);
  expect(task.retryCalls).toBe(0);
  expect(root.getAttribute("data-clay-upload-state")).toBe("cancelled");
  expect(part(root, ".clay-upload__label").textContent).toBe("Upload cancelled");
  expect(part(root, ".clay-upload__retry").hidden).toBe(false);
});

test("Retry appears for a failure a second attempt could survive, and calls retry", async () => {
  for (const code of ["network", "timeout", "error", "bad-response"]) {
    jest.resetModules();
    const task = new FakeTask({ state: "failed", result: failed("Upload failed", code) });
    const { root, unmount } = await mount(task);

    const retry = part(root, ".clay-upload__retry");
    expect(retry.hidden).toBe(false);
    click(retry);
    expect(task.retryCalls).toBe(1);
    expect(root.getAttribute("data-clay-upload-state")).toBe("uploading");
    unmount();
  }
});

test("Retry stays hidden when the host refused this file rather than failing to answer", async () => {
  for (const code of ["payment-required", "too-large", "unsupported-type", "privacy-unsupported", "forbidden", "unsupported"]) {
    jest.resetModules();
    const task = new FakeTask({ state: "failed", result: failed("No", code) });
    const { root, unmount } = await mount(task);

    expect(part(root, ".clay-upload__retry").hidden).toBe(true);
    expect(part(root, ".clay-upload__label").textContent).toBe("No");
    click(part(root, ".clay-upload__cancel"));
    expect(task.cancelCalls).toBe(0);
    unmount();
  }
});

test("Dismiss waits until the upload settles, then unmounts the row and stops listening", async () => {
  const task = new FakeTask({ loaded: 5, total: 100, percent: 5 });
  const { root, container, unmount } = await mount(task);
  expect(task.listenerCount).toBe(1);

  click(part(root, ".clay-upload__dismiss"));
  expect((rowsIn(container)[0] ?? null)).not.toBeNull();
  expect(task.listenerCount).toBe(1);

  task.set({ state: "failed", result: { ok: false, msg: "Upload failed", uploads: [] } });
  expect(part(root, ".clay-upload__dismiss").hidden).toBe(false);
  click(part(root, ".clay-upload__dismiss"));

  expect((rowsIn(container)[0] ?? null)).toBeNull();
  expect(task.listenerCount).toBe(0);
  unmount();
  unmount();
  expect((rowsIn(container)[0] ?? null)).toBeNull();
});

test("the status region announces state changes, not every progress event", async () => {
  const task = new FakeTask({ loaded: 0, total: 100, percent: 0 });
  const { root } = await mount(task);
  const status = part(root, STATUS);
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(status.getAttribute("role")).toBe("status");

  const seen = [status.textContent];
  for (let percent = 5; percent <= 95; percent += 5) {
    task.set({ loaded: percent, total: 100, percent });
    seen.push(status.textContent);
  }
  const spoken = seen.filter((text, index) => index === 0 || text !== seen[index - 1]);
  expect(spoken).toHaveLength(1);
  expect(spoken[0]).toContain("photo.png");

  task.set({ loaded: 100, total: 100, percent: 100 });
  seen.push(status.textContent);
  task.set({ loaded: 100, total: 100, percent: 100, state: "succeeded", result: succeeded });
  seen.push(status.textContent);
  task.set({ state: "failed", result: failed("Upload failed", "network") });
  seen.push(status.textContent);
  task.set({ state: "cancelled" });
  seen.push(status.textContent);

  const changes = seen.filter((text, index) => index > 0 && text !== seen[index - 1]);
  const overTwentyEvents = [seen[0], ...seen.slice(1, 21)].filter((text, index, all) => index === 0 || text !== all[index - 1]);
  expect(overTwentyEvents.length).toBeLessThanOrEqual(2);
  expect(changes.length).toBe(4);
  expect(seen.at(-1)).toBe("Upload cancelled");
});

test("nothing the row draws reaches the saved HTML", async () => {
  document.body.innerHTML = '<div id="content">start</div>';
  const task = new FakeTask({ loaded: 30, total: 100, percent: 30 });
  const container = document.createElement("div");
  document.body.append(container);
  const { mount: draw } = await import("../../src/plugins/upload-ui.js");
  draw(task, container);

  const { captureSnapshot, serializeForSync } = await import("../../src/core/snapshot.js");
  const html = serializeForSync(captureSnapshot({ flushUndo: false, authored: false }));

  expect(html).not.toContain("clay-upload");
  expect(html).not.toContain("clay-editor-ui");
  expect(html).not.toContain("--clay-upload-");
  expect(html).not.toContain("photo.png");
  expect(html).not.toContain("Cancel");
  expect(html).toContain("start");
});

test("a container can override a --clay-upload-* token without replacing behaviour", async () => {
  const task = new FakeTask();
  const container = document.createElement("div");
  container.style.setProperty("--clay-upload-fill", "#00FF00");
  const { root } = await mount(task, container);

  expect(window.getComputedStyle(container).getPropertyValue("--clay-upload-fill").trim()).toBe("#00FF00");
  expect(root.style.getPropertyValue("--clay-upload-fill")).toBe("");
  expect(root.style.getPropertyValue("--clay-upload-ink")).toBe("");

  const css = [...root.getRootNode().querySelectorAll("style")].map((style) => style.textContent).join("\n");
  expect(document.getElementById("clay-upload-style")).toBeNull();
  expect(css).toContain("var(--clay-upload-fill,");
  expect(css).not.toContain("#00FF00");
  expect(part(root, ".clay-upload__progress")).not.toBeNull();
  expect(part(root, ".clay-upload__cancel").hidden).toBe(false);
});

test("clay.upload.mount is the shared entry point and loads its UI once", async () => {
  const { upload } = await import("../../src/plugins/upload.js");
  const first = new FakeTask();
  const second = new FakeTask({ name: "b.png" });

  const a = await upload.mount(first, document.body);
  const b = await upload.mount(second, document.body);

  expect(typeof a.unmount).toBe("function");
  expect(rowsIn(document)).toHaveLength(2);
  expect(document.querySelectorAll('clay-editor-ui[data-clay-ui="upload"][clay="editor-ui"]')).toHaveLength(2);
  expect(document.querySelectorAll("#clay-upload-style")).toHaveLength(0);

  a.unmount();
  b.unmount();
  expect(rowsIn(document)).toHaveLength(0);
  expect(document.querySelectorAll("clay-editor-ui")).toHaveLength(0);
});

test("a retry draws progress again, and a cancel clears the stale error from Retry", async () => {
  const task = new FakeTask({ state: "failed", loaded: 0, total: 100, percent: 0, result: failed("Upload timed out", "timeout") });
  const { root } = await mount(task);

  const progress = part(root, ".clay-upload__progress");
  const retry = part(root, ".clay-upload__retry");
  expect(progress.hidden).toBe(true);
  expect(retry.hidden).toBe(false);
  expect(retry.getAttribute("aria-label")).toBe("Retry photo.png: Upload timed out");

  click(retry);
  expect(task.retryCalls).toBe(1);
  // The second attempt is drawing over a row that was showing a failure.
  expect(progress.hidden).toBe(false);
  expect(part(root, ".clay-upload__cancel").hidden).toBe(false);
  expect(retry.hidden).toBe(true);

  click(part(root, ".clay-upload__cancel"));
  expect(root.getAttribute("data-clay-upload-state")).toBe("cancelled");
  expect(retry.hidden).toBe(false);
  expect(retry.getAttribute("aria-label")).toBe("Retry photo.png");
});
