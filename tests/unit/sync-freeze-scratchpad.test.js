import { jest } from "@jest/globals";

/**
 * A frozen element is a scratchpad, not a hole in the document.
 *
 * clay="freeze" keeps an element's contents per-tab: they are never saved and
 * never synced, and the page's runtime owns them. Live sync used to ignore the
 * element itself, so a record that arrived new (a card with a frozen due badge)
 * lost the badge and a peer's change to a frozen element's own attributes never
 * applied. Only the descendants are ignored now.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const PAGE =
  '<ul id="cards">' +
  '<li data-id="c1"><h3>One</h3><span class="due" clay="freeze" data-for="c1"></span></li>' +
  "</ul>";

let LiveSync, snapshot, gate, save;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  // save-freeze records each region's authored innerHTML at import time, so the
  // page has to look like a freshly served one before the module loads.
  document.body.innerHTML = PAGE;
  await import("../../src/attrs/save-freeze.js");
  const m = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = m);
  m.liveSync.stop();
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
});

beforeEach(async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  window.clay = { testMode: true };
  document.body.innerHTML = PAGE;
  // The fresh scratch is empty on the served page; let save-freeze capture it
  // before anything writes this tab's own contents into it.
  await new Promise((r) => setTimeout(r, 0));
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  delete window.clay;
});

/** A booted clean tab on the page, holding the peer's base. */
async function cleanTab() {
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  const sync = new LiveSync();
  sync.lane = "live";
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html");
  sync._requestFrame = () => null;
  sync.lastHtml = captureFrame();
  return sync;
}

function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

/** What a peer running this runtime sends after editing its own DOM. */
function peerFrame(edit) {
  const doc = new DOMParser().parseFromString(captureFrame(), "text/html");
  edit(doc);
  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
}

const due = (id) => document.querySelector(`[data-id="${id}"] .due`);

test("a new record arrives with its scratchpad, empty", async () => {
  const sync = await cleanTab();
  const frame = peerFrame((doc) => {
    doc.querySelector("#cards").insertAdjacentHTML(
      "beforeend",
      '<li data-id="c2"><h3>Two</h3>' +
        '<span class="due" clay="freeze" data-for="c2">peer scratch</span></li>'
    );
  });

  await sync._doApplyUpdate(frame, 1, null, null);

  const badge = due("c2");
  expect(badge).not.toBeNull();
  expect(badge.getAttribute("data-for")).toBe("c2");
  expect(badge.textContent).toBe("");
  sync.stop();
});

test("an existing scratchpad keeps its own contents", async () => {
  const sync = await cleanTab();
  const scratch = due("c1");
  scratch.textContent = "overdue";
  await Promise.resolve();

  const frame = peerFrame((doc) => {
    doc.querySelector('[data-id="c1"] h3').textContent = "Uno";
    doc.querySelector('[data-id="c1"] .due').textContent = "their scratch";
  });

  await sync._doApplyUpdate(frame, 2, null, null);

  expect(document.querySelector('[data-id="c1"] h3').textContent).toBe("Uno");
  expect(due("c1")).toBe(scratch);
  expect(due("c1").textContent).toBe("overdue");
  sync.stop();
});

test("a frozen element's own attributes merge", async () => {
  const sync = await cleanTab();
  const scratch = due("c1");
  scratch.textContent = "overdue";
  await Promise.resolve();

  const frame = peerFrame((doc) => {
    doc.querySelector('[data-id="c1"] .due').setAttribute("data-for", "changed");
  });

  await sync._doApplyUpdate(frame, 3, null, null);

  expect(due("c1")).toBe(scratch);
  expect(due("c1").getAttribute("data-for")).toBe("changed");
  expect(due("c1").textContent).toBe("overdue");
  sync.stop();
});

test("scratch never travels", async () => {
  await cleanTab();
  const scratch = due("c1");
  scratch.textContent = "overdue";
  await Promise.resolve();

  const html = captureFrame();
  const doc = new DOMParser().parseFromString(html, "text/html");

  expect(html).not.toContain("overdue");
  expect(doc.querySelector('[data-id="c1"] .due')).not.toBeNull();
  expect(doc.querySelector('[data-id="c1"] .due').textContent).toBe("");
});

test("a frozen element's live contents survive as the same nodes", async () => {
  const sync = await cleanTab();
  const scratch = due("c1");
  const overdue = document.createElement("b");
  overdue.textContent = "overdue";
  scratch.appendChild(overdue);
  await Promise.resolve();

  const frame = peerFrame((doc) => {
    doc.querySelector('[data-id="c1"] .due').setAttribute("data-for", "changed");
    doc.querySelector('[data-id="c1"] h3').textContent = "Uno";
  });

  await sync._doApplyUpdate(frame, 4, null, null);

  expect(due("c1")).toBe(scratch);
  expect(due("c1").getAttribute("data-for")).toBe("changed");
  expect(due("c1").querySelector("b")).toBe(overdue);
  expect(document.querySelector('[data-id="c1"] h3').textContent).toBe("Uno");
  sync.stop();
});

test("a dirty tab takes the three-way path and still keeps its scratch", async () => {
  const sync = await cleanTab();
  const frame = peerFrame((doc) => {
    doc.querySelector('[data-id="c1"] h3').textContent = "Uno";
    doc.querySelector('[data-id="c1"] .due').setAttribute("data-for", "changed");
  });
  const scratch = due("c1");
  scratch.textContent = "overdue";
  document.querySelector("#cards").insertAdjacentHTML(
    "beforeend",
    '<li data-id="c9"><h3>Mine</h3></li>'
  );
  await Promise.resolve();
  expect(gate.pageMaybeDirty()).toBe(true);

  await sync._doApplyUpdate(frame, 5, null, null);

  expect(document.querySelector('[data-id="c1"] h3').textContent).toBe("Uno");
  expect(due("c1")).toBe(scratch);
  expect(due("c1").getAttribute("data-for")).toBe("changed");
  expect(due("c1").textContent).toBe("overdue");
  expect(document.querySelector('[data-id="c9"]')).not.toBeNull();
  sync.stop();
});
