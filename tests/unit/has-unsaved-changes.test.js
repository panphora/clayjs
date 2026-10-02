import { jest } from "@jest/globals";

/**
 * clay.hasUnsavedChanges is the close warning's own predicate, reachable synchronously
 * by a host that has to decide whether asking for a save is worth it.
 *
 * The page boots through the real loader, because that is where the member is attached:
 * a hand-built window.clay would keep this green with the attachment gone.
 */

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  window.fetch = async () => new Response("", { status: 404 });
  document.body.innerHTML = '<div id="content">start</div>';
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams("exclude=richclay,source"), resolve));
});

function okFetch() {
  return jest.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "",
    text: async () => JSON.stringify({ msg: "Saved", etag: "E1" })
  }));
}

test("a page that matches the file has nothing unsaved", () => {
  expect(window.clay.hasUnsavedChanges()).toBe(false);
});

test("an edit is unsaved until a save writes it", async () => {
  document.getElementById("content").textContent = "an edit";

  expect(window.clay.hasUnsavedChanges()).toBe(true);

  global.fetch = okFetch();
  const result = await window.clay.save();
  expect(result.ok).toBe(true);

  expect(window.clay.hasUnsavedChanges()).toBe(false);
});

// The warning decides first and explains afterwards: a capture that throws is a broken
// page, and a broken page is exactly the one whose work must not be dropped on close.
test("a pending registered state still warns when a document transform throws", async () => {
  const snapshot = await import("../../src/core/snapshot.js");
  const { registerUnsavedState } = await import("../../src/lib/unsaved-state.js");
  let broken = false;
  snapshot.addDocumentTransform(() => { if (broken) throw new Error("page transform bug"); });
  const handle = registerUnsavedState({ id: "editor-model", isPending: () => true });

  const listenerErrors = [];
  const onError = (event) => {
    listenerErrors.push(event.message || String(event.error));
    event.preventDefault?.();
  };
  window.addEventListener("error", onError);
  try {
    broken = true;
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);

    expect(beforeUnload.defaultPrevented).toBe(true);
    // Not even asked: the debug-only diff capture runs after the decision, and a throw
    // there must not cancel the warning.
    expect(listenerErrors).toEqual([]);
  } finally {
    window.removeEventListener("error", onError);
    handle.dispose();
    broken = false;
  }
});

// A capture that throws means unknown, and unknown is not clean. The close warning says
// so, and a flush reports it as a save that did not happen rather than as an answer.
test("a capture that throws reads as unsaved, and flush reports 'failed'", async () => {
  const snapshot = await import("../../src/core/snapshot.js");
  let broken = false;
  snapshot.addDocumentTransform(() => { if (broken) throw new Error("page transform bug"); });
  try {
    broken = true;
    expect(window.clay.hasUnsavedChanges()).toBe(true);
    await expect(window.clay.save.flush()).rejects.toMatchObject({ state: "failed" });
  } finally {
    broken = false;
  }
}, 20000);
