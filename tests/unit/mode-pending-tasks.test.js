/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * The work an edit session does not own: unsent drafts and uploads.
 *
 * Both outlive the mode that started them, and neither may be acknowledged by a teardown:
 *
 *   - a draft is one control's revision (its base and its text, per record and name), kept
 *     in this tab and restored into whatever control the view paints later, so quiesce and
 *     dispose leave it pending rather than calling the page clean;
 *   - an upload keeps the file the person selected and the result the host returned, so a
 *     session that ends does not cancel the request or forget a URL nobody inserted yet;
 *   - only an upload still on the wire is pending work, and the barrier's flush waits for
 *     it, because until the host answers its fate is unknown;
 *   - the session admits new attempts while it holds admission: a quiesced or disposed
 *     session sends nothing, and does not spend a failed attempt's retry on a refusal.
 *
 * The real modules, driven the way a boot and a switch drive them.
 */

const PAGE =
  '<article data-id="c1">' +
  '<h3>Card one</h3>' +
  '<div class="detail" clay="editor-ui"><input class="comment" unsent="comment"></div>' +
  "</article>" +
  '<article data-id="c2">' +
  '<h3>Card two</h3>' +
  '<div class="detail" clay="editor-ui"><textarea class="comment" unsent="comment"></textarea></div>' +
  "</article>";

const OK_BODY = {
  msg: "Uploaded",
  uploads: [{ name: "photo-1.png", url: "assets-x/photo-1.png", bytes: 3, access: "document" }]
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const file = (name = "photo.png") => new File([new Uint8Array(3)], name, { type: "image/png" });

const controlOf = (id) => document.querySelector(`[data-id="${id}"] [unsent]`);

function type(el, value) {
  el.dispatchEvent(new Event("beforeinput", { bubbles: true }));
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// A scriptable XMLHttpRequest: it records what was sent and lets a case choose the answer
// and the moment, so "still on the wire" is a state a test can sit in.
function installXhr() {
  const sent = [];
  class FakeXhr {
    constructor() {
      this.upload = { addEventListener: (name, fn) => { this._progress = fn; } };
      this._handlers = {};
      this.status = 200;
      this.responseText = JSON.stringify(OK_BODY);
      this.aborted = false;
    }
    addEventListener(name, fn) { this._handlers[name] = fn; }
    open() {}
    setRequestHeader() {}
    abort() { this.aborted = true; this._handlers.abort?.(); }
    send(body) { this.body = body; sent.push(this); }
  }
  global.XMLHttpRequest = FakeXhr;
  return sent;
}

function respond(req, { status = 200, body = OK_BODY } = {}) {
  req.status = status;
  req.responseText = JSON.stringify(body);
  req._handlers.load();
}

async function untilRequest(sent, index = 0) {
  for (let i = 0; i < 50 && sent.length <= index; i++) await Promise.resolve();
  if (sent.length <= index) throw new Error("no request was sent");
  return sent[index];
}

const additions = [];
const removals = [];
const realAdd = EventTarget.prototype.addEventListener;
const realRemove = EventTarget.prototype.removeEventListener;

let unsent;
let upload;
let uploadPlan;
let unsaved;
let storage;
// The plugin installs its listeners once, at import, and keeps them for the page's life:
// a second import would install a second set, so the modules are loaded once here and
// every case drives them the way a boot and a switch drive the same page.
let installedInputs = 0;

// The listeners the module installs once, for the page rather than for a session.
const addedToDocument = (upTo) =>
  additions.slice(0, upTo).filter((entry) => entry.target === document && entry.options === true);

const enterUnsent = () => {
  const lease = unsent.unsentParticipant().prepare();
  lease.enable();
  return lease;
};

const enterUpload = () => {
  const lease = upload.uploadParticipant().prepare();
  lease.enable();
  return lease;
};

beforeAll(async () => {
  EventTarget.prototype.addEventListener = function (type, handler, options) {
    additions.push({ target: this, type, handler, options });
    return realAdd.call(this, type, handler, options);
  };
  EventTarget.prototype.removeEventListener = function (type, handler, options) {
    removals.push({ target: this, type, handler, options });
    return realRemove.call(this, type, handler, options);
  };
  document.body.innerHTML = PAGE;
  unsaved = await import("../../src/lib/unsaved-state.js");
  unsent = await import("../../src/plugins/unsent.js");
  upload = await import("../../src/plugins/upload-task.js");
  uploadPlan = await import("../../src/plugins/upload.js");
  storage = (await import("../../src/lib/doc-storage.js")).storage;
  installedInputs = additions.filter((entry) => entry.target === document && entry.type === "input" && entry.options === true).length;
});

afterAll(() => {
  EventTarget.prototype.addEventListener = realAdd;
  EventTarget.prototype.removeEventListener = realRemove;
});

beforeEach(() => {
  additions.length = 0;
  removals.length = 0;
  // Every case begins on a page with no drafts in it.
  unsent.unsent.drop("c1", "comment");
  unsent.unsent.drop("c2", "comment");
  document.documentElement.removeAttribute("savetoken");
  document.body.innerHTML = PAGE;
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ spec: 1, extensions: ["upload"], document: { upload: { allowed: true, access: "document" } } })
  }));
});

test("a draft on one control stays pending through quiesce and teardown", async () => {
  const control = controlOf("c1");
  control.focus();
  const lease = enterUnsent();

  type(control, "half-written");
  expect(unsent.unsent.list()).toEqual([{ record: "c1", name: "comment", base: "", text: "half-written" }]);

  const changes = [];
  control.addEventListener("change", () => changes.push("change"));
  lease.quiesce();
  lease.dispose();

  // The revision, its storage copy and the pending check are all still there: an exit that
  // could acknowledge them would report a view over text the file does not hold.
  expect(unsent.unsent.list()).toEqual([{ record: "c1", name: "comment", base: "", text: "half-written" }]);
  expect(storage.session.get("unsent")).toEqual({ "c1|comment": { base: "", text: "half-written" } });
  expect(unsaved.pendingIds()).toEqual(["unsent"]);
  expect(control.value).toBe("half-written");
  // Quiesce is not a blur and not a submit.
  expect(document.activeElement).toBe(control);
  expect(changes).toEqual([]);
});

test("each control keeps its own revision, and a later keystroke revises one of them", async () => {
  const lease = enterUnsent();
  const first = controlOf("c1");
  const second = controlOf("c2");

  type(first, "one");
  type(second, "two");
  type(first, "one more");
  lease.quiesce();
  lease.dispose();

  expect(unsent.unsent.list()).toEqual([
    { record: "c1", name: "comment", base: "", text: "one more" },
    { record: "c2", name: "comment", base: "", text: "two" }
  ]);
  expect(storage.session.get("unsent")).toEqual({
    "c1|comment": { base: "", text: "one more" },
    "c2|comment": { base: "", text: "two" }
  });
});

test("two entries record one keystroke once, and the restore outlives the session", async () => {
  // One capturing input listener for the page, installed at import and never removed.
  expect(installedInputs).toBe(1);

  const first = enterUnsent();
  type(controlOf("c1"), "half-written");
  first.dispose();

  const second = enterUnsent();
  type(controlOf("c1"), "half-written and longer");
  second.dispose();

  const documentInputs = additions.filter((entry) => entry.target === document && entry.type === "input" && entry.options === true);
  expect(documentInputs).toHaveLength(0);
  expect(removals.filter((entry) => entry.target === document && entry.type === "input")).toEqual([]);
  expect(unsent.unsent.list()).toEqual([{ record: "c1", name: "comment", base: "", text: "half-written and longer" }]);

  // A reader repaint paints a fresh control with the saved value; the draft comes back
  // through the observer, which the teardown left where it was.
  const detail = document.querySelector('[data-id="c1"] .detail');
  detail.innerHTML = '<input class="comment" unsent="comment">';
  const painted = detail.querySelector("[unsent]");
  await settle();
  expect(painted.value).toBe("half-written and longer");
});

test("an upload still on the wire is pending, and the flush waits for the host", async () => {
  const sent = installXhr();
  enterUpload();

  const task = upload.start(file("photo.png"));
  const req = await untilRequest(sent);

  expect(task.state).toBe("uploading");
  expect(unsaved.pendingIds()).toEqual(["upload"]);

  const draining = unsaved.flushUnsaved();
  respond(req);

  expect(await draining).toEqual({ ok: true, pending: [] });
  expect(task.state).toBe("succeeded");
  expect(task.file.name).toBe("photo.png");
  expect(req.aborted).toBe(false);
});

test("teardown keeps a stored result nobody has inserted", async () => {
  const sent = installXhr();
  const lease = enterUpload();

  const task = upload.start(file("photo.png"));
  respond(await untilRequest(sent));
  const stored = await task.result;
  expect(stored.ok).toBe(true);

  lease.quiesce();
  lease.dispose();

  expect(sent[0].aborted).toBe(false);
  expect(task.file.name).toBe("photo.png");
  expect(task.state).toBe("succeeded");
  expect((await task.result).uploads[0].url).toBe("assets-x/photo-1.png");
  // A result the host accepted is not unknown work: inserting it is the caller's move.
  expect(unsaved.pendingIds()).not.toContain("upload");
});

test("a failed attempt keeps its file and its retry until a session admits one", async () => {
  const sent = installXhr();
  const lease = enterUpload();

  const task = upload.start(file("photo.png"));
  const req = await untilRequest(sent);
  req._handlers.error();
  await task.result;
  expect(task.state).toBe("failed");

  lease.quiesce();
  task.retry();
  expect(sent).toHaveLength(1);
  expect(task.state).toBe("failed");
  expect(task.file.name).toBe("photo.png");

  lease.dispose();
  const again = enterUpload();
  const retried = task.retry();
  respond(await untilRequest(sent, 1));
  expect(await retried).toMatchObject({ ok: true });
  expect(task.attempt).toBe(2);
  expect(sent).toHaveLength(2);
  again.dispose();
});

test("a quiesced session sends nothing new and leaves the request already on the wire alone", async () => {
  const sent = installXhr();
  const lease = enterUpload();

  const running = upload.start(file("first.png"));
  const wire = await untilRequest(sent);

  lease.quiesce();
  const refused = upload.start(file("second.png"));
  expect(await refused.result).toMatchObject({ ok: false, code: "aborted" });
  expect(refused.file.name).toBe("second.png");
  expect(sent).toHaveLength(1);

  // The upload the session already admitted keeps its ending.
  respond(wire);
  expect(await running.result).toMatchObject({ ok: true });

  lease.resume();
  const admitted = upload.start(file("third.png"));
  respond(await untilRequest(sent, 1));
  expect(await admitted.result).toMatchObject({ ok: true });
  expect(sent).toHaveLength(2);

  lease.dispose();
  const after = upload.start(file("fourth.png"));
  expect(await after.result).toMatchObject({ ok: false, code: "aborted" });
  expect(sent).toHaveLength(2);
});

test("unsent's adoption starts nothing: no restore, no listener, and every draft stays", async () => {
  // The import road: this tab booted in edit with one draft already kept in this tab, and
  // the module installed the page's one listener set and restored it.
  const control = controlOf("c1");
  storage.session.set("unsent", { "c1|comment": { base: "", text: "kept from earlier" } });

  jest.resetModules();
  window.clayEditMode = true;
  let booted;
  let adopted;
  let lease;
  try {
    booted = await import("../../src/plugins/unsent.js");
    const installed = additions.length;
    expect(addedToDocument(installed).map((entry) => entry.type)).toEqual(["beforeinput", "input"]);
    expect(control.value).toBe("kept from earlier");

    // What the person has since typed away is theirs: an adoption restores nothing, because
    // it adopts no session at all.
    control.value = "";

    adopted = booted.modeParticipant().prepare({ generation: 1, isCurrent: () => true, initial: true });
    adopted.enable();
    expect(control.value).toBe("");
    expect(additions).toHaveLength(installed);
    expect(removals).toEqual([]);
    expect(booted.unsent.list()).toEqual([{ record: "c1", name: "comment", base: "", text: "kept from earlier" }]);

    adopted.dispose();
    expect(control.value).toBe("");
    expect(removals).toEqual([]);
    expect(booted.unsent.list()).toEqual([{ record: "c1", name: "comment", base: "", text: "kept from earlier" }]);

    // A live entry reuses that one installation, restores the draft a repaint took away, and
    // its own dispose leaves the draft pending.
    const detail = document.querySelector('[data-id="c1"] .detail');
    detail.innerHTML = '<input class="comment" unsent="comment">';
    const painted = detail.querySelector("[unsent]");
    await settle();
    expect(painted.value).toBe("kept from earlier");

    lease = booted.unsentParticipant().prepare({ generation: 2, isCurrent: () => true });
    lease.enable();
    expect(additions).toHaveLength(installed);

    lease.dispose();
    expect(booted.unsent.list()).toEqual([{ record: "c1", name: "comment", base: "", text: "kept from earlier" }]);
  } finally {
    lease?.dispose();
    adopted?.dispose();
    delete window.clayEditMode;
    jest.resetModules();
  }
});

test("upload's managed preparation admits nothing until the commit, and adoption takes the open session", async () => {
  const sent = installXhr();

  // The plan path re-exports the factory the transport holds.
  expect(uploadPlan.modeParticipant).toBe(upload.uploadParticipant);

  const managed = upload.uploadParticipant().prepare({ generation: 1, isCurrent: () => true });
  const held = upload.start(file("before-commit.png"));
  expect(await held.result).toMatchObject({ ok: false, code: "aborted" });
  expect(sent).toHaveLength(0);
  expect(held.file.name).toBe("before-commit.png");

  managed.enable();
  const admitted = upload.start(file("after-commit.png"));
  respond(await untilRequest(sent));
  expect(await admitted.result).toMatchObject({ ok: true });
  expect(sent).toHaveLength(1);
  managed.dispose();

  // An explicit edit boot admits uploads from its first keystroke, so adoption is a lease
  // over a session that is already open.
  const adopted = uploadPlan.modeParticipant().prepare({ generation: 2, isCurrent: () => true, initial: true });
  const running = upload.start(file("booted.png"));
  respond(await untilRequest(sent, 1));
  expect(await running.result).toMatchObject({ ok: true });
  expect(sent).toHaveLength(2);

  adopted.dispose();
  const after = upload.start(file("after-exit.png"));
  expect(await after.result).toMatchObject({ ok: false, code: "aborted" });
  expect(sent).toHaveLength(2);
});

test("the two leases are separate participants, and a clean cycle leaves no pending work", () => {
  const drafts = unsent.unsentParticipant();
  const uploads = upload.uploadParticipant();

  expect([drafts.id, drafts.order]).toEqual(["clay:unsent", 320]);
  expect([uploads.id, uploads.order]).toEqual(["clay:upload", 340]);
  // The drafts restore before the uploads settle and the history takes its snapshot, so
  // each lease is prepared in its own place in the order rather than sharing one.
  expect(drafts.order).toBeLessThan(uploads.order);

  const draftLease = drafts.prepare();
  const uploadLease = uploads.prepare();
  for (const lease of [draftLease, uploadLease]) {
    for (const method of ["enable", "quiesce", "resume", "dispose"]) {
      expect(typeof lease[method]).toBe("function");
    }
  }

  expect(unsaved.pendingIds()).toEqual([]);
  draftLease.enable();
  uploadLease.enable();
  expect(unsaved.pendingIds()).toEqual([]);
  uploadLease.quiesce();
  draftLease.quiesce();
  uploadLease.dispose();
  draftLease.dispose();
  expect(unsaved.pendingIds()).toEqual([]);
});
