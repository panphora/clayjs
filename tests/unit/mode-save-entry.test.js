/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * Step 17b-3a: save and autosave become mode participants, measured from a view boot.
 *
 * A live entry imports every plan module while the tab is still in view, so `save.js`'s
 * `init` and its baseline capture, `autosave.js`'s `install` and the dirty gate are all
 * inert at evaluation. The probe that found this recorded the failures: the baseline was
 * never settled, a clean page reported unsaved bytes, an edit after the commit sent no
 * POST, and leaving said `ok` with the edit unsaved.
 *
 * Here the participants are called the way the controller will call them — imported in
 * view, prepared, adopted from the represented file, the mode committed, then enabled —
 * and every one of those failures is asserted as a pass.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flush = async () => {
  for (let i = 0; i < 5; i++) await sleep(0);
};

const until = async (predicate, tries = 400) => {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return true;
    await sleep(10);
  }
  return false;
};

let mode, save, autosave, warning, gate, snapshot;
let posts = [];
let openLeases = [];
let generation = 0;

// Every listener the call adds to the document, so a second entry can be proved to add
// none and the shortcut can be told from the gesture listeners beside it.
function countAdds(fn) {
  const added = [];
  const original = document.addEventListener;
  document.addEventListener = function (type, handler, options) {
    added.push({ type, handler, options });
    return original.call(this, type, handler, options);
  };
  try {
    fn();
  } finally {
    document.addEventListener = original;
  }
  return added;
}

const keydowns = (added) => added.filter((entry) => entry.type === "keydown");
// The save shortcut is the one keydown listener without capture: the gesture listeners
// install theirs with `true`.
const shortcutAdds = (added) => keydowns(added).filter((entry) => entry.options !== true);

beforeAll(async () => {
  // A view boot of an autosaving owner document: no mode, no save token, no `clayEditMode`.
  document.documentElement.setAttribute("autosave", "");
  document.body.innerHTML = '<div id="content">start</div>';
  globalThis.fetch = window.fetch = jest.fn(async (url, options = {}) => {
    if (options.method !== "POST") {
      return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "", json: async () => ({}) };
    }
    posts.push(String(options.body ?? ""));
    return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => JSON.stringify({ msg: "Saved", etag: `etag-${posts.length}` }) };
  });

  mode = await import("../../src/core/is-edit-mode.js");
  snapshot = await import("../../src/core/snapshot.js");
  save = await import("../../src/core/save.js");
  autosave = await import("../../src/core/autosave.js");
  warning = await import("../../src/core/unsaved-warning.js");
  gate = await import("../../src/lib/dirty-gate.js");
  window.clay = window.clay || {};
  window.clay.hasUnsavedChanges = warning.hasUnsavedChanges;
}, 20000);

// A session outlives one test on purpose: the entry, its edit, its quiesce and its exit
// are one lifetime, and the tests walk that lifetime in order. Disposing twice is
// harmless, so the cleanup covers whatever a refusal left open.
afterAll(() => {
  for (const lease of openLeases) {
    try {
      lease.autosaveLease.dispose();
      lease.saveLease.dispose();
    } catch {}
  }
});

// One entry, in the controller's order: prepare ascending, adopt the represented file,
// commit the mode facts, then enable ascending.
async function enter({ etag = null } = {}) {
  const represented = { etag, bytes: null };
  const context = {
    generation: ++generation,
    destination: "host",
    signal: new AbortController().signal,
    isCurrent: () => true,
    represented,
    reader: null,
    initial: false,
  };
  const saveLease = await save.modeParticipant().prepare(context);
  const autosaveLease = await autosave.modeParticipant().prepare(context);
  const adoption = save.adoptEntryBaseline({ represented });
  mode.commitModeFacts({ mode: "edit", isEditMode: true, phase: "idle" });
  const adds = countAdds(() => {
    saveLease.enable();
    autosaveLease.enable();
  });
  const lease = { saveLease, autosaveLease, adoption, adds, represented };
  openLeases.push(lease);
  return lease;
}

// The exit the controller runs: quiesce and dispose descending, then view facts.
function exit(lease) {
  mode.commitModeFacts({ phase: "leaving" });
  lease.autosaveLease.quiesce();
  lease.saveLease.quiesce();
  lease.autosaveLease.dispose();
  lease.saveLease.dispose();
  mode.commitModeFacts({ mode: "view", isEditMode: false, phase: "idle" });
}

test("a live entry from a view boot settles the baseline and leaves a clean page clean", async () => {
  // What the probe measured before the entry: no baseline, and a clean page reading dirty.
  expect(save.baselineSettled()).toBe(false);

  const lease = await enter({ etag: "etag-entry" });

  expect(lease.adoption).toEqual({ ok: true });
  expect(save.baselineSettled()).toBe(true);
  expect(save.getLastSavedDirty()).toBe(snapshot.captureForDirtyCheck());
  expect(warning.hasUnsavedChanges()).toBe(false);
  expect(warning.bytesUnsaved()).toBe(false);

  // The installs happened once, on the way in: the dirty gate answers and the save
  // shortcut is attached exactly once.
  expect(gate.pageMaybeDirty()).toBe(false);
  expect(shortcutAdds(lease.adds)).toHaveLength(1);

  // A clean page writes nothing, whether the automatic lane is asked or left to run.
  expect(await save.savePageThrottled()).toMatchObject({ msgType: "skipped" });
  const postsBefore = posts.length;
  await sleep(1600);
  expect(posts.length).toBe(postsBefore);
  expect(warning.hasUnsavedChanges()).toBe(false);
}, 20000);

test("one real edit gives exactly one POST, and the accepted receipt carries it", async () => {
  // Looks up the session opened by the first test.
  const lease = openLeases[0];
  expect(lease).toBeTruthy();
  const postsBefore = posts.length;

  document.getElementById("content").textContent = "one edit";
  await flush();

  expect(await until(() => posts.length === postsBefore + 1)).toBe(true);
  expect(posts[posts.length - 1]).toContain("one edit");
  await sleep(2000);
  expect(posts.length).toBe(postsBefore + 1);
  expect(warning.hasUnsavedChanges()).toBe(false);

  const receipt = save.acceptedReceipt();
  expect(receipt.etag).toBe(`etag-${postsBefore + 1}`);
  expect(receipt.bytes).toContain("one edit");
  expect(save.getLastSavedBytes()).toBe(receipt.bytes);
}, 20000);

test("an edit while quiesced parks, and resume sends it", async () => {
  const lease = openLeases[0];
  const postsBefore = posts.length;

  // The person types, and the exit begins before the scheduler's quiet period is over.
  document.getElementById("content").textContent = "typed before the refusal";
  await flush();
  lease.autosaveLease.quiesce();
  lease.saveLease.quiesce();
  expect(save.savesAdmitted()).toBe(false);

  // The attempt the activity earned still happens; it is parked, not dropped.
  expect(await until(() => save.sessionParked(), 300)).toBe(true);
  expect(posts.length).toBe(postsBefore);
  expect(warning.hasUnsavedChanges()).toBe(true);

  lease.saveLease.resume();
  expect(save.savesAdmitted()).toBe(true);
  expect(await until(() => posts.length === postsBefore + 1 && !save.sessionParked())).toBe(true);
  expect(posts[posts.length - 1]).toContain("typed before the refusal");
  expect(save.sessionParked()).toBe(false);
  expect(warning.hasUnsavedChanges()).toBe(false);
}, 20000);

test("a second entry installs no second listener and saves its own edit", async () => {
  const first = openLeases[0];
  const accepted = save.acceptedReceipt();
  exit(first);
  expect(save.savesAdmitted()).toBe(true);

  const second = await enter({ etag: accepted.etag });
  expect(second.adoption).toEqual({ ok: true });
  expect(second.adds).toEqual([]);
  expect(save.baselineSettled()).toBe(true);
  expect(warning.hasUnsavedChanges()).toBe(false);

  const postsBefore = posts.length;
  document.getElementById("content").textContent = "second entry edit";
  await flush();
  expect(await until(() => posts.length === postsBefore + 1)).toBe(true);
  await sleep(2000);
  expect(posts.length).toBe(postsBefore + 1);
  expect(posts[posts.length - 1]).toContain("second entry edit");
}, 20000);

test("a re-entry at the same version takes the page a view script moved", async () => {
  const second = openLeases[openLeases.length - 1];
  const accepted = save.acceptedReceipt();
  exit(second);

  // The change a view-time script makes between sessions: a clock, a counter, a reader's
  // own repaint. The DOM moves, the file does not, and this tab holds no work of its own.
  document.getElementById("content").textContent = "written by a view script";
  await flush();

  const adopted = await enter({ etag: accepted.etag });
  expect(adopted.adoption).toEqual({ ok: true });
  // The page as it now stands is the baseline, so the page's own write is not work the
  // person has to resolve.
  expect(save.getLastSavedContents()).toBe(snapshot.captureForComparison());
  expect(warning.hasUnsavedChanges()).toBe(false);
}, 20000);

test("a re-entry at the same version refuses work its session never saved", async () => {
  const third = openLeases[openLeases.length - 1];
  const accepted = save.acceptedReceipt();
  const keptContents = save.getLastSavedContents();
  const keptDirty = save.getLastSavedDirty();

  // An edit made while admission is closed, and a session that ends without writing it:
  // the bytes are this tab's and the host has never seen them.
  third.autosaveLease.quiesce();
  third.saveLease.quiesce();
  document.getElementById("content").textContent = "edited and never saved";
  await flush();
  exit(third);

  const refused = await enter({ etag: accepted.etag });
  expect(refused.adoption).toEqual({ ok: false, code: "pending-input" });
  expect(save.getLastSavedContents()).toBe(keptContents);
  expect(save.getLastSavedDirty()).toBe(keptDirty);
  // Refused means nothing moved, so the page is still holding work nothing has written.
  expect(warning.bytesUnsaved()).toBe(true);
  exit(refused);

  // A newer version of the file is exactly the case the baseline must follow.
  const adopted = await enter({ etag: "etag-newer" });
  expect(adopted.adoption).toEqual({ ok: true });
  expect(save.getLastSavedContents()).toBe(snapshot.captureForComparison());
  expect(warning.hasUnsavedChanges()).toBe(false);
}, 20000);

test("initial adoption takes a lease over the open session and installs nothing", async () => {
  const before = posts.length;
  const context = {
    generation: ++generation,
    destination: "host",
    signal: new AbortController().signal,
    isCurrent: () => true,
    represented: { etag: "etag-initial", bytes: null },
    reader: null,
    initial: true,
  };
  const saveLease = await save.modeParticipant().prepare(context);
  const autosaveLease = await autosave.modeParticipant().prepare(context);
  const adds = countAdds(() => {
    saveLease.enable();
    autosaveLease.enable();
  });

  expect(adds).toEqual([]);
  expect(save.savesAdmitted()).toBe(true);
  // Nothing starts a writer: the page this tab booted into is adopted, not re-prepared.
  await sleep(1600);
  expect(posts.length).toBe(before);

  saveLease.quiesce();
  expect(save.savesAdmitted()).toBe(false);
  saveLease.resume();
  expect(save.savesAdmitted()).toBe(true);
  saveLease.dispose();
  autosaveLease.dispose();
}, 20000);
