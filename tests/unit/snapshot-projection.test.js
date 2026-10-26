/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * `clay.getHTML({ transform, flushUndo })`: the bytes a save WOULD send for a page a
 * caller has changed on a detached clone.
 *
 * It is not a save, so nothing a save produces may happen: no snapshot-ready frame, no
 * accepted receipt, no baseline advance, no adoption of the bytes as the source model.
 * It is also not a private lane around the save rules, so the authored handlers, the
 * registered transforms and the [no-save] strip all still run — the transform only gets
 * its turn first, over a tree the page cannot see.
 *
 * A preview that finished later would describe a page that has already moved on, so a
 * transform that hands back a thenable is refused rather than awaited.
 */

const SRC = [
  "<!DOCTYPE html>",
  "<html>",
  "  <head><title>Notes</title></head>",
  "  <body class='page'>",
  "    <ul id=list>",
  "      <li data-id='a'>alpha</li>",
  "      <li data-id='b'>beta</li>",
  "    </ul>",
  "    <p id=hooked onbeforesave='window.__hookRuns()' onbeforesnapshot='window.__hookRuns()'>hook</p>",
  "  </body>",
  "</html>",
].join("\n");

let snapshot, save, source;

function seedDocument() {
  const parsed = new DOMParser().parseFromString(SRC, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

function bothEdits(root, tag = "gamma") {
  root.querySelector("[data-id='a']").remove();
  const li = root.ownerDocument.createElement("li");
  li.setAttribute("data-id", "c");
  li.textContent = tag;
  root.querySelector("#list").appendChild(li);
}

beforeAll(async () => {
  window.clayEditMode = true;
  seedDocument();
  window.__hookRuns = () => { window.__hooks = (window.__hooks || 0) + 1; };
  snapshot = await import("../../src/core/snapshot.js");
  save = await import("../../src/core/save.js");
});

afterAll(() => {
  snapshot.setSaveRenderer(null);
});

// The bytes the function produced before this change: `getPageContents` WAS
// `captureForSave({ emitForSync: false })`, so calling that beside it is the comparison.
describe("with no options it is the function it replaced", () => {
  test("no argument, and an empty options object, are byte for byte today's answer", () => {
    const today = snapshot.captureForSave({ emitForSync: false });
    expect(snapshot.getPageContents()).toBe(today);
    expect(snapshot.getPageContents({})).toBe(today);
    expect(snapshot.getPageContents(undefined)).toBe(today);
  });
});

describe("the transform edits a clone, and only a clone", () => {
  test("a removal and an addition reach the bytes and neither reaches the page", () => {
    const live = document.documentElement.outerHTML;
    const out = snapshot.getPageContents({ transform: bothEdits });

    expect(out).toContain('<li data-id="c">gamma</li>');
    expect(out).not.toContain("alpha");
    expect(out).toContain("beta");                       // untouched, not reprinted

    expect(document.documentElement.outerHTML).toBe(live);
    expect(document.querySelector("[data-id='a']")).not.toBeNull();
    expect(document.querySelector("[data-id='c']")).toBeNull();
  });

  test("the callback is handed a detached tree with no live reference to write through", () => {
    const live = document.getElementById("list").outerHTML;
    let seen = null;
    snapshot.getPageContents({
      transform: (root) => {
        seen = root;
        const live = root.querySelector("#list");
        expect(live).not.toBe(document.getElementById("list"));
        expect(document.contains(root)).toBe(false);
        expect(root.ownerDocument).not.toBe(document);
        // Still traceable, so a renderer can pair what it prints against the page.
        expect(snapshot.originalSnapshotNode(live)).toBe(document.getElementById("list"));
      },
    });
    expect(seen).not.toBeNull();
    expect(document.getElementById("list").outerHTML).toBe(live);
    expect(document.querySelectorAll("#list li")).toHaveLength(2);
  });

  test("no save event fires, no fetch goes out, and no receipt or baseline moves", async () => {
    const seen = [];
    const names = ["clay:snapshot-ready", "clay:sync-applied", "clay:save-reprinted", "clay:save-size", "clay:saved"];
    const onEvent = (e) => seen.push(e.type);
    for (const name of names) document.addEventListener(name, onEvent);
    global.fetch = jest.fn(async () => { throw new Error("getHTML must not send anything"); });

    const receiptBefore = save.acceptedReceipt();
    const savedBefore = save.getLastSavedContents();
    const dirtyBefore = save.getLastSavedDirty();

    const out = snapshot.getPageContents({ transform: bothEdits });

    for (const name of names) document.removeEventListener(name, onEvent);
    expect(out).toContain("gamma");
    expect(seen).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(save.acceptedReceipt()).toBe(receiptBefore);
    expect(save.getLastSavedContents()).toBe(savedBefore);
    expect(save.getLastSavedDirty()).toBe(dirtyBefore);
  });

  test("the authored handlers still run, exactly once each, as one save would run them", () => {
    window.__hooks = 0;
    snapshot.getPageContents({ transform: bothEdits });
    expect(window.__hooks).toBe(2);                       // onbeforesnapshot + onbeforesave

    window.__hooks = 0;
    snapshot.captureForSave({ emitForSync: false });
    expect(window.__hooks).toBe(2);                       // the same count a save pays
  });
});

describe("flushUndo", () => {
  beforeEach(() => {
    window.clay = { ...(window.clay || {}), undo: { flush: jest.fn() } };
  });

  test("a plain capture has always closed the undo batch, and still does", () => {
    snapshot.getPageContents();
    expect(window.clay.undo.flush).toHaveBeenCalledTimes(1);

    window.clay.undo.flush.mockClear();
    snapshot.getPageContents({ transform: bothEdits });
    expect(window.clay.undo.flush).toHaveBeenCalledTimes(1);
  });

  test("flushUndo: false leaves a pending batch open, with and without a transform", () => {
    const before = document.documentElement.outerHTML;

    const out = snapshot.getPageContents({ transform: bothEdits, flushUndo: false });
    expect(window.clay.undo.flush).not.toHaveBeenCalled();
    expect(out).toContain("gamma");
    expect(out).not.toContain("alpha");

    snapshot.getPageContents({ flushUndo: false });
    expect(window.clay.undo.flush).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).toBe(before);
  });
});

describe("a transform that cannot answer synchronously", () => {
  test("a thenable is refused, not awaited", () => {
    window.__hooks = 0;
    expect(() => snapshot.getPageContents({ transform: async (root) => { root.querySelector("#list"); } }))
      .toThrow(/synchronous/);
    // Refused before the save preparation, so the save-side handler never ran.
    expect(window.__hooks).toBe(1);
  });

  test("a throw leaves no bytes, no event and no state change", () => {
    const live = document.documentElement.outerHTML;
    const seen = [];
    const onEvent = (e) => seen.push(e.type);
    document.addEventListener("clay:snapshot-ready", onEvent);

    window.__hooks = 0;
    let thrown = null;
    try {
      snapshot.getPageContents({ transform: (root) => { bothEdits(root); throw new Error("boom"); } });
    } catch (err) {
      thrown = err;
    }

    document.removeEventListener("clay:snapshot-ready", onEvent);
    expect(thrown && thrown.message).toBe("boom");
    expect(window.__hooks).toBe(1);                       // only onbeforesnapshot ran
    expect(seen).toEqual([]);
    expect(save.acceptedReceipt()).toBeNull();
    expect(document.documentElement.outerHTML).toBe(live);
    expect(document.querySelector("[data-id='c']")).toBeNull();
  });
});

describe("the fallback path, with no renderer installed", () => {
  beforeEach(() => snapshot.setSaveRenderer(null));

  test("the full serialization still shows the removal and the addition", () => {
    const out = snapshot.getPageContents({ transform: bothEdits });
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).toContain("beta");
    expect(out).not.toContain("alpha");
    expect(out).toMatch(/<li data-id="c">gamma<\/li>/);
  });
});

// The Map that prints the author's own bytes back still has to see a tree the page
// never had. The Journal's harness runs without the source plugin, so the fixture that
// proves this has to install it: a page served from these exact bytes, paired, with the
// renderer on the save path.
describe("with the source plugin installed", () => {
  beforeAll(async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      redirected: false,
      type: "basic",
      headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
      text: async () => SRC,
    }));
    source = await import("../../src/plugins/source.js");
    await source.source.ready;
  });

  test("it installed, and a no-edit getHTML is the file byte for byte", () => {
    expect(source.source.stats().installed).toBe(true);
    expect(source.source.stats().refused).toBeNull();
    expect(snapshot.getPageContents()).toBe(SRC);
    expect(snapshot.getPageContents({ transform: () => {} })).toBe(SRC);
  });

  test("a removal and an addition both reach the bytes, and the model they were printed from does not move", () => {
    const before = source.source.stats();
    const out = snapshot.getPageContents({ transform: bothEdits });

    expect(out).toContain("gamma");
    expect(out).not.toContain("alpha");
    expect(out).toContain("beta");
    expect(out).toContain("<ul id=list>");              // the rest is still the author's text

    // A preview is not a save: the file this plugin models is still the served one.
    expect(source.source.text()).toBe(SRC);
    expect(source.source.stats().saves).toBe(before.saves);
    expect(source.source.stats().reprints).toBe(before.reprints);
  });
});
