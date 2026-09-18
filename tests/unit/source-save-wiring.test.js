/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";

/**
 * The source map, wired into the save pipeline.
 *
 * Three claims, each with its own consequence if it is wrong:
 *
 *   the renderer is reached on the SAVE path and only there. Reaching the
 *   comparison baselines too would pay a full render on every dirty check and
 *   change what "has anything changed" compares.
 *
 *   a renderer that fails cannot cost a save. The floor of this whole mechanism is
 *   the serialization it replaces, and that has to hold for a throw as well as for
 *   a render that does not verify.
 *
 *   a render that does not verify is COUNTED and ANNOUNCED, not swallowed. A
 *   fallback nobody can see is how a reprint stays in the code for a year.
 */

let snapshot, saveCore, source;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const SRC = [
  "<!DOCTYPE html>",
  "<html>",
  "  <head><title>Notes</title></head>",
  "  <body class='page'>",
  "    <ul id=list>",
  "      <li data-id='a'>alpha</li>",
  "      <li data-id='b'>beta</li>",
  "    </ul>",
  // A template, because its children are not its childNodes: the provenance walk used
  // to stop at the element, so every node inside one came back unpaired and the whole
  // template reprinted on every save.
  "    <template id=tpl><li data-id='x'>from a template</li></template>",
  "  </body>",
  "</html>",
].join("\n");

// The doctype matters: checkSource compares the source's prologue against the live
// document's, and jsdom's document carries `<!DOCTYPE html>`. A source without one is
// refused, correctly, so the fixture has to have it.
function seedDocument() {
  const parsed = new DOMParser().parseFromString(SRC, "text/html");
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

// Seeded ONCE. The map the plugin builds is keyed by live node identity, so
// re-seeding between tests would replace every node and quietly turn the end-to-end
// block into a test of the unpaired path.
beforeAll(async () => {
  window.clayEditMode = true;
  seedDocument();
  snapshot = await import("../../src/core/snapshot.js");
  saveCore = await import("../../src/core/save-core.js");
});

afterAll(() => {
  snapshot.setSaveRenderer(null);
});

describe("the renderer sits on the save path, and only there", () => {
  beforeEach(() => {
    snapshot.setSaveRenderer(null);
    jest.restoreAllMocks();
  });

  test("with no renderer, a save is the full serialization", () => {
    expect(snapshot.captureForSave({ emitForSync: false }))
      .toBe("<!DOCTYPE html>" + document.documentElement.outerHTML);
  });

  test("a renderer is handed the prepared clone and today's bytes", () => {
    let seen = null;
    snapshot.setSaveRenderer((clone, today) => {
      seen = { clone, today };
      return "RENDERED";
    });
    expect(snapshot.captureForSave({ emitForSync: false })).toBe("RENDERED");
    expect(seen.today).toBe("<!DOCTYPE html>" + document.documentElement.outerHTML);
    expect(seen.clone.querySelector("#list")).not.toBeNull();
    expect(seen.clone.ownerDocument).not.toBe(document);          // a detached clone
    expect(snapshot.originalSnapshotNode(seen.clone.querySelector("#list")))
      .toBe(document.querySelector("#list"));                      // traceable to the page
  });

  test("forSave goes through it and the comparison baselines do not", () => {
    snapshot.setSaveRenderer(() => "RENDERED");
    const { forSave, forComparison, forDirty } = snapshot.captureForSaveAndComparison({ emitForSync: false });
    expect(forSave).toBe("RENDERED");
    expect(forComparison).toBe("<!DOCTYPE html>" + document.documentElement.outerHTML);
    expect(forDirty).toBe(forComparison);
  });

  test("captureForComparison and captureForDirtyCheck never see it", () => {
    snapshot.setSaveRenderer(() => "RENDERED");
    expect(snapshot.captureForComparison()).not.toBe("RENDERED");
    expect(snapshot.captureForDirtyCheck()).not.toBe("RENDERED");
    expect(snapshot.captureForComparisonAndDirty().forComparison).not.toBe("RENDERED");
  });

  test("a renderer that throws costs the page nothing", () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    snapshot.setSaveRenderer(() => { throw new Error("boom"); });
    expect(snapshot.captureForSave({ emitForSync: false }))
      .toBe("<!DOCTYPE html>" + document.documentElement.outerHTML);
    expect(err).toHaveBeenCalled();
  });

  test("captureSaveClone returns the save-domain tree without emitting a sync frame", () => {
    const listener = jest.fn();
    document.addEventListener("clay:snapshot-ready", listener);
    const clone = snapshot.captureSaveClone();
    document.removeEventListener("clay:snapshot-ready", listener);
    expect(listener).not.toHaveBeenCalled();
    expect(clone.querySelector("#list")).not.toBeNull();
  });
});

describe("onSaveAccepted fires for bytes the host took, and nothing else", () => {
  let accepted;

  beforeEach(() => {
    jest.restoreAllMocks();
    accepted = [];
    saveCore.resetSaveAttempts();
    saveCore.onSaveAccepted((html) => accepted.push(html));
  });

  test("a 200 reports the exact bytes that were sent", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify({ msg: "Saved" })
    }));
    const result = await saveCore.saveHtml("<html><body>sent</body></html>");
    expect(result.ok).toBe(true);
    expect(accepted).toEqual(["<html><body>sent</body></html>"]);
  });

  test("a refusal reports nothing", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn(async () => ({
      ok: false, status: 412, statusText: "", text: async () => JSON.stringify({ msg: "Conflict" })
    }));
    const result = await saveCore.saveHtml("<html><body>sent</body></html>");
    expect(result.ok).toBe(false);
    expect(accepted).toEqual([]);
  });
});

describe("the plugin, end to end", () => {
  beforeAll(async () => {
    // The source this document was served from. Same bytes, so a no-edit save has to
    // give them back unchanged.
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      redirected: false,
      type: "basic",
      headers: { get: (name) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
      text: async () => SRC,
    }));
    const mod = await import("../../src/plugins/source.js");
    source = mod;
    await mod.source.ready;
  });

  test("it installed, and paired the whole document", () => {
    const stats = source.source.stats();
    expect(stats.installed).toBe(true);
    expect(stats.refused).toBeNull();
    expect(stats.paired).toBeGreaterThan(10);
    expect(stats.unmatchedLive).toBe(0);
    expect(stats.unmatchedSource).toBe(0);
    expect(stats.unresolved).toBe(0);   // every clone node traced back to a live one
    expect(source.source.text()).toBe(SRC);
  });

  test("a no-edit save through the real pipeline returns the file byte for byte", () => {
    expect(snapshot.captureForSave({ emitForSync: false })).toBe(SRC);
  });

  test("an edit reprints the edit and copies the rest", () => {
    // `.data`, not `.textContent`: assigning textContent replaces the text node, and
    // the map is keyed by node identity, so the revert below would leave an unpaired
    // node behind for every test after this one.
    const text = document.querySelector("[data-id='b']").firstChild;
    text.data = "BETA";
    const out = snapshot.captureForSave({ emitForSync: false });
    text.data = "beta";
    expect(out).toContain("<li data-id='b'>BETA</li>");
    expect(out).toContain("<li data-id='a'>alpha</li>");   // untouched, still single-quoted
    expect(out).toContain("<ul id=list>");
    expect(out.split("\n").length).toBe(SRC.split("\n").length);
  });

  test("a render that changes the tree falls back, counts, and says so", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const events = [];
    document.addEventListener("clay:save-reprinted", (e) => events.push(e.detail));

    const before = source.source.stats().reprints;
    const clone = snapshot.captureSaveClone();
    const today = "<!DOCTYPE html>" + clone.outerHTML;
    const out = source.renderSave(clone, today, { corrupt: "drop-first-text" });

    expect(out).toBe(today);                                // the floor: today's bytes
    expect(source.source.stats().reprints).toBe(before + 1);
    expect(events).toHaveLength(1);
    expect(typeof events[0].reason).toBe("string");
    expect(warn).toHaveBeenCalled();
  });

  test("a render that changes only bytes is sent, because the document is the same", () => {
    // Not a fallback: breakText reprints every text node, which changes the bytes and
    // leaves the tree identical. The verifier compares trees, so it passes, and it is
    // right to. Reading a pass here as "the verifier is blind" is a mistake this
    // project has made once already.
    const before = source.source.stats().reprints;
    const clone = snapshot.captureSaveClone();
    const today = "<!DOCTYPE html>" + clone.outerHTML;
    const out = source.renderSave(clone, today, { breakText: true });
    expect(out).not.toBe(today);
    expect(source.source.stats().reprints).toBe(before);
  });
});

/**
 * locate(), through the plugin.
 *
 * The core tests cover the function itself. The claim here is the WIRING, which can break on its
 * own: the map is built by pairing a save clone, and every entry is keyed through snapshot
 * provenance back to the live node. So the thing a caller holds, a live element off the page, has to
 * be the thing the map answers to. Nothing on the save path reads the map by live node, so a
 * regression in that keying would be invisible to every other test in this file.
 */
describe("locate answers for live elements, in the bytes the plugin believes are on disk", () => {
  test("the range slices out of text() as exactly that element", () => {
    const loc = source.source.locate(document.querySelector("[data-id='a']"));
    expect(source.source.text().slice(loc.from, loc.to)).toBe("<li data-id='a'>alpha</li>");
  });

  test("including one inside a <template>, whose children are not its childNodes", () => {
    const li = document.querySelector("#tpl").content.querySelector("[data-id='x']");
    const loc = source.source.locate(li);
    expect(source.source.text().slice(loc.from, loc.to)).toBe("<li data-id='x'>from a template</li>");
  });

  test("a node the page created after boot is null, and so is nothing at all", () => {
    const fresh = document.createElement("li");
    document.querySelector("#list").appendChild(fresh);
    expect(source.source.locate(fresh)).toBeNull();
    fresh.remove();
    expect(source.source.locate(null)).toBeNull();
    expect(source.source.locate(undefined)).toBeNull();
  });
});

/**
 * The refresh, which nothing here used to drive.
 *
 * It runs at boot and again on every accepted save and every applied sync frame, which
 * makes it the most frequently executed code in the plugin and the only part that was
 * reached by no test at all. Two things were wrong in it, and both are invisible from
 * the save path: it took a save capture when it is not a save, and a re-model it could
 * not use took the re-pair down with it.
 */
describe("the refresh runs on a sync frame, and costs the page nothing else", () => {
  let hookRuns, undoFlush;

  beforeEach(() => {
    hookRuns = 0;
    window.__hookRuns = () => { hookRuns++; };
    undoFlush = jest.fn();
    window.clay = { ...(window.clay || {}), undo: { flush: undoFlush } };
    document.querySelector("#list").setAttribute("onbeforesave", "window.__hookRuns()");
    document.querySelector("#list").setAttribute("onbeforesnapshot", "window.__hookRuns()");
  });

  afterEach(() => {
    document.querySelector("#list").removeAttribute("onbeforesave");
    document.querySelector("#list").removeAttribute("onbeforesnapshot");
  });

  test("the handlers really do run on a save, or the next test proves nothing", () => {
    snapshot.captureSaveClone();
    expect(hookRuns).toBe(2);
    expect(undoFlush).toHaveBeenCalled();
  });

  test("a sync frame re-pairs without running them and without closing the undo batch", async () => {
    // A morph replaced live nodes, so the map has to be rebuilt. That is an inspection
    // of the page, not a save: closing the undo batch here splits the user's history at
    // a point they did not make, and the two handlers are page-author JavaScript that
    // can do anything at all, once per frame.
    const before = source.source.stats().refreshes;
    document.dispatchEvent(new CustomEvent("clay:sync-applied"));
    await flush();
    expect(source.source.stats().refreshes).toBe(before + 1);
    expect(hookRuns).toBe(0);
    expect(undoFlush).not.toHaveBeenCalled();
  });

  test("bytes the host took that do not model still leave the map re-paired", async () => {
    // The two halves fail independently. A re-model that is refused leaves the previous
    // model in place, which still describes real bytes; skipping the re-pair with it
    // left the map keyed by nodes a morph had already replaced, and every save after
    // that reprinted the whole document.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify({ msg: "Saved" })
    }));
    saveCore.resetSaveAttempts();

    const before = source.source.stats().refreshes;
    await saveCore.saveHtml(`<!DOCTYPE html SYSTEM "about:legacy-compat"><html><body><p>not this page</p></body></html>`);
    await flush();

    expect(source.source.stats().refreshes).toBe(before + 1);   // re-paired anyway
    expect(source.source.text()).toBe(SRC);                     // and kept the model it had
    expect(warn).toHaveBeenCalled();
  });

  test("bytes that do model are adopted, so the refusal above is not simply a no-op", async () => {
    const adopted = SRC.replace("<li data-id='b'>beta</li>", "<li data-id='b'>beta</li>\n      <li data-id='c'>gamma</li>");
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify({ msg: "Saved" })
    }));
    saveCore.resetSaveAttempts();

    await saveCore.saveHtml(adopted);
    await flush();
    expect(source.source.text()).toBe(adopted);
  });
});
