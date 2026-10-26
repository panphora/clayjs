import { jest } from "@jest/globals";

/**
 * The editor-only services that outlive a single keystroke: the AI comment box, the save
 * chip and the conflict notice.
 *
 * Each is a mode lease. What an exit must not do is throw away work none of them can
 * put back — a request still on the wire, a preview waiting for Keep or Revert, a
 * comment typed and not sent, a conflict nobody has answered — so `quiesce` refuses
 * over exactly those and `resume` leaves the same chrome, text and timer on screen. A
 * copy the recovery store kept from an earlier session is not one of them: it is a
 * record this page can still hand back, not input it is holding. After a committed exit
 * `dispose` stops every editor-only handler, so a save event or a selection in view
 * draws nothing.
 */

const fakeWire = { helpers: jest.fn(), send: jest.fn() };

jest.unstable_mockModule("../../src/plugins/wire.js", () => ({ default: fakeWire, wire: fakeWire }));

// The notice's store is not what this file is about: the point is which of its records
// the lease treats as input, so the store answers from here.
const kept = { count: 0, records: [] };

jest.unstable_mockModule("../../src/recovery/conflicts.js", () => ({
  pendingConflicts: () => kept.count,
  listConflicts: async () => ({ ok: true, records: kept.records }),
  dismissConflicts: async () => ({ ok: true }),
}));

window.clayEditMode = true;

const PAGE = '<section data-edit-id="hero"><h1>Old heading</h1><p>Old paragraph</p></section>';
const EDITED = '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const frames = async () => { await tick(); await tick(); };

const throwOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected a refusal");
};

const el = (selector) => document.querySelector(selector);
const chromeCount = () => document.querySelectorAll("[data-clay-ai-edit]").length;
const panel = () => el('[data-clay-ai-edit="panel"]');
const textarea = () => panel().querySelector("textarea");
const bar = () => el('[data-clay-ai-edit="status-bar"]');
const barButton = (name) => bar().querySelector(`[data-clay-ai-edit-part="bar-${name}"]`);
const chip = () => el("[data-clay-indicator]");
const noticeRoot = () => el("[data-clay-conflict]");

let aiEditParticipant;
let indicatorParticipant;
let conflictNoticeParticipant;
let storage;
let ledger;

function makeHandle() {
  let settle;
  const done = new Promise((resolve) => { settle = resolve; });
  return { id: "handle-1", done, cancel: jest.fn(), settle };
}

function mountPage() {
  document.querySelectorAll("[data-edit-id]").forEach((node) => node.remove());
  document.body.insertAdjacentHTML("afterbegin", PAGE);
  return el("[data-edit-id]");
}

function clickSection(section) {
  section.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

beforeAll(async () => {
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.scrollTo = () => {};

  storage = (await import("../../src/lib/doc-storage.js")).storage;
  // A conflict a reload left behind: the shell reads one small count key on every edit
  // boot, and that key is what asks for the notice here.
  kept.count = 1;
  kept.records = [{ id: "kept-1", root: "<p>mine</p>", conflicts: [{ id: "c1", label: "Edit", yours: "mine", now: "theirs" }] }];
  storage.local.set("conflicts", { count: 1, at: Date.now() });

  ledger = { size: 0, list: () => [], get: () => null, hasPendingApply: () => false, acknowledge: () => {} };
  window.clay = { conflicts: ledger, save: async () => ({ ok: true, msg: "Saved" }) };

  fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "ready" }]);

  ({ aiEditParticipant } = await import("../../src/plugins/ai-edit.js"));
  ({ indicatorParticipant } = await import("../../src/plugins/indicator.js"));
  ({ conflictNoticeParticipant } = await import("../../src/core/conflict-notice.js"));
  // The reply is applied through the merge engine, which the plugin fetches then; in
  // here it keeps every step of a send microtask-sized.
  await (await import("../../src/sync/merge-engine.js")).mergeEngine();
  await flush();
  await frames();
});

afterEach(() => {
  fakeWire.send.mockReset();
  fakeWire.send.mockImplementation(() => makeHandle());
});

// --- ai-edit ------------------------------------------------------------------

test("a preview on screen is preserved by a refusal, and dispose stops the handlers", async () => {
  const handle = makeHandle();
  fakeWire.send.mockImplementation(() => handle);

  const section = mountPage();
  clickSection(section);
  textarea().value = "tighten this";
  panel().querySelector('[data-clay-ai-edit-part="send"]').click();
  await flush();
  expect(fakeWire.send).toHaveBeenCalledTimes(1);

  handle.settle({ state: "done", result: { html: EDITED, model: "m" } });
  await flush();
  expect(el("h1").textContent).toBe("New heading");
  expect(barButton("keep").hidden).toBe(false);

  const lease = aiEditParticipant().prepare({ generation: 1, isCurrent: () => true });
  await lease.ready;
  lease.enable();

  // A preview nobody has kept or reverted is input this page still holds.
  const refused = throwOf(() => lease.quiesce());
  expect(refused).toMatchObject({ code: "pending-input" });
  expect(refused.pending).toHaveLength(1);

  lease.resume();
  expect(barButton("keep").hidden).toBe(false);
  expect(el("h1").textContent).toBe("New heading");

  // A selection made just before the exit leaves the chip's own timer behind: it is
  // bounded to the session and must not land in the view that follows.
  const range = document.createRange();
  range.selectNodeContents(el("p"));
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.dispatchEvent(new Event("selectionchange"));

  lease.dispose();
  expect(handle.cancel).toHaveBeenCalled();
  expect(chromeCount()).toBe(0);
  await new Promise((resolve) => setTimeout(resolve, 220));
  expect(el('[data-clay-ai-edit="chip"]')).toBeNull();

  // Nothing this service added is still listening: the page's own click and the
  // shortcut open nothing.
  clickSection(section);
  expect(panel()).toBeNull();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true }));
  expect(panel()).toBeNull();
  await flush();
});

test("a typed comment is unresolved prompt state; dispose takes the box and its drafts away", async () => {
  const lease = aiEditParticipant().prepare({ generation: 1, isCurrent: () => true });
  await lease.ready;
  lease.enable();

  const section = mountPage();
  clickSection(section);
  textarea().value = "add a bar chart";
  await flush();

  const refused = throwOf(() => lease.quiesce());
  expect(refused).toMatchObject({ code: "pending-input", pending: ["prompt"] });

  lease.resume();
  expect(panel().hidden).toBe(false);
  expect(textarea().value).toBe("add a bar chart");

  lease.dispose();
  expect(chromeCount()).toBe(0);
  expect([...document.querySelectorAll("style[clay]")].some((node) => node.textContent.includes("clay-ai-edit"))).toBe(false);

  // The next session builds one composer again, and the text typed in the last one is
  // not waiting in it.
  const next = aiEditParticipant().prepare({ generation: 2, isCurrent: () => true });
  await next.ready;
  next.enable();
  clickSection(section);
  expect(textarea().value).toBe("");
  next.dispose();
  await flush();
});

// --- indicator ----------------------------------------------------------------

test("the save chip owns no input, and dispose takes its chip, timer and handlers down", async () => {
  const lease = indicatorParticipant().prepare({ generation: 1, isCurrent: () => true });
  lease.enable();

  document.dispatchEvent(new CustomEvent("clay:save-saving"));
  expect(chip()).not.toBeNull();
  expect(chip().textContent).toBe("Saving\u2026");

  // A save in flight is the barrier's, not the chip's: it never refuses an exit.
  expect(lease.quiesce()).toBeUndefined();
  lease.resume();
  expect(chip().textContent).toBe("Saving\u2026");

  // Saved leaves a fade timer behind, and it goes with the session.
  document.dispatchEvent(new CustomEvent("clay:save-saved"));
  expect(chip().textContent).toBe("Saved");

  lease.dispose();
  expect(chip()).toBeNull();

  document.dispatchEvent(new CustomEvent("clay:save-saving"));
  expect(chip()).toBeNull();
});

test("a second arm adds no listener, and adoption takes the chip the boot already armed", () => {
  const adds = [];
  const real = document.addEventListener;
  document.addEventListener = function (type, handler, options) {
    adds.push({ target: this, type, handler, options });
    return real.call(this, type, handler, options);
  };
  let armed;
  let adopted;
  let boot;
  try {
    // The boot this tab made at import: one listener per save state plus the page state.
    boot = indicatorParticipant().prepare({ generation: 1, isCurrent: () => true });
    boot.enable();
    armed = adds.length;
    expect(adds.map((entry) => entry.type)).toEqual([
      "clay:save-saving", "clay:save-saved", "clay:save-error",
      "clay:save-offline", "clay:save-retrying", "clay:save-blocked",
      "clay:page-save-state",
    ]);
    expect(adds.every((entry) => entry.target === document)).toBe(true);

    // A second arm over the armed chip adds no closure.
    const again = indicatorParticipant().prepare({ generation: 1, isCurrent: () => true });
    again.enable();
    expect(adds).toHaveLength(armed);

    // Adoption is a lease over the armed chip, not a second arming.
    adopted = indicatorParticipant().prepare({ generation: 1, isCurrent: () => true, initial: true });
    adopted.enable();
    expect(adds).toHaveLength(armed);

    document.dispatchEvent(new CustomEvent("clay:save-saving"));
    expect(chip().textContent).toBe("Saving\u2026");

    adopted.dispose();

    expect(chip()).toBeNull();
    document.dispatchEvent(new CustomEvent("clay:save-saving"));
    expect(chip()).toBeNull();
    again.dispose();
    boot.dispose();
  } finally {
    adopted?.dispose();
    boot?.dispose();
    document.addEventListener = real;
  }
});

// --- conflict notice ----------------------------------------------------------

test("a copy the recovery store kept does not refuse an exit, and dispose stops the notice", async () => {
  await frames();
  // The boot above found a retained record and fetched the notice for it.
  expect(noticeRoot()).not.toBeNull();
  expect(noticeRoot().textContent).toContain("still here");

  const lease = conflictNoticeParticipant().prepare({ generation: 1, isCurrent: () => true });
  lease.enable();

  // A record that is still on screen from an earlier session is recoverable, not input
  // this page is holding.
  expect(lease.quiesce()).toBeUndefined();
  lease.resume();

  lease.dispose();
  expect(noticeRoot()).toBeNull();

  document.dispatchEvent(new CustomEvent("clay:sync-conflicts-changed"));
  await frames();
  expect(noticeRoot()).toBeNull();
});

test("the notice's adoption takes the shell the boot armed, and arms nothing again", async () => {
  const loss = { id: "lost-2", kind: "text", label: "Edit", yours: "mine", now: "theirs" };
  const adds = [];
  const real = document.addEventListener;
  document.addEventListener = function (type, handler, options) {
    adds.push({ target: this, type, handler, options });
    return real.call(this, type, handler, options);
  };
  let boot;
  let adopted;
  try {
    ledger.size = 1;
    ledger.list = () => [loss];

    const countArmed = (enable) => {
      const before = adds.length;
      enable();
      return adds.slice(before).map((entry) => entry.type);
    };

    // The boot this tab made at import: the shell's three handlers.
    boot = conflictNoticeParticipant().prepare({ generation: 1, isCurrent: () => true });
    expect(countArmed(() => boot.enable())).toEqual([
      "clay:sync-conflicts-changed", "clay:save-conflict", "clay:document-upgraded",
    ]);

    // Adoption is a lease over that shell, not a second arming.
    adopted = conflictNoticeParticipant().prepare({ generation: 1, isCurrent: () => true, initial: true });
    expect(countArmed(() => adopted.enable())).toEqual([]);

    // The same shell answers: one conflict, one notice.
    document.dispatchEvent(new CustomEvent("clay:sync-conflicts-changed"));
    await frames();
    expect(noticeRoot()).not.toBeNull();
    expect(noticeRoot().textContent).toContain("Another edit");

    adopted.dispose();
    expect(noticeRoot()).toBeNull();

    document.dispatchEvent(new CustomEvent("clay:sync-conflicts-changed"));
    await frames();
    expect(noticeRoot()).toBeNull();

    // A live entry after that exit arms one fresh shell, and its own dispose takes it down.
    const live = conflictNoticeParticipant().prepare({ generation: 2, isCurrent: () => true });
    expect(countArmed(() => live.enable())).toEqual([
      "clay:sync-conflicts-changed", "clay:save-conflict", "clay:document-upgraded",
    ]);
    document.dispatchEvent(new CustomEvent("clay:sync-conflicts-changed"));
    await frames();
    expect(noticeRoot()).not.toBeNull();

    live.dispose();
    expect(noticeRoot()).toBeNull();
  } finally {
    adopted?.dispose();
    boot?.dispose();
    document.addEventListener = real;
    ledger.size = 0;
    ledger.list = () => [];
  }
});

test("an unresolved current conflict refuses the exit and stays on screen through it", async () => {
  const loss = { id: "lost-1", kind: "text", label: "Edit", yours: "mine", now: "theirs" };
  ledger.size = 1;
  ledger.list = () => [loss];

  const lease = conflictNoticeParticipant().prepare({ generation: 2, isCurrent: () => true });
  lease.enable();

  // The ledger's loss asks the shell for the notice, which draws it.
  document.dispatchEvent(new CustomEvent("clay:sync-conflicts-changed"));
  await frames();
  expect(noticeRoot()).not.toBeNull();

  // Saving is blocked until this is answered, and answering needs the editor.
  expect(throwOf(() => lease.quiesce())).toMatchObject({ code: "conflict", pending: ["lost-1"] });

  lease.resume();
  expect(noticeRoot()).not.toBeNull();

  lease.dispose();
  expect(noticeRoot()).toBeNull();
  document.dispatchEvent(new CustomEvent("clay:sync-conflicts-changed"));
  await frames();
  expect(noticeRoot()).toBeNull();

  ledger.size = 0;
  ledger.list = () => [];
});

// --- ai-edit on a live entry ---------------------------------------------------

test("an explicit edit boot is adopted, not built twice, and its dispose takes the composer down", async () => {
  jest.resetModules();
  window.clayEditMode = true;
  fakeWire.helpers.mockClear();

  try {
    // The boot this tab made at import: one question to the host, one composer.
    const { aiEditParticipant: participant } = await import("../../src/plugins/ai-edit.js");
    await flush();
    await frames();
    expect(fakeWire.helpers).toHaveBeenCalledTimes(1);
    expect(panel()).not.toBeNull();

    // Adoption hands back the chrome that boot built, and asks the host nothing again.
    const adopted = await participant().prepare({ generation: 1, initial: true });
    await adopted.ready;
    await flush();
    expect(fakeWire.helpers).toHaveBeenCalledTimes(1);
    expect(panel()).not.toBeNull();

    adopted.dispose();
    expect(chromeCount()).toBe(0);

    // Nothing the boot added opens in the view that follows.
    clickSection(mountPage());
    expect(panel()).toBeNull();
    await flush();
  } finally {
    window.clayEditMode = true;
    fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "ready" }]);
    jest.resetModules();
  }
});

test("a helper answer that lands after the exit draws nothing in view", async () => {
  jest.resetModules();
  window.clayEditMode = true;
  let answer = null;
  fakeWire.helpers.mockImplementation(() => new Promise((resolve) => {
    answer = () => resolve([{ name: "ai-edit", state: "ready" }]);
  }));

  try {
    // The boot's question is still out when the page leaves edit.
    const { aiEditParticipant: participant } = await import("../../src/plugins/ai-edit.js");
    await flush();
    expect(answer).not.toBeNull();

    const adopted = await participant().prepare({ generation: 1, initial: true });
    adopted.dispose();

    window.clayEditMode = false;
    answer();
    await flush();
    await frames();

    // The answer belongs to the session that ended: it builds no composer in the view.
    expect(chromeCount()).toBe(0);
    expect(panel()).toBeNull();
  } finally {
    window.clayEditMode = true;
    fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "ready" }]);
    jest.resetModules();
  }
});

test("a live import in view starts nothing, and the commit that enters edit builds the composer", async () => {
  jest.resetModules();
  window.clayEditMode = false;
  fakeWire.helpers.mockClear();

  try {
    const { aiEditParticipant: participant } = await import("../../src/plugins/ai-edit.js");
    await flush();
    await frames();

    // Imported in view: no question to the host, no chrome, and no way in.
    const section = mountPage();
    clickSection(section);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true }));
    await flush();
    expect(fakeWire.helpers).not.toHaveBeenCalled();
    expect(chromeCount()).toBe(0);
    expect(panel()).toBeNull();

    // The commit that enters edit is what builds it, once. The facts are the ones this
    // instance reads, so the commit goes through them rather than through the global.
    (await import("../../src/core/is-edit-mode.js")).commitModeFacts({ mode: "edit", isEditMode: true, generation: 1 });
    const lease = participant().prepare({ generation: 1, isCurrent: () => true });
    await lease.ready;
    expect(fakeWire.helpers).toHaveBeenCalledTimes(1);
    expect(panel()).not.toBeNull();

    lease.dispose();
    expect(chromeCount()).toBe(0);
  } finally {
    window.clayEditMode = true;
    fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "ready" }]);
    jest.resetModules();
  }
});
