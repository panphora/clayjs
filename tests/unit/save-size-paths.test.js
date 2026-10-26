/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/journal.html"}
 */
import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";
import { IDBFactory } from "fake-indexeddb";

/**
 * Every save lane, measured once, and refused before the backend when the host said
 * a limit and the bytes are over it.
 *
 * The measurement is not a second capture and not a guess: it is the exact string
 * 05b's capture produced, UTF-8 encoded, checked against `document.maxBytes` as
 * discovery last answered. A known oversize save returns an ordinary error result and
 * changes nothing about the page: no request, no accepted listener, no baseline, no
 * ETag, no acknowledgement of a recovery copy. An unknown limit refuses nothing, and
 * a host's own 413 is normalized to the same code without inventing a limit from it.
 */

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

const ENTRIES = `<div id="entries">
  <article class="entry" data-id="e1"><div class="entry-body">A</div></article>
</div>`;

const readSaved = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return new Map([...doc.querySelectorAll("#entries > article.entry")].map((el) => [el.dataset.id, el.textContent]));
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let hosted;
const calls = { meta: [], save: [] };

function response({ body = {}, status = 200, headers = null } = {}) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: (name) => headers?.[name] ?? null },
    text: async () => text,
    json: async () => body
  };
}

const META = (document = {}) => ({ spec: 1, extensions: [], document: { etag: "meta-1", ...document } });

// One host, answering metadata and saves from whatever the test has staged.
function installRouter({ meta = META(), save = () => ({ body: { msg: "Saved" } }) } = {}) {
  hosted = { meta, save };
  calls.meta.length = 0;
  calls.save.length = 0;
  const mock = jest.fn(async (url) => {
    const target = String(url);
    if (target.includes("/_/save")) {
      calls.save.push({ url: target });
      return response(await hosted.save(calls.save.length));
    }
    calls.meta.push(target);
    return response({ body: hosted.meta });
  });
  global.fetch = mock;
  window.fetch = mock;
}

let saveMod, coreMod, sizeMod, etagMod, snapshotMod, createRecovery;
let sizes = [];
let snapshots = [];

const overLimit = () => META({ maxBytes: 10 });
const underLimit = () => META({ maxBytes: 1000000 });

// A host that knows its ceiling: ask again so this attempt is judged against it.
async function hostSays(meta) {
  installRouter({ meta });
  await sizeMod.saveLimit({ fresh: true });
  installRouter({ meta });
}

function edit(text = "an edit") {
  document.getElementById("c").textContent = text;
}

async function settleBaseline() {
  if (saveMod.baselineSettled()) return;
  await new Promise((resolve) => document.addEventListener("clay:baseline-settled", resolve, { once: true }));
}

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="c">start</div>';
  installRouter();
  saveMod = await import("../../src/core/save.js");
  coreMod = await import("../../src/core/save-core.js");
  sizeMod = await import("../../src/core/save-size.js");
  etagMod = await import("../../src/core/etag.js");
  snapshotMod = await import("../../src/core/snapshot.js");
  ({ createRecovery } = await import("../../src/core/recovery.js"));
  document.addEventListener("clay:save-size", (event) => sizes.push(event.detail));
  snapshotMod.onSnapshot(() => snapshots.push(1));
});

beforeEach(async () => {
  document.body.innerHTML = '<div id="c">start</div>';
  installRouter();
  // This page's bytes become saved bytes, so an edit after this is a real change.
  await saveMod.savePage();
  await tick();
  await settleBaseline();
  installRouter();
  sizes = [];
  snapshots = [];
});

describe("a known oversize body is refused before the backend", () => {
  test("the normal lane sends nothing and measures once", async () => {
    await hostSays(overLimit());
    edit();

    const result = await saveMod.savePage();

    expect(result).toMatchObject({ ok: false, msgType: "error", code: "save-too-large", sent: false });
    expect(result.size).toEqual({ bytes: expect.any(Number), maxBytes: 10, state: "over" });
    expect(calls.save).toHaveLength(0);
    expect(sizes).toEqual([result.size]);
  });

  test("the force lane refuses it too", async () => {
    await hostSays(overLimit());
    edit();

    const result = await saveMod.savePageForce();

    expect(result).toMatchObject({ ok: false, code: "save-too-large", sent: false });
    expect(calls.save).toHaveLength(0);
    expect(sizes).toHaveLength(1);
  });

  test("a raw save of oversize bytes is refused without a request", async () => {
    await hostSays(overLimit());

    const result = await coreMod.saveHtml(`<html><body>${"x".repeat(64)}</body></html>`);

    expect(result).toMatchObject({ ok: false, code: "save-too-large", sent: false });
    expect(result.size.bytes).toBeGreaterThan(10);
    expect(calls.save).toHaveLength(0);
    expect(sizes).toHaveLength(1);
  });

  test("flush reports the refusal as a failed flush and writes nothing", async () => {
    await hostSays(overLimit());
    edit();

    await expect(saveMod.flushSave()).rejects.toMatchObject({ state: "failed" });

    expect(calls.save).toHaveLength(0);
    expect(sizes).toHaveLength(1);
  });

  test("the retry lane is never entered for an oversize body", async () => {
    // Whatever the host would have answered, the guard answers first: one measurement
    // and no request, so there is no refusal for a retry to ride on.
    installRouter({
      save: () => ({ status: 503, headers: { "Retry-After": "0" }, body: { msg: "Converting", code: "page-converting" } })
    });
    await sizeMod.saveLimit({ fresh: true });
    installRouter({
      save: () => ({ status: 503, headers: { "Retry-After": "0" }, body: { msg: "Converting", code: "page-converting" } })
    });
    await hostSays(overLimit());
    edit();

    const result = await saveMod.savePage();

    expect(result.code).toBe("save-too-large");
    expect(calls.save).toHaveLength(0);
    expect(sizes).toHaveLength(1);
  });
});

describe("a body within a known limit still sends, on every lane", () => {
  test("the normal lane sends and is accepted", async () => {
    await hostSays(underLimit());
    edit();

    const result = await saveMod.savePage();

    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(1);
    expect(sizes).toHaveLength(1);
    expect(sizes[0]).toMatchObject({ maxBytes: 1000000, state: "ok" });
  });

  test("the force lane sends and is accepted", async () => {
    await hostSays(underLimit());
    edit();

    const result = await saveMod.savePageForce();

    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(1);
  });

  test("a raw save under the limit sends and is accepted", async () => {
    await hostSays(underLimit());

    const result = await coreMod.saveHtml("<html><body>small</body></html>");

    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(1);
    expect(sizes).toHaveLength(1);
  });

  test("flush sends and answers with the host's stamp", async () => {
    await hostSays(underLimit());
    installRouter({ meta: underLimit(), save: () => ({ body: { msg: "Saved", etag: "stored-1" } }) });
    edit();

    await expect(saveMod.flushSave()).resolves.toEqual({ state: "saved", etag: "stored-1" });

    expect(calls.save).toHaveLength(1);
  });

  test("the page-converting retry sends the same bytes again and is measured once", async () => {
    await hostSays(underLimit());
    installRouter({
      meta: underLimit(),
      save: (n) => (n < 3
        ? { status: 503, headers: { "Retry-After": "0" }, body: { msg: "Converting", code: "page-converting" } }
        : { body: { msg: "Saved" } })
    });
    edit();

    const result = await saveMod.savePage();

    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(3);
    expect(sizes).toHaveLength(1);
    expect(sizes[0].state).toBe("ok");
  });
});

describe("an unknown limit never blocks a save", () => {
  test("a host that advertises no ceiling takes the bytes and stays the authority", async () => {
    await hostSays(META());
    edit("a body far past any limit this test would have guessed");

    const result = await saveMod.savePage();

    expect(result.ok).toBe(true);
    expect(calls.save).toHaveLength(1);
    expect(sizes).toEqual([{ bytes: expect.any(Number), maxBytes: null, state: "unknown" }]);
  });

  test("a host's own 413 is normalized without inventing a limit", async () => {
    // Discovery's answer is stale: it still advertises a ceiling these bytes fit
    // under, and the host refuses them anyway. The refusal is the answer that counts.
    await hostSays(META({ maxBytes: 10000000 }));
    installRouter({
      meta: META({ maxBytes: 10000000 }),
      save: () => ({ status: 413, body: {} })
    });
    edit();

    const result = await saveMod.savePage();

    expect(result).toMatchObject({ ok: false, msgType: "error", code: "save-too-large", status: 413 });
    expect(result.size).toMatchObject({ maxBytes: 10000000, state: "ok" });
    expect(calls.save).toHaveLength(1);
    expect(sizes).toHaveLength(1);
  });
});

test("an over-limit refusal leaves accepted source, ETag, dirty state and recovery untouched", async () => {
  const recovery = createRecovery({ indexedDB: new IDBFactory(), mode: "edit", writerId: "writer-size-1" });
  const entries = recovery.register({ channel: "journal.entries", version: 1, readSaved });
  try {
    const accepted = saveMod.getLastSavedContents();
    document.getElementById("c").innerHTML = ENTRIES;
    await saveMod.savePageForce();
    await tick();

    const acceptedBytes = saveMod.getLastSavedContents();
    expect(acceptedBytes).not.toBe(accepted);
    const etag = etagMod.lastSeenEtag();
    const dirty = saveMod.getLastSavedDirty();

    // A recovery copy of writing this page has not saved yet.
    await entries.stage({ key: "e1", payload: { id: "e1", body: "A" } });
    expect((await entries.flush()).ok).toBe(true);
    const before = await entries.list();
    expect(before.records).toHaveLength(1);

    await hostSays(overLimit());
    document.querySelector('article[data-id="e1"] .entry-body').textContent = "typed until it could not save";
    // Counted from here: the save that established these bytes measured as well.
    sizes = [];
    const parsesBefore = snapshots.length;

    const result = await saveMod.savePage();

    expect(result).toMatchObject({ ok: false, code: "save-too-large", sent: false });
    expect(calls.save).toHaveLength(0);
    // The accepted source and the stamp the host last gave are exactly where they were.
    expect(saveMod.getLastSavedContents()).toBe(acceptedBytes);
    expect(saveMod.getLastSavedDirty()).toBe(dirty);
    expect(etagMod.lastSeenEtag()).toBe(etag);
    // The writing is still unsaved, so the close warning and the next save both see it.
    expect(saveMod.getUnsavedChanges()).toBe(true);
    expect(saveMod.getLastSavedContents()).not.toContain("typed until it could not save");
    // Nothing acknowledged the recovery copy: it is still the only copy of that writing.
    const after = await entries.list();
    expect(after.records).toHaveLength(1);
    expect(after.records[0].payload).toEqual(before.records[0].payload);
    // One byte count and no extra snapshot for the attempt.
    expect(sizes).toHaveLength(1);
    expect(snapshots.length - parsesBefore).toBe(1);
  } finally {
    await entries.dispose();
  }
});

test("draft mode asks the host nothing, and the public surface knows no limit there", async () => {
  // A real draft boot: the mode is decided once, at evaluation, and this page's
  // edit-mode modules already made their decision. The public surface is what a
  // template calls, so it is what this asks.
  jest.resetModules();
  delete window.clayEditMode;
  document.documentElement.setAttribute("visitor-drafts", "size-draft");
  document.head.insertAdjacentHTML(
    "beforeend",
    '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>'
  );
  document.body.innerHTML = '<div id="c">start</div>';
  const mock = jest.fn(async () => response({ status: 404, body: {} }));
  global.fetch = mock;
  window.fetch = mock;
  window.clay = {};
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams("plugins=visitor-drafts&exclude=richclay"), resolve));

  const clay = window.clay;
  expect(clay.isDraftMode).toBe(true);
  expect(typeof clay.save.limits).toBe("function");
  expect(typeof clay.save.inspect).toBe("function");

  const before = sizes.length;
  await expect(clay.save.limits()).resolves.toEqual({ maxBytes: null });
  await expect(clay.save.limits({ fresh: false })).resolves.toEqual({ maxBytes: null });
  const candidate = "<html><body>candidate</body></html>";
  await expect(clay.save.inspect(candidate)).resolves.toEqual({
    bytes: new TextEncoder().encode(candidate).byteLength,
    maxBytes: null,
    state: "unknown"
  });
  // An inspection says nothing to the page: no warning changes for candidate bytes.
  expect(sizes).toHaveLength(before);
  expect(mock.mock.calls.filter(([url]) => String(url).includes("/_/meta"))).toHaveLength(0);
});
