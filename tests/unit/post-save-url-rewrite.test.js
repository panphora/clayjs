import { jest } from "@jest/globals";

/**
 * cacheBust and refetch-on-save rewrite a URL AFTER the save baseline is taken.
 *
 * That rewrite must be invisible to every comparison. It was not: the element
 * was stamped `no-trigger-autosave` on the way past, but the baseline already
 * held it unmarked, so the next comparison stripped an element the baseline
 * contained and the page read dirty. Every page using either helper spent the
 * moments after its first successful save falsely dirty — a close warning about
 * work that had just been written, and on an autosave page an immediate second
 * save. It self-healed on the save after that, which is why nobody caught it.
 */

let snapshotMod, saveMod, cacheBust;

beforeAll(async () => {
  window.clayEditMode = true;
  snapshotMod = await import("../../src/core/snapshot.js");
  saveMod = await import("../../src/core/save.js");
  cacheBust = (await import("../../src/lib/cache-bust.js")).default;
  await import("../../src/attrs/refetch-on-save.js");
});

function okFetch() {
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ msg: "Saved" }),
  }));
}

describe("cacheBust", () => {
  beforeEach(() => {
    document.body.innerHTML = '<link id="css" rel="stylesheet" href="/style.css">';
  });

  test("changes the live URL but no comparison", () => {
    const before = snapshotMod.captureForComparison();

    cacheBust(document.getElementById("css"));

    expect(document.getElementById("css").getAttribute("href")).toContain("v=");
    expect(snapshotMod.captureForComparison()).toBe(before);
  });

  test("keeps the authored URL in the saved bytes", () => {
    cacheBust(document.getElementById("css"));

    const { forSave } = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    expect(forSave).toContain('href="/style.css"');
    expect(forSave).not.toContain("v=");
    expect(forSave).not.toContain("clay-authored-url");
  });

  test("a second bust does not record the first bust's output as authored", () => {
    const el = document.getElementById("css");
    cacheBust(el);
    cacheBust(el);

    const { forSave } = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    expect(forSave).toContain('href="/style.css"');
  });

  // Restoring unconditionally would discard this edit, and keep discarding it on
  // every save afterwards, so the page could never change that URL again.
  test("a later deliberate URL change is kept, not restored away", () => {
    const el = document.getElementById("css");
    cacheBust(el);

    el.setAttribute("href", "/theme.css");

    const { forSave } = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    expect(forSave).toContain('href="/theme.css"');
    expect(forSave).not.toContain("/style.css");
  });
});

describe("refetch-on-save", () => {
  beforeEach(() => {
    document.body.innerHTML = '<img id="pic" refetch-on-save src="/pic.png">';
  });

  test("the page is clean immediately after the save that triggered it", async () => {
    okFetch();
    await saveMod.savePage();
    await new Promise((r) => setTimeout(r, 0));

    // The swap has happened by now: the save-saved event drove it.
    expect(document.querySelectorAll("img").length).toBe(2);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  // During the overlap the live DOM holds the old element and its replacement.
  // A capture containing both differs from the baseline by a whole element.
  test("a capture taken during the overlap serializes exactly one element", () => {
    document.dispatchEvent(new CustomEvent("clay:save-saved"));
    expect(document.querySelectorAll("img").length).toBe(2);

    const { forSave } = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    expect(forSave.match(/<img/g)).toHaveLength(1);
    expect(forSave).toContain('src="/pic.png"');
    expect(forSave).not.toContain("clay-superseded");
  });

  test("a second save during the overlap does not swap the outgoing element again", () => {
    document.dispatchEvent(new CustomEvent("clay:save-saved"));
    document.dispatchEvent(new CustomEvent("clay:save-saved"));

    // The original plus one replacement per live element, never a clone of the
    // element already on its way out.
    expect(document.querySelectorAll("img").length).toBe(3);
    const { forSave } = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    expect(forSave.match(/<img/g)).toHaveLength(1);
  });
});

describe("cacheBust and refetch-on-save on the same element", () => {
  test("keep the originally authored URL", () => {
    document.body.innerHTML = '<img id="pic" refetch-on-save src="/pic.png">';

    cacheBust(document.getElementById("pic"));
    document.dispatchEvent(new CustomEvent("clay:save-saved"));

    const { forSave } = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    expect(forSave).toContain('src="/pic.png"');
    expect(forSave.match(/<img/g)).toHaveLength(1);
  });
});
