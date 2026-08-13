import { jest } from "@jest/globals";

/**
 * The dirty check has to see the whole document, and autosave has to eventually
 * fire. Each of these left a page that was unsaved and did not say so.
 */

describe("the mutation hub watches the whole document", () => {
  let Mutation;

  beforeAll(async () => {
    Mutation = (await import("../../src/lib/mutation.js")).default;
  });

  test("a <head> change reaches subscribers", async () => {
    const seen = [];
    const sub = Mutation.onAnyChange({ debounce: 0, require: "observed" }, (changes) => {
      seen.push(...(changes || []));
    });

    // Every capture serializes documentElement, so a title change is a real
    // difference. Watching only body meant it could never trigger a save while
    // still counting as dirty: permanently unsaved, clearable only by hand.
    document.title = "changed-title-" + Date.now();
    await new Promise((r) => setTimeout(r, 10));

    expect(seen.length).toBeGreaterThan(0);
    sub();
  });

  // The raw lane is deliberately unfiltered, and undo consumes it. savestatus
  // flips on every single save, so without this every save would push an entry
  // into the undo stack and Cmd+Z after a save would undo that, not the edit.
  test("clayjs's own root attributes do not reach subscribers", async () => {
    const seen = [];
    const sub = Mutation.onAnyChange({ debounce: 0, require: "observed" }, (changes) => {
      seen.push(...(changes || []));
    });

    document.documentElement.setAttribute("savestatus", "saving");
    document.documentElement.setAttribute("savestatus", "saved");
    document.documentElement.setAttribute("editmode", "true");
    await new Promise((r) => setTimeout(r, 10));

    expect(seen).toHaveLength(0);
    sub();
  });

  test("but a page's own root attribute still does", async () => {
    const seen = [];
    const sub = Mutation.onAnyChange({ debounce: 0, require: "observed" }, (changes) => {
      seen.push(...(changes || []));
    });

    document.documentElement.setAttribute("data-theme", "dark");
    await new Promise((r) => setTimeout(r, 10));

    expect(seen.length).toBeGreaterThan(0);
    sub();
  });
});

describe("maxWait stops continuous churn from starving a debounced callback", () => {
  let Mutation;

  beforeAll(async () => {
    Mutation = (await import("../../src/lib/mutation.js")).default;
  });

  // Real timers, scaled down: MutationObserver delivers on a microtask, which fake
  // timers do not drive, so a faked version of this would only ever test the mock.
  test("a page mutating faster than the debounce still fires within maxWait", async () => {
    let fired = 0;
    const sub = Mutation.onAnyChange(
      { debounce: 60, maxWait: 200, omitChangeDetails: true, require: "observed" },
      () => { fired++; }
    );

    const ticker = document.createElement("div");
    document.body.appendChild(ticker);

    // A clock ticking faster than the debounce: every tick resets the timer, so
    // without a ceiling the callback would never run at all.
    const start = Date.now();
    while (Date.now() - start < 500) {
      ticker.textContent = `tick ${Date.now()}`;
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(fired).toBeGreaterThan(0);
    sub();
    ticker.remove();
  });
});
