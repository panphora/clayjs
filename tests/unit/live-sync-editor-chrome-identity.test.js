import { jest } from "@jest/globals";

/**
 * Editor chrome repeats a record's data-id, and none of it is part of the saved
 * record. Counting it while walking a side made the record's authored identity
 * ambiguous, so the merge paired the record with nothing and wrote a second copy
 * of it beside the first.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync;
let snapshot;
let gate;
let save;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
});

beforeEach(async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  document.documentElement.removeAttribute("autosave");
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  delete window.clay;
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

async function settle(body) {
  document.body.innerHTML = body;
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

const diskDoc = (bodyInner) =>
  `<!DOCTYPE html><html><head></head><body>${bodyInner}</body></html>`;

const board = (a, b) => `<div data-id="colA">${a}</div><div data-id="colB">${b}</div>`;
const card = (id, title, body, chrome = "") =>
  `<article data-id="${id}"><h3>${title}</h3><p>${body}</p>${chrome}</article>`;
const chromeFor = (id) => `<div clay="editor-ui"><div data-id="${id}">tools</div></div>`;

test("a duplicated data-id inside editor chrome leaves the saved record's identity unique", async () => {
  const sync = makeSync();
  await settle(board(card("c1", "one", "first card") + card("c2", "two", "alpha beta gamma delta"), card("c3", "three", "third card")));
  sync._diskBase = snapshot.captureForSaveAndComparison({ emitForSync: false }).forSave;
  sync.start("index.html");
  document.querySelector('[data-id="c2"] h3').textContent = "two (local)";
  await Promise.resolve();

  await sync._doApplyExternal(
    diskDoc(
      board(
        card("c1", "one", "first card"),
        card("c3", "three", "third card") +
          card("c2", "two", "completely rewritten by the agent now", chromeFor("c2"))
      )
    ),
    60
  );

  const c2s = [...document.querySelectorAll('[data-id="c2"]')].map(
    (el) => el.parentElement.dataset.id + ":" + el.textContent
  );
  expect(c2s).toEqual(["colB:two (local)completely rewritten by the agent now"]);
  sync.stop();
});
