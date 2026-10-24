import { jest } from "@jest/globals";
import { bindText, spliceMerge, mapCaret } from "../../src/plugins/bind-text.js";

/**
 * `clay.bindText`: an editor textarea outside the saved records, bound to one
 * record's text element. The textarea lives in a `clay="freeze"` region, so its
 * own value never saves and never travels; each keystroke is written into the
 * record at once, and a change the editor did not make (a peer's merge, a JSON
 * API write) is shown with the caret kept. During an IME composition nothing is
 * written or shown, and the two edits apply together when it ends unless they
 * touch the same stretch of text.
 *
 * The merge cases come from the parent's fixture
 * (plans/starter-templates/journal-template/evidence/parent/splice-merge.mjs).
 * The frames are real LiveSync updates, as in
 * journal-template/evidence/astra/canonical-record.test.mjs: a peer running this
 * runtime captured its own page and edited it.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const BASE = "\n\n# Morning\n\nWalk by the river.\n\n# Evening\n\nRead a book.\n\n";

const PAGE =
  '<main sap>' +
  '<section id="entries">' +
  '<article data-id="a"><pre><code class="entry-body"></code></pre></article>' +
  "</section>" +
  '<div id="surface" clay="freeze"></div>' +
  "</main>";

let LiveSync, snapshot, gate, save;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  document.body.innerHTML = PAGE;
  document.querySelector(".entry-body").textContent = BASE;
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
  document.querySelector(".entry-body").textContent = BASE;
  await new Promise((r) => setTimeout(r, 0));
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  delete window.clay;
});

const code = () => document.querySelector(".entry-body");
const textareaIn = () => document.querySelector("#surface textarea");

function makeTextarea() {
  const ta = document.createElement("textarea");
  document.querySelector("#surface").append(ta);
  return ta;
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

function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

function typeInto(ta, value, caret = value.length) {
  ta.value = value;
  ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

function openBinding(ta, overrides = {}) {
  const binding = bindText(ta, overrides);
  binding.open(code(), { key: "a", resolve: () => code() });
  return binding;
}

describe("spliceMerge", () => {
  const fixtureBase = "# Day\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
  const cases = [
    ["local before remote", fixtureBase.replace("First", "日本 First"), fixtureBase.replace("Third", "Third, edited"), "# Day\n\n日本 First paragraph.\n\nSecond paragraph.\n\nThird, edited paragraph."],
    ["local after remote", fixtureBase.replace("Third", "Third 日本"), fixtureBase.replace("First", "Edited first"), "# Day\n\nEdited first paragraph.\n\nSecond paragraph.\n\nThird 日本 paragraph."],
    ["same words", fixtureBase.replace("Second", "Zweite"), fixtureBase.replace("Second", "Segundo"), null],
    ["insert at the same point", fixtureBase + " A", fixtureBase + " B", fixtureBase + " A B"],
    ["remote in two places around the composition", fixtureBase.replace("Second", "Second 日本"), fixtureBase.replace("First", "1st").replace("Third", "3rd"), null],
    ["remote deleted a paragraph after", fixtureBase.replace("First", "First 日本"), fixtureBase.replace("\n\nThird paragraph.", ""), "# Day\n\nFirst 日本 paragraph.\n\nSecond paragraph."],
    ["local only", fixtureBase + "!", fixtureBase, fixtureBase + "!"],
    ["remote only", fixtureBase, fixtureBase + "?", fixtureBase + "?"],
  ];

  for (const [name, local, remote, want] of cases) {
    test(name, () => {
      expect(spliceMerge(fixtureBase, local, remote)).toBe(want);
    });
  }
});

describe("mapCaret", () => {
  const fixtureBase = "# Day\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.";

  test("after a composition stays after it", () => {
    const typed = fixtureBase.replace("Third", "Third 日本");
    const merged = spliceMerge(fixtureBase, typed, fixtureBase.replace("First", "Edited first"));
    const caret = typed.indexOf("日本") + 2;
    const mapped = mapCaret(typed, merged, caret);
    expect(merged.slice(mapped - 2, mapped)).toBe("日本");
  });

  test("before both edits does not move", () => {
    const typed = BASE;
    const merged = BASE.replace("Walk by the river.", "Walk by the quiet river.");
    expect(mapCaret(typed, merged, 3)).toBe(3);
  });
});

test("a peer frame changing another paragraph keeps both edits, the textarea and the caret", async () => {
  const sync = await cleanTab();
  const ta = makeTextarea();
  const binding = openBinding(ta);
  ta.focus();

  const local = BASE.replace("Walk by the river.", "Walk by the quiet river.");
  const caret = local.indexOf("quiet river") + "quiet river".length;
  typeInto(ta, local, caret);
  await flush();
  expect(code().textContent).toBe(local);
  expect(gate.pageMaybeDirty()).toBe(true);

  const frame = peerFrame((doc) => {
    doc.querySelector(".entry-body").textContent = BASE.replace("Read a book.", "Read a long book.");
  });
  await sync._doApplyUpdate(frame, 1, null, null);
  await flush();

  const merged = local.replace("Read a book.", "Read a long book.");
  expect(code().textContent).toBe(merged);
  expect(ta.value).toBe(merged);
  expect(ta.selectionStart).toBe(caret);
  expect(document.activeElement).toBe(ta);
  expect(binding.current()).toBe(code());
  sync.stop();
});

test("a frame during a composition waits for compositionend, then both apply", async () => {
  const sync = await cleanTab();
  const ta = makeTextarea();
  const seen = { shows: 0, conflict: null };
  openBinding(ta, { onShow: () => seen.shows++, onConflict: (typed) => (seen.conflict = typed) });
  ta.focus();

  ta.dispatchEvent(new Event("compositionstart"));
  const composed = BASE.replace("Walk by the river.", "Walk by the calm river.");
  typeInto(ta, composed);

  const frame = peerFrame((doc) => {
    doc.querySelector(".entry-body").textContent = BASE.replace("Read a book.", "Read a long book.");
  });
  await sync._doApplyUpdate(frame, 2, null, null);
  await flush();

  expect(code().textContent).toBe(BASE.replace("Read a book.", "Read a long book."));
  expect(ta.value).toBe(composed);
  expect(seen.conflict).toBeNull();

  ta.dispatchEvent(new Event("compositionend"));
  await flush();

  const merged = composed.replace("Read a book.", "Read a long book.");
  expect(code().textContent).toBe(merged);
  expect(ta.value).toBe(merged);
  expect(seen.conflict).toBeNull();
  sync.stop();
});

test("a frame touching the composed words calls onConflict and keeps the peer's text", async () => {
  const sync = await cleanTab();
  const ta = makeTextarea();
  const seen = { conflict: null };
  openBinding(ta, { onConflict: (typed) => (seen.conflict = typed) });
  ta.focus();

  ta.dispatchEvent(new Event("compositionstart"));
  const composed = BASE.replace("Walk by the river.", "Walk by the stream.");
  typeInto(ta, composed);

  const peer = BASE.replace("Walk by the river.", "Walk by the road.");
  const frame = peerFrame((doc) => {
    doc.querySelector(".entry-body").textContent = peer;
  });
  await sync._doApplyUpdate(frame, 3, null, null);
  await flush();

  ta.dispatchEvent(new Event("compositionend"));
  await flush();

  expect(seen.conflict).toBe(composed);
  expect(code().textContent).toBe(peer);
  expect(ta.value).toBe(peer);
  sync.stop();
});

test("a keystroke after a merge replaced the record element lands in the new element", async () => {
  const sync = await cleanTab();
  const ta = makeTextarea();
  const binding = openBinding(ta);
  const old = code();

  const article = document.querySelector('[data-id="a"]');
  article.innerHTML = '<pre><code class="entry-body"></code></pre>';
  article.querySelector(".entry-body").textContent = BASE;
  const fresh = code();
  expect(fresh).not.toBe(old);
  expect(old.isConnected).toBe(false);

  typeInto(ta, BASE + "!");
  expect(fresh.textContent).toBe(BASE + "!");
  expect(binding.current()).toBe(fresh);
  sync.stop();
});

test("resolve() returning null calls onGone and writes nowhere", async () => {
  const sync = await cleanTab();
  const ta = makeTextarea();
  const seen = { gone: null };
  openBinding(ta, { onGone: (typed) => (seen.gone = typed) });

  document.querySelector('[data-id="a"]').remove();
  typeInto(ta, BASE + " gone");
  await flush();

  expect(seen.gone).toBe(BASE + " gone");
  expect(document.querySelector(".entry-body")).toBeNull();
  sync.stop();
});

test("a JSON API write to the record shows in the textarea", async () => {
  const sync = await cleanTab();
  const ta = makeTextarea();
  const seen = { shows: 0 };
  openBinding(ta, { onShow: () => seen.shows++ });
  expect(seen.shows).toBe(1);

  const next = BASE.replace("Read a book.", "Read a whole book.");
  code().textContent = next;
  await flush();

  expect(ta.value).toBe(next);
  expect(seen.shows).toBe(2);
  sync.stop();
});

test("nothing marks the page dirty when the text did not change", async () => {
  const sync = await cleanTab();
  const ta = makeTextarea();
  const seen = { writes: 0 };
  openBinding(ta, { onWrite: () => seen.writes++ });
  await flush();
  expect(gate.pageMaybeDirty()).toBe(false);

  typeInto(ta, BASE);
  await flush();

  expect(seen.writes).toBe(0);
  expect(code().textContent).toBe(BASE);
  expect(gate.pageMaybeDirty()).toBe(false);
  sync.stop();
});

test("a typed change writes into the record and marks the page dirty", async () => {
  const sync = await cleanTab();
  const ta = makeTextarea();
  openBinding(ta);
  await flush();

  typeInto(ta, BASE + " typed");
  await flush();

  expect(code().textContent).toBe(BASE + " typed");
  expect(gate.pageMaybeDirty()).toBe(true);
  sync.stop();
});

test("attach moves the binding to a replacement textarea", async () => {
  const sync = await cleanTab();
  const ta = makeTextarea();
  const binding = openBinding(ta);

  const next = document.createElement("textarea");
  document.querySelector("#surface").append(next);
  binding.attach(next);

  typeInto(next, BASE + " next");
  expect(code().textContent).toBe(BASE + " next");

  typeInto(ta, BASE + " stale");
  expect(code().textContent).toBe(BASE + " next");
  sync.stop();
});

test("opening another key flushes the open record and shows the new one from the start", async () => {
  const sync = await cleanTab();
  document.querySelector("#entries").insertAdjacentHTML(
    "beforeend",
    '<article data-id="b"><pre><code class="entry-body"></code></pre></article>'
  );
  const other = document.querySelector('[data-id="b"] .entry-body');
  other.textContent = "A second entry.";
  const ta = makeTextarea();
  const binding = openBinding(ta);
  expect(ta.value).toBe(BASE);

  binding.open(other, { key: "b", resolve: () => other });

  expect(binding.current()).toBe(other);
  expect(ta.value).toBe("A second entry.");
  expect(ta.selectionStart).toBe(0);
  expect(binding.composing()).toBe(false);
  sync.stop();
});
