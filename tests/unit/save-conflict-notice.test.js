import { jest } from "@jest/globals";

// The page's only word on a refused save, in the population that has no status
// chip: the chip is a plugin and it is off by default, so a bare document showed
// nothing at all while autosave sat suspended.

let overwrite;

beforeAll(async () => {
  window.clayEditMode = true;
  await import("../../src/core/save-conflict-notice.js"); // onDomReady runs init; jsdom is 'complete'
});

beforeEach(() => {
  overwrite = jest.fn().mockResolvedValue({ ok: true, msg: "Saved" });
  window.clay = { save: { overwrite } };
});

const fire = (state, detail = {}) =>
  document.dispatchEvent(new CustomEvent("clay:save-" + state, { detail }));

const bar = () => document.querySelector("[data-clay-conflict]");
const buttonSaying = (re) =>
  [...bar().querySelectorAll("button")].find((b) => re.test(b.textContent));

test("says what happened, and that saving has stopped", () => {
  fire("conflict");

  expect(bar()).not.toBeNull();
  expect(bar().textContent).toContain("This page was updated elsewhere.");
  // The half that matters: everything else on screen already tells them their
  // text is fine, and this is the only thing telling them it is not being saved.
  expect(bar().textContent).toContain("Saving is paused.");
});

test("never lands in the saved file", () => {
  fire("conflict");

  // Created at runtime and marked out of the save, the watch and the snapshot.
  // An authored copy of this element would be serialized into the document.
  expect(bar().getAttribute("clay")).toBe("no-save no-watch no-snapshot");
});

test("names the source when the host knows one, and stays vague when it does not", () => {
  fire("conflict", { changedBy: "another-tab" });
  expect(bar().textContent).toContain("in another tab");

  fire("conflict", { changedBy: "an-agent" });
  expect(bar().textContent).toContain("by an agent");

  // A filesystem write has no author, and an unknown value must not reach the page.
  fire("conflict", { changedBy: "wat" });
  expect(bar().textContent).toContain("updated elsewhere.");
});

test("says a timed-out save may be the cause, and never over a host that named one", () => {
  // The tab keeps its stamp across a timeout rather than reconciling, so a
  // refusal here may be answering the person's own write. Without this line that
  // refusal is unexplainable, which is what the old reconcile was avoiding by
  // guessing instead.
  fire("conflict", { changedBy: null, afterTimeout: true });
  expect(bar().textContent).toContain("possibly by your own save that timed out");

  // The host actually knows. Its answer beats the guess.
  fire("conflict", { changedBy: "another-person", afterTimeout: true });
  expect(bar().textContent).toContain("by someone else");
  expect(bar().textContent).not.toContain("timed out");

  // An ordinary conflict is worded as it always was.
  fire("conflict", { changedBy: null, afterTimeout: false });
  expect(bar().textContent).toContain("This page was updated elsewhere.");
});

test("goes away when a save lands", () => {
  fire("conflict");
  expect(bar().style.display).toBe("flex");

  fire("saved");
  expect(bar().style.display).toBe("none");
});

test("keep mine asks the library to overwrite", async () => {
  fire("conflict");
  buttonSaying(/Keep mine/).click();

  expect(overwrite).toHaveBeenCalledTimes(1);
});

test("a second click while the save is in flight does not send a second save", async () => {
  let release;
  overwrite.mockImplementation(() => new Promise((r) => { release = r; }));

  fire("conflict");
  const keep = buttonSaying(/Keep mine/);
  keep.click();
  keep.click();
  keep.click();

  expect(overwrite).toHaveBeenCalledTimes(1);
  release({ ok: true });
});

test("a failed overwrite stays on screen and offers another go", async () => {
  overwrite.mockResolvedValue({ ok: false, msg: "Network error" });

  fire("conflict");
  buttonSaying(/Keep mine/).click();
  await Promise.resolve();
  await Promise.resolve();

  // Clearing here would put the page back to looking like one that saves fine.
  expect(bar().style.display).toBe("flex");
  expect(bar().textContent).toContain("Your edits are still here.");
  expect(buttonSaying(/Try again/)).toBeDefined();
});

describe("the discard arms before it fires", () => {
  const reload = jest.fn();

  beforeAll(() => {
    delete window.location;
    window.location = { reload };
  });

  beforeEach(() => {
    jest.useFakeTimers();
    reload.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("the first click does not reload", () => {
    fire("conflict");
    buttonSaying(/Load theirs/).click();

    expect(reload).not.toHaveBeenCalled();
    // The label carries the warning, so the second click cannot be a surprise.
    expect(buttonSaying(/Yes, drop my edits/)).toBeDefined();
  });

  test("the second click does reload", () => {
    fire("conflict");
    buttonSaying(/Load theirs/).click();
    buttonSaying(/Yes, drop my edits/).click();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("it disarms itself, so a bar left open is not one stray tap from a discard", () => {
    fire("conflict");
    buttonSaying(/Load theirs/).click();

    jest.advanceTimersByTime(5000);

    expect(buttonSaying(/Yes, drop my edits/)).toBeUndefined();
    buttonSaying(/Load theirs/).click();
    expect(reload).not.toHaveBeenCalled();
  });

  test("Escape backs out of an armed discard", () => {
    fire("conflict");
    buttonSaying(/Load theirs/).click();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(buttonSaying(/Yes, drop my edits/)).toBeUndefined();
  });

  test("a fresh conflict never opens already armed", () => {
    fire("conflict");
    buttonSaying(/Load theirs/).click();
    fire("saved");
    fire("conflict");

    expect(buttonSaying(/Yes, drop my edits/)).toBeUndefined();
  });
});
