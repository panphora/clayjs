import { jest } from "@jest/globals";

/**
 * clay:snapshot-ready hands one clone to its listeners and then serializes that
 * same clone into forSave, forComparison and forDirty. A listener that writes to
 * it corrupts every baseline the save installs.
 *
 * serializeForSync did exactly that: it removed the tab-local root attributes,
 * serialized, and re-added them in a finally. An attribute list is ordered by
 * insertion, so re-adding moved each name to the END of the <html> tag. The
 * save-path baselines came out reordered; the dirty check, which dispatches no
 * event and so is never handed to a listener, came out in live-DOM order. Two
 * strings of identical length that could never match again, so closing a clean
 * page always warned and savePageThrottled never skipped an unchanged save.
 *
 * htmlclay is the host that felt it: htmlutil.injectAttr splices htmlclaytoken
 * and htmlclayid in right after `<html`, so the names that move are the ones
 * that were first. A host that appends its token saw a no-op, which is why this
 * file tests both shapes.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let saveMod, snapshotMod, LiveSync;

function okFetch() {
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ msg: "Saved" }),
  }));
}

function closeWouldWarn() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeAll(async () => {
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';
  saveMod = await import("../../src/core/save.js");
  snapshotMod = await import("../../src/core/snapshot.js");
  ({ LiveSync } = await import("../../src/sync/live-sync.js"));
  await import("../../src/core/unsaved-warning.js");
});

describe.each([
  ["a host that injects its token in front", ["htmlclaytoken", "htmlclayid", "lang", "autosave"]],
  ["a host that appends its token at the end", ["lang", "autosave", "htmlclaytoken", "htmlclayid"]],
])("%s", (_label, order) => {
  let sync, savedBody;

  beforeEach(async () => {
    const root = document.documentElement;
    for (const name of [...root.attributes].map((a) => a.name)) root.removeAttribute(name);
    for (const name of order) {
      root.setAttribute(name, name.startsWith("htmlclay") ? `${name}-value` : name === "lang" ? "en" : "");
    }

    document.body.innerHTML = '<div id="content">start</div>';

    // The real relay, not a stand-in: listenForSnapshots is what the running
    // library installs, and its handler is the mutator this file is about.
    sync = new LiveSync();
    sync.listenForSnapshots();

    okFetch();
    // Unique per run: an identical body would be skipped as "no changes to
    // save" by every beforeEach after the first, and nothing would be posted.
    document.getElementById("content").textContent = `baseline-${Math.random()}`;
    await saveMod.savePage();
    await new Promise((r) => setTimeout(r, 0));
    savedBody = global.fetch.mock.calls[0][1].body;
  });

  afterEach(() => {
    sync.cleanup();
    delete global.fetch;
  });

  test("the save leaves both baselines reproducible by a fresh capture", () => {
    expect(snapshotMod.captureForDirtyCheck()).toBe(saveMod.getLastSavedDirty());
    expect(snapshotMod.captureForComparison()).toBe(saveMod.getLastSavedContents());
  });

  test("closing the page straight after a save does not warn", () => {
    expect(closeWouldWarn()).toBe(false);
  });

  // savePageThrottled skips at its OWN gate or not at all. Under the bug it
  // always fell through to savePage, whose dirty check compares two strings that
  // both came from an event-dispatching capture and so agree — the write was
  // still skipped, but only after a full extra clone of the document, every
  // authored handler, three serializations, and a live-sync broadcast of bytes
  // nobody changed. Counting the event is the only way to see that from outside;
  // a fetch-count assertion passes on the broken build and proves nothing.
  test("an unchanged page skips autosave without capturing a snapshot at all", async () => {
    let captures = 0;
    const count = () => captures++;
    document.addEventListener("clay:snapshot-ready", count);
    global.fetch.mockClear();

    const result = await saveMod.savePageThrottled();

    document.removeEventListener("clay:snapshot-ready", count);
    expect(result.msgType).toBe("skipped");
    expect(captures).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("a real edit still warns on close", () => {
    document.getElementById("content").textContent = "unsaved work";
    expect(closeWouldWarn()).toBe(true);
  });

  test("the saved bytes keep the root attribute order the host wrote", () => {
    const rootTag = /<html\b[^>]*>/i.exec(savedBody)[0];
    const names = [...rootTag.matchAll(/\s([a-z-]+)=/gi)].map((m) => m[1]);
    expect(names).toEqual(order);
  });
});

describe("serializeForSync", () => {
  function makeClone() {
    const clone = document.documentElement.cloneNode(true);
    for (const name of [...clone.attributes].map((a) => a.name)) clone.removeAttribute(name);
    clone.setAttribute("htmlclaytoken", "tok");
    clone.setAttribute("htmlclayid", "file-uuid");
    clone.setAttribute("lang", "en");
    clone.setAttribute("autosave", "");
    return clone;
  }

  test("leaves the clone byte-identical, attribute order included", () => {
    const clone = makeClone();
    const before = clone.outerHTML;
    snapshotMod.serializeForSync(clone);
    expect(clone.outerHTML).toBe(before);
  });

  test("drops the tab-local attributes and keeps the rest in place", () => {
    const html = snapshotMod.serializeForSync(makeClone());
    // The prologue first: this artifact is a complete document, same as every other
    // one the module emits, which is what spec section 2 asks of a snapshot.
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html.slice("<!DOCTYPE html>".length, html.indexOf(">", "<!DOCTYPE html>".length) + 1)).toBe('<html lang="en" autosave="">');
  });

  test("an authored attribute containing an end tag does not truncate the payload", () => {
    const clone = makeClone();
    clone.setAttribute("data-trap", "</html>");
    clone.querySelector("body").innerHTML = '<p id="tail">tail</p>';
    const html = snapshotMod.serializeForSync(clone);
    expect(html).toContain('id="tail"');
    expect(html.endsWith("</html>")).toBe(true);
  });
});
