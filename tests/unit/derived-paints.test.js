import { jest } from "@jest/globals";

/**
 * Painted output is derived (lib/derived.js): the sapjs core repaints it inside
 * the merge, before live sync records a baseline, and nothing counts it as an edit.
 *
 *   - two tabs change different records and a total repaints on both, with no
 *     conflict (Astra's fixture);
 *   - the repaint lands before the merge is announced and before the disk base
 *     is recorded;
 *   - a file whose painted attributes went stale mounts healed, reads as clean,
 *     and a disk frame carrying the same stale paints never wins over them;
 *   - a paint-only frame changes nothing and leaves the page clean.
 *
 * The real core runs here (src/vendor/sap-core.vendor.js) on the real hub.
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
let Sap;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  jest.spyOn(console, "log").mockImplementation(() => {});

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
  const { derived } = await import("../../src/lib/derived.js");
  const Mutation = (await import("../../src/lib/mutation.js")).default;
  window.clay = { derived, Mutation };
  Sap = (await import("../../src/vendor/sap-core.vendor.js")).default;
});

beforeEach(async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  Sap._reset();
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

async function open(body) {
  document.body.innerHTML = body;
  const baseline = snapshot.captureForComparison();
  save.setLastSavedContents(baseline);
  save.setUnsavedChanges(false);
  Sap.mount(document.querySelector("[sap]"));
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  return baseline;
}

const rows = (a, b, sum) =>
  `<main sap><ul items="rows"><li item data-id="a" state="data-qty:num" data-qty="${a}"></li>` +
  `<li item data-id="b" state="data-qty:num" data-qty="${b}"></li></ul>` +
  `<output data-id="sum" text="sum(state.rows, 'qty')">${sum}</output></main>`;
const qty = (id) => document.querySelector(`[data-id="${id}"]`).getAttribute("data-qty");
const sum = () => document.querySelector('[data-id="sum"]').textContent;

test("two tabs change different records: both land, the total repaints, nothing conflicts", async () => {
  const sync = makeSync();
  await open(rows(1, 1, 2));
  sync.lastHtml = captureFrame();
  const frame = sync.lastHtml.replace('data-qty="1"></li></ul>', 'data-qty="3"></li></ul>').replace(">2</output>", ">4</output>");

  document.querySelector('[data-id="a"]').setAttribute("data-qty", "2");
  await Promise.resolve();
  Sap.refresh();
  expect(sum()).toBe("3");
  expect(gate.pageMaybeDirty()).toBe(true);

  let sumWhenAnnounced = null;
  let report = null;
  const onApplied = (e) => { sumWhenAnnounced = sum(); report = e.detail.report; };
  document.addEventListener("clay:sync-applied", onApplied);
  await sync._doApplyUpdate(frame, 5, null);
  document.removeEventListener("clay:sync-applied", onApplied);

  expect([qty("a"), qty("b")]).toEqual(["2", "3"]);
  expect(sum()).toBe("5");
  expect(sumWhenAnnounced).toBe("5");
  expect(report.conflicts).toEqual([]);
  sync.stop();
});

test("a clean tab records its disk base after the repaint, never the frame's stale total", async () => {
  const sync = makeSync();
  await open(rows(1, 1, 2));
  sync.lastHtml = captureFrame();
  const stale = sync.lastHtml.replace('data-qty="1"></li></ul>', 'data-qty="3"></li></ul>');

  await sync._doApplyUpdate(stale, 6, null);

  expect(sum()).toBe("4");
  expect(sync._diskBase).toContain(">4</output>");
  expect(gate.pageMaybeDirty()).toBe(false);
  sync.stop();
});

const steps = (rowsHtml) =>
  `<main sap><p data-id="count" text="count(state.steps, (s) => s.status === 'done') + ' done'">0 done</p><table><tbody items="steps">${rowsHtml}</tbody></table></main>`;
const step = (id, status, painted) =>
  `<tr item data-id="${id}" class="step" state="data-status" data-status="${status}" ` +
  `attr:data-state="item.status === 'done' ? 'accepted' : 'waiting'" class:is-done="item.status === 'done'" ` +
  `data-state="${painted}"><td text="item.status">pending</td></tr>`;

test("a stale painted attribute heals on open, reads as clean, and never wins a disk merge", async () => {
  const sync = makeSync();
  const file = `<!DOCTYPE html><html><head></head><body>${steps(step("s1", "done", "waiting"))}</body></html>`;
  const baseline = await open(steps(step("s1", "done", "waiting")));
  const s1 = document.querySelector('[data-id="s1"]');
  expect(s1.dataset.state).toBe("accepted");
  expect(s1.classList.contains("is-done")).toBe(true);
  expect(snapshot.captureForComparison()).toBe(baseline);

  sync._setDiskBase(file, sync._ticket());
  const agent = file.replace("</tbody>", `${step("s2", "done", "waiting")}</tbody>`);
  let report = null;
  const onApplied = (e) => { report = e.detail.report; };
  document.addEventListener("clay:sync-applied", onApplied);
  await sync._doApplyExternal(agent, 31, "disk-1");
  document.removeEventListener("clay:sync-applied", onApplied);

  const s2 = document.querySelector('[data-id="s2"]');
  expect(s1.dataset.state).toBe("accepted");
  expect(s2.dataset.state).toBe("accepted");
  expect(s2.classList.contains("is-done")).toBe(true);
  expect(s2.querySelector("td").textContent).toBe("done");
  expect(document.querySelector('[data-id="count"]').textContent).toBe("2 done");
  expect(report.conflicts).toEqual([]);
  expect(gate.pageMaybeDirty()).toBe(false);
  sync.stop();
});

test("a sap-error beacon is never a paint and never saved", async () => {
  const page = (beacon) =>
    `<main sap${beacon ? ' sap-error="E50"' : ""}><p data-id="p" text="'hi'">hi</p></main>`;

  document.body.innerHTML = page(false);
  const cleanSignature = save.currentPaintSignature();
  const cleanSave = snapshot.captureSaveClone({ flushUndo: false });

  document.body.innerHTML = page(true);
  const beaconedSignature = save.currentPaintSignature();
  const beaconedSave = snapshot.captureSaveClone({ flushUndo: false });

  expect(beaconedSave.querySelector("[sap-error]")).toBeNull();
  expect(beaconedSave.hasAttribute("sap-error")).toBe(false);
  expect(beaconedSignature).toBe(cleanSignature);
  expect(beaconedSave.outerHTML).toBe(cleanSave.outerHTML);

  // A file that still carries a beacon (written by an older clayjs) is not a
  // file whose painted values changed.
  const { paintSignatureOfHtml } = await import("../../src/lib/derived.js");
  const beaconedFile = paintSignatureOfHtml(`<!DOCTYPE html><html><body>${page(true)}</body></html>`);
  expect(beaconedFile).not.toContain("sap-error");
  expect(beaconedFile).toContain("#hi");
});

test("a page with no derive engine keeps the painted values a disk frame brings", async () => {
  // A fresh registry with no derive engine in it: the [sap] markup is there, but
  // nothing can repaint it, so a merge must keep what the frame painted.
  jest.resetModules();
  delete window.clay;
  document.body.innerHTML = `<main sap><table><tbody items="steps"></tbody></table></main>`;

  const freshSnapshot = await import("../../src/core/snapshot.js");
  const freshDerived = await import("../../src/lib/derived.js");
  const freshSave = await import("../../src/core/save.js");
  const liveSyncModule = await import("../../src/sync/live-sync.js");
  liveSyncModule.liveSync.stop();
  freshSave.setLastSavedContents(freshSnapshot.captureForComparison());
  freshSave.setUnsavedChanges(false);

  const frame = `<main sap><table><tbody items="steps">` +
    `<tr item attr:data-state="item.state" data-state="accepted"><td text="item.state">accepted</td></tr>` +
    `</tbody></table></main>`;

  const sync = new liveSyncModule.LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  await sync._doApplyExternal(frame, 5, null);

  expect(freshDerived.derivedActive()).toBe(false);
  const row = document.querySelector("tr[item]");
  expect(row.getAttribute("data-state")).toBe("accepted");
  expect(row.querySelector("td").textContent).toBe("accepted");
  sync.stop();
});

test("a frame that differs only in painted output changes nothing", async () => {
  const sync = makeSync();
  await open(rows(1, 1, 2));
  sync.lastHtml = captureFrame();
  const output = document.querySelector('[data-id="sum"]');
  const text = output.firstChild;
  const paintOnly = sync.lastHtml.replace(">2</output>", ">99</output>");

  await sync._doApplyUpdate(paintOnly, 7, null);

  expect(document.querySelector('[data-id="sum"]')).toBe(output);
  expect(output.firstChild).toBe(text);
  expect(sum()).toBe("2");
  expect(gate.pageMaybeDirty()).toBe(false);
  sync.stop();
});
