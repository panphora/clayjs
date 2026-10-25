/**
 * @jest-environment jsdom
 */

/**
 * The text binding's lifecycle.
 *
 * `clay.bindText` writes every input into the record at once, so the binding is the one
 * place where "the page holds text the record does not" can exist. For a live switch the
 * exit barrier needs an answer it can act on, so:
 *
 *   - `flush()` refuses while a composition is running and leaves that composition exactly
 *     where it is; otherwise it runs the input path and reports whether the record now
 *     holds the text;
 *   - a conflict or a gone record is a refusal, not a success, until the resolution itself
 *     puts the text in the record;
 *   - `open()` and `close()` honor a refusal: the open record, its observer and its text
 *     stay put;
 *   - `dispose()` is idempotent, never flushes, and detaches the textarea's listeners and
 *     the observer only once the barrier has landed;
 *   - new input asks the lifecycle for admission, while a composition the binding already
 *     captured finishes through its own operation even after admission closes.
 *
 * The real module, driven the way an editor bridge drives it.
 */

import { jest } from "@jest/globals";
import { bindText } from "../../src/plugins/bind-text.js";

const PAGE =
  '<main>' +
  '<section id="entries">' +
  '<article data-id="a"><pre><code class="entry-body"></code></pre></article>' +
  "</section>" +
  '<div id="surface" clay="freeze"></div>' +
  "</main>";

const BASE = "\n\n# Morning\n\nWalk by the river.\n\n# Evening\n\nRead a book.\n\n";

const additions = [];
const removals = [];
const realAdd = EventTarget.prototype.addEventListener;
const realRemove = EventTarget.prototype.removeEventListener;

const forTarget = (log, target) => log.filter((entry) => entry.target === target);

let unsaved;

beforeAll(async () => {
  EventTarget.prototype.addEventListener = function (type, handler, options) {
    additions.push({ target: this, type, handler, options });
    return realAdd.call(this, type, handler, options);
  };
  EventTarget.prototype.removeEventListener = function (type, handler, options) {
    removals.push({ target: this, type, handler, options });
    return realRemove.call(this, type, handler, options);
  };
  unsaved = await import("../../src/lib/unsaved-state.js");
});

afterAll(() => {
  EventTarget.prototype.addEventListener = realAdd;
  EventTarget.prototype.removeEventListener = realRemove;
});

beforeEach(() => {
  window.clay = {};
  additions.length = 0;
  removals.length = 0;
  document.body.innerHTML = PAGE;
  document.querySelector(".entry-body").textContent = BASE;
});

afterEach(() => {
  delete window.clay;
});

const code = () => document.querySelector(".entry-body");
const article = () => document.querySelector('[data-id="a"]');
const record = (id) => document.querySelector(`[data-id="${id}"] .entry-body`);

function makeTextarea() {
  const ta = document.createElement("textarea");
  document.querySelector("#surface").append(ta);
  return ta;
}

function openBinding(ta, overrides = {}) {
  const binding = bindText(ta, overrides);
  binding.open(code(), { key: "a", resolve: () => code() });
  return binding;
}

function typeInto(ta, value, caret = value.length) {
  ta.value = value;
  ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

function compose(ta, value) {
  ta.focus();
  ta.dispatchEvent(new Event("compositionstart"));
  typeInto(ta, value);
}

function endComposition(ta) {
  ta.dispatchEvent(new Event("compositionend"));
}

// MutationObserver callbacks are microtasks, so one turn is enough to see a reconcile.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const typedRiver = BASE.replace("Walk by the river.", "Walk by the stream.");

test("flush during a composition refuses without ending it", async () => {
  const ta = makeTextarea();
  const binding = openBinding(ta);
  compose(ta, typedRiver);

  expect(binding.flush()).toEqual({ ok: false, code: "composition" });
  expect(binding.composing()).toBe(true);
  expect(code().textContent).toBe(BASE);

  await settle();
  expect(code().textContent).toBe(BASE);

  endComposition(ta);
  await settle();
  expect(code().textContent).toBe(typedRiver);
  expect(binding.composing()).toBe(false);
  expect(binding.flush()).toEqual({ ok: true });
});

test("flush after a composition runs the input path and reports the record represented", async () => {
  const ta = makeTextarea();
  const writes = [];
  const binding = openBinding(ta, { onWrite: (el) => writes.push(el.textContent) });
  compose(ta, typedRiver);
  endComposition(ta);

  expect(binding.flush()).toEqual({ ok: true });
  expect(code().textContent).toBe(typedRiver);
  expect(writes).toEqual([typedRiver]);
});

test("flush writes typed text that no input event had written yet", () => {
  const ta = makeTextarea();
  const binding = openBinding(ta);

  ta.value = BASE + " kept";
  expect(binding.flush()).toEqual({ ok: true });
  expect(code().textContent).toBe(BASE + " kept");
});

test("flush with nothing typed writes nothing and is ok", () => {
  const ta = makeTextarea();
  const writes = [];
  const binding = openBinding(ta, { onWrite: () => writes.push(1) });

  expect(binding.flush()).toEqual({ ok: true });
  expect(writes).toEqual([]);
  expect(code().textContent).toBe(BASE);
});

test("a conflict is not a successful flush until the resolution proves the text", async () => {
  const ta = makeTextarea();
  const staged = {};
  const binding = openBinding(ta, { onConflict: (typed, context) => Object.assign(staged, { typed, context }) });

  const peer = BASE.replace("Walk by the river.", "Walk by the road.");
  ta.value = typedRiver;
  // The record changes under the textarea, before the observer has had its turn.
  code().textContent = peer;

  expect(binding.flush()).toEqual({ ok: false, code: "conflict" });
  expect(staged.typed).toBe(typedRiver);
  expect(staged.context).toEqual({ key: "a", base: BASE, remote: peer });
  expect(code().textContent).toBe(peer);

  await settle();
  expect(ta.value).toBe(peer);

  // The resolution is the only thing that can make the typed text represented.
  code().textContent = staged.typed;
  await settle();
  expect(binding.flush()).toEqual({ ok: true });
  expect(ta.value).toBe(typedRiver);
  expect(code().textContent).toBe(typedRiver);
});

test("flush reports a gone record as a refusal and writes nowhere", () => {
  const ta = makeTextarea();
  const gone = {};
  const binding = openBinding(ta, { onGone: (typed, context) => Object.assign(gone, { typed, context }) });
  article().remove();
  ta.value = BASE + " gone";

  expect(binding.flush()).toEqual({ ok: false, code: "gone" });
  expect(gone.typed).toBe(BASE + " gone");
  expect(gone.context).toEqual({ key: "a", base: BASE });
  expect(document.querySelector(".entry-body")).toBeNull();
  // The record was released with the text, so a switch after it is not refused forever.
  expect(binding.current()).toBeNull();
  expect(binding.flush()).toEqual({ ok: true });
});

test("close during a composition refuses and keeps the record and its observers", async () => {
  const ta = makeTextarea();
  const binding = openBinding(ta);
  compose(ta, typedRiver);

  expect(binding.close()).toEqual({ ok: false, code: "composition" });
  expect(binding.current()).toBe(code());
  expect(ta.value).toBe(typedRiver);

  endComposition(ta);
  await settle();
  expect(code().textContent).toBe(typedRiver);

  expect(binding.close()).toEqual({ ok: true });
  expect(binding.current()).toBeNull();
});

test("opening another record during a composition refuses and keeps the open one", async () => {
  const ta = makeTextarea();
  const binding = openBinding(ta);
  document.querySelector("#entries").insertAdjacentHTML(
    "beforeend",
    '<article data-id="b"><pre><code class="entry-body"></code></pre></article>'
  );
  record("b").textContent = "A second entry.";
  compose(ta, typedRiver);

  expect(binding.open(record("b"), { key: "b", resolve: () => record("b") })).toEqual({
    ok: false,
    code: "composition",
  });
  expect(binding.current()).toBe(code());
  expect(ta.value).toBe(typedRiver);
  expect(record("b").textContent).toBe("A second entry.");

  endComposition(ta);
  await settle();
  expect(code().textContent).toBe(typedRiver);

  expect(binding.open(record("b"), { key: "b", resolve: () => record("b") })).toEqual({ ok: true });
  expect(binding.current()).toBe(record("b"));
  expect(ta.value).toBe("A second entry.");
});

test("a composition survives a peer replacing the record element and writes into the new one", async () => {
  const ta = makeTextarea();
  const binding = openBinding(ta);
  compose(ta, typedRiver);

  article().innerHTML = '<pre><code class="entry-body"></code></pre>';
  const fresh = code();
  fresh.textContent = BASE.replace("Read a book.", "Read a long book.");
  article().append(fresh);
  const replacement = fresh;
  expect(replacement).not.toBe(binding.current());
  expect(binding.current().isConnected).toBe(false);

  endComposition(ta);
  await settle();

  expect(binding.current()).toBe(replacement);
  expect(replacement.textContent).toBe(typedRiver.replace("Read a book.", "Read a long book."));
  expect(binding.flush()).toEqual({ ok: true });
});

test("new input asks the lifecycle for admission and the captured composition still finishes", async () => {
  const lifecycle = { canWrite: () => false };
  window.clay = { modeLifecycle: lifecycle };
  const ta = makeTextarea();
  const binding = openBinding(ta);

  typeInto(ta, BASE + " refused");
  expect(code().textContent).toBe(BASE);
  expect(binding.flush()).toEqual({ ok: false, code: "busy" });

  compose(ta, typedRiver);
  endComposition(ta);
  await settle();
  expect(code().textContent).toBe(typedRiver);

  lifecycle.canWrite = () => true;
  typeInto(ta, typedRiver + " resumed");
  expect(code().textContent).toBe(typedRiver + " resumed");
  expect(binding.flush()).toEqual({ ok: true });
});

test("an unmanaged page admits input without a lifecycle", () => {
  const ta = makeTextarea();
  openBinding(ta);

  typeInto(ta, BASE + " standalone");
  expect(code().textContent).toBe(BASE + " standalone");
});

test("the exit barrier sees a refused flush as pending work", async () => {
  const ta = makeTextarea();
  const binding = openBinding(ta);
  const handle = unsaved.registerUnsavedState({
    id: "journal:bind-text",
    isPending: () => binding.composing(),
    flush: () => binding.flush(),
  });

  compose(ta, typedRiver);
  await expect(unsaved.flushUnsaved()).resolves.toEqual({ ok: false, pending: ["journal:bind-text"] });
  expect(code().textContent).toBe(BASE);

  endComposition(ta);
  await settle();
  await expect(unsaved.flushUnsaved()).resolves.toEqual({ ok: true, pending: [] });
  expect(code().textContent).toBe(typedRiver);

  handle.dispose();
});

test("dispose never flushes and waits for the barrier before detaching", async () => {
  const ta = makeTextarea();
  const binding = openBinding(ta);
  compose(ta, typedRiver);

  expect(binding.dispose()).toEqual({ ok: false, code: "composition" });
  expect(code().textContent).toBe(BASE);
  expect(forTarget(removals, ta)).toHaveLength(0);

  endComposition(ta);
  await settle();
  expect(code().textContent).toBe(typedRiver);
  expect(binding.flush()).toEqual({ ok: true });

  const added = forTarget(additions, ta);
  expect(binding.dispose()).toEqual({ ok: true });
  const removed = forTarget(removals, ta);
  expect(removed.map((entry) => [entry.type, entry.handler])).toEqual(
    added.map((entry) => [entry.type, entry.handler])
  );

  expect(binding.dispose()).toEqual({ ok: true });
  expect(forTarget(removals, ta)).toHaveLength(removed.length);
});

test("dispose refuses while the record has not taken the text", () => {
  const ta = makeTextarea();
  const binding = openBinding(ta);
  ta.value = BASE + " kept";

  expect(binding.dispose()).toEqual({ ok: false, code: "pending-input" });
  // Nothing was flushed and nothing was detached: the barrier can still land this text.
  expect(code().textContent).toBe(BASE);
  expect(forTarget(removals, ta)).toHaveLength(0);

  expect(binding.flush()).toEqual({ ok: true });
  expect(code().textContent).toBe(BASE + " kept");
  expect(binding.dispose()).toEqual({ ok: true });
});

test("after dispose the binding writes nothing more and opens nothing", async () => {
  const ta = makeTextarea();
  const shows = [];
  const binding = openBinding(ta, { onShow: () => shows.push(1) });
  const shown = shows.length;
  expect(binding.dispose()).toEqual({ ok: true });

  const fresh = document.createElement("textarea");
  document.querySelector("#surface").append(fresh);
  binding.attach(fresh);
  expect(binding.open(code(), { key: "a", resolve: () => code() })).toEqual({
    ok: false,
    code: "disposed",
  });

  typeInto(ta, BASE + " after");
  typeInto(fresh, BASE + " after");
  code().textContent = BASE + " peer";
  await settle();

  expect(code().textContent).toBe(BASE + " peer");
  expect(shows).toHaveLength(shown);
  expect(binding.current()).toBeNull();
});
