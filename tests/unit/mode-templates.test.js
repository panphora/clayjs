/**
 * @jest-environment jsdom
 */

import { readFileSync } from "node:fs";
import { jest } from "@jest/globals";
import { seedPageFromArticle } from "../../src/page/ybind/migrate.js";
import { bootFixture, TEMPLATES } from "./helpers/mode-harness.js";

// A Document boot parses a 300 KB page and mounts its reader: the jsdom default of 5 s is
// a boot's own time, not a transition's.
jest.setTimeout(120000);

/**
 * Step 17b-8: the three starter templates, as their real load fixtures, switch live.
 *
 * A view boot of the Document, the Kanban and the Journal enters edit and leaves it
 * without a reload, repeatedly: a clean cycle writes nothing, a real edit is written
 * once, the resources a session holds are the same in the third cycle as in the second,
 * a repeat entry fetches nothing, and the reader is never doubled. The fixtures are the
 * only host; the loader, the controller, the plan importer and the plugins are real.
 *
 * These tests compare a session against the session before it, never against the cold
 * boot: Sortable's vendor installs its document listeners once, at the first session, and
 * save.js's page-lifetime installs do the same, so a view after an exit holds more
 * listeners than a view that never entered (17b-4c landing note).
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => {
  for (let i = 0; i < 20; i++) await sleep(0);
};
const until = async (predicate, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await sleep(5);
  return predicate();
};

// The reload the guarded road takes: every transition here is asserted not to reach it.
// jsdom's `Location.reload` is an own, non-writable property of the location object, and
// modules read `location` at the moment they reload, so the fake stands in for the whole
// object and hands every other read and write to the real one.
function withFakeLocation(run) {
  const real = window.location;
  const reload = jest.fn();
  const fake = {
    reload,
    assign: (url) => real.assign(url),
    replace: (url) => real.replace(url),
    toString: () => real.toString(),
  };
  for (const key of ["href", "origin", "protocol", "host", "hostname", "port", "pathname", "search", "hash"]) {
    Object.defineProperty(fake, key, {
      get: () => real[key],
      set: key === "href" ? (value) => { real.href = value; } : undefined,
      configurable: true,
    });
  }
  delete window.location;
  window.location = fake;
  return Promise.resolve()
    .then(() => run({ reload }))
    .finally(() => {
      delete window.location;
      window.location = real;
    });
}

// A participant that keeps the file each entry says it was built from, and otherwise
// does nothing: it holds no listener, starts no timer and writes nothing.
function probe(seen) {
  return {
    id: "template:probe",
    order: 900,
    prepare(context) {
      seen.push(context.represented);
      return { enable() {}, quiesce() {}, resume() {}, dispose() {} };
    },
  };
}

// The fixture's own loader params with the quickcrop plugin named, a plugin with no
// support row: naming it keeps the guarded reload.
const withQuickcrop = (search) => {
  const params = new URLSearchParams(search);
  params.set("plugins", `${params.get("plugins")},quickcrop`);
  return params.toString();
};

// The query string the fixture's own loader tag carries: the plan it boots is the
// template's plan, and a case that names one more plugin starts from it.
const fixtureParams = (name) => {
  const html = readFileSync(new URL(`../fixtures/load/${name}`, import.meta.url), "utf8");
  const src = html.match(/<script[^>]+src="([^"]*clay\.js[^"]*)"/)[1];
  return new URL(src, "https://clayjs.com/").search.replace(/^\?/, "");
};

// The host's answer about what it can do. The boot asks before any entry runs and
// memoizes the answer, so the route is installed right after boot and the memo is
// dropped; every other request still goes to the harness's own host.
const PAGE_HOST = { spec: 1, extensions: ["page", "live-data", "sync", "upload"], document: {} };

const routeHost = async () => {
  const inner = globalThis.fetch;
  globalThis.fetch = window.fetch = async (url, options = {}) => {
    if (new URL(String(url), window.location.origin).pathname.startsWith("/_/meta")) {
      const body = JSON.stringify(PAGE_HOST);
      return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, json: async () => PAGE_HOST, text: async () => body };
    }
    return inner(url, options);
  };
  const hostMeta = await import("../../src/core/host-meta.js");
  hostMeta.resetHostMeta();
};

// One file from the host, on the stream the reader has open now. Both readers take one
// frame shape, `{html, etag, seq}`, and apply it to the article in front of them.
const sendFrame = async (boot, bytes, seq = 1) => {
  // A reader that just started wires its sink a turn later; a frame sent before that is
  // a frame nobody reads.
  await flush();
  const source = [...boot.eventSources().all].reverse().find((stream) => stream.readyState !== 2);
  expect(source).toBeTruthy();
  source.onmessage({ data: JSON.stringify({ html: bytes, seq, etag: `E${seq}` }) });
  return bytes;
};

// The host's first saved file: the page as it was served.
const serveFirstFile = (boot) => sendFrame(boot, `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, 1);

// What the reader this boot runs now represents: a Document's view boot follows its saved
// stream through page-view, and the other two through generic sync's saved lane. An
// initial edit boot never loaded page-view, so the reader its exit starts is that lane too.
const readerFile = async (name) => {
  if (name === "document.html") {
    const pageView = await import("../../src/plugins/page-view.js");
    if (pageView.ready) {
      const held = await pageView.acquired;
      // A reader started from a receipt settles `acquired` on that receipt; one started on
      // a stream settles it on the reader, whose `represented` is the receipt.
      return held?.represented ?? held ?? null;
    }
  }
  const { liveSync } = await import("../../src/sync/live-sync.js");
  return liveSync._represented ?? null;
};

// The reader a view boot started needs a file before an entry has anything to build
// from, exactly as a real page waits for its host's first frame.
const openReader = async (boot, name) => {
  const bytes = await serveFirstFile(boot);
  const deadline = Date.now() + 8000;
  let held = await readerFile(name);
  while ((!held || held.bytes !== bytes) && Date.now() < deadline) {
    await sleep(5);
    held = await readerFile(name);
  }
  expect(held?.bytes).toBe(bytes);
  return held;
};

// What a session holds, read the way the harness reads it, except for the stream count:
// the harness counts EventSource instances ever opened, and a session legitimately takes
// its own lane in each direction, so what has to hold still is the number standing open
// (checked below, and across every cycle as a peak).
const resources = (boot) => ({ ...boot.counters(), eventSources: boot.eventSources().open });

// The module thunks an entry called that the entry before it did not: a repeat entry finds
// every path in the handle, so this is empty.
const addedCalls = (before, after) =>
  Object.fromEntries(Object.entries(after).filter(([path, count]) => count > (before[path] ?? 0)));

// The writes that wrote the file itself. A Document also writes its page data to the live
// room, which is a second POST but not a second save.
const fileSaves = (boot) => boot.sent().filter((url) => /\/_\/save$/.test(url)).length;

const enter = async (clay) => {
  const result = await clay.setMode("edit");
  expect(result).toEqual({ ok: true, mode: "edit", changed: true });
  expect(clay.mode).toBe("edit");
  expect(clay.modeLifecycle.canWrite()).toBe(true);
  return result;
};

const leave = async (clay) => {
  const result = await clay.setMode("view");
  expect(result).toEqual({ ok: true, mode: "view", changed: true });
  expect(clay.mode).toBe("view");
  expect(clay.modeLifecycle.canWrite()).toBe(false);
  return result;
};

// A person's edit: an attribute on the body survives every projection, and one explicit
// save is one POST.
const typeSomething = (word) => {
  document.body.setAttribute("data-typed", word);
};

for (const name of TEMPLATES) {
  test(`${name}: three clean cycles enter and leave edit without a reload and without a write`, async () => {
    const boot = await bootFixture(name, { mode: "view", declare: true });
    try {
      const clay = boot.clay;
      expect(clay.mode).toBe("view");
      await routeHost();
      await openReader(boot, name);

      await withFakeLocation(async (fake) => {
        for (let cycle = 0; cycle < 3; cycle += 1) {
          await enter(clay);
          expect({ cycle, open: boot.eventSources().open }).toEqual({ cycle, open: 1 });
          await leave(clay);
          expect({ cycle, open: boot.eventSources().open }).toEqual({ cycle, open: 1 });
        }
        expect(fake.reload).not.toHaveBeenCalled();
      });

      // A clean cycle is never a write.
      expect(boot.counters().posts).toBe(0);
      // ...and the counter that says so sees a real write: one edit, one POST.
      await enter(clay);
      const before = fileSaves(boot);
      typeSomething("first");
      await flush();
      await clay.save();
      await flush();
      expect(await until(() => fileSaves(boot) > before)).toBe(true);
      expect({ saves: fileSaves(boot) - before }).toEqual({ saves: 1 });
      await leave(clay);

      // One reader, never a second one beside it.
      expect(boot.eventSources().peak).toBeLessThanOrEqual(1);
    } finally {
      boot.stop();
    }
  });

  test(`${name}: the third cycle holds the resources the second one held`, async () => {
    const boot = await bootFixture(name, { mode: "view", declare: true });
    try {
      const clay = boot.clay;
      await routeHost();
      await openReader(boot, name);
      const views = [];
      const edits = [];
      const calls = [];

      for (let cycle = 0; cycle < 3; cycle += 1) {
        await enter(clay);
        edits.push(resources(boot));
        calls.push(boot.counters().moduleCalls);
        await leave(clay);
        views.push(resources(boot));
      }

      // A session against the session before it, and a view after an exit against the
      // view after the first exit.
      expect({ cycle: 3, edit: edits[2] }).toEqual({ cycle: 3, edit: edits[1] });
      // A repeat entry imports nothing: every path it needs is one the handle holds.
      expect({ cycle: 2, fetched: addedCalls(calls[0], calls[1]) }).toEqual({ cycle: 2, fetched: {} });
      expect({ cycle: 3, fetched: addedCalls(calls[1], calls[2]) }).toEqual({ cycle: 3, fetched: {} });
      expect({ cycle: 3, view: views[2] }).toEqual({ cycle: 3, view: views[0] });
      expect({ cycle: 2, view: views[1] }).toEqual({ cycle: 2, view: views[0] });
      expect(boot.eventSources().peak).toBeLessThanOrEqual(1);
    } finally {
      boot.stop();
    }
  });

  test(`${name}: an edit made in the second session is written once, and the next entry is built from it`, async () => {
    const boot = await bootFixture(name, { mode: "view", declare: true });
    try {
      const clay = boot.clay;
      await routeHost();
      await openReader(boot, name);
      const seen = [];
      clay.modeLifecycle.register(probe(seen));

      await enter(clay);
      await leave(clay);
      await enter(clay);
      const before = fileSaves(boot);
      typeSomething("second session");
      await flush();
      await clay.save();
      await flush();
      expect(await until(() => fileSaves(boot) > before)).toBe(true);
      expect({ saves: fileSaves(boot) - before }).toEqual({ saves: 1 });

      // The session's last accepted save is the receipt an exit hands the reader.
      const save = await import("../../src/core/save.js");
      const accepted = save.acceptedReceipt();
      expect(typeof accepted?.bytes).toBe("string");
      expect(accepted.bytes).toContain("second session");

      // A committed exit after the save writes nothing more...
      const written = fileSaves(boot);
      await leave(clay);
      await flush();
      expect({ saves: fileSaves(boot) - written }).toEqual({ saves: 0 });

      // ...and the entry after it is built from the file that save wrote.
      await enter(clay);
      expect(seen).toHaveLength(3);
      expect(seen[2]).toMatchObject({ bytes: accepted.bytes, etag: accepted.etag });
      await leave(clay);
    } finally {
      boot.stop();
    }
  });

  if (name === "document.html") {
    // Another tab's file: the same page, with the paragraph this tab never saw and without
    // the page tag, so the article in it is what the seed is rebuilt from.
    const otherTabFile = (bytes) => {
      const file = new DOMParser().parseFromString(bytes, "text/html");
      for (const tag of file.querySelectorAll('script[merge="page"]')) tag.remove();
      const paragraph = file.querySelector('article[data-page] [data-id="p1"]');
      if (paragraph) paragraph.textContent = "from another tab";
      return `<!DOCTYPE html>\n${file.documentElement.outerHTML}`;
    };

    // A session that wrote once owns a page room, so the store it staged outlives the
    // session unless the session closes it: the entry after it has to stage a store from
    // the file the reader represents now, not go on with the one it left open.
    test(`${name}: an entry stages the page store from the file the reader represents`, async () => {
      const boot = await bootFixture(name, { mode: "view", declare: true });
      try {
        const clay = boot.clay;
        await routeHost();
        await openReader(boot, name);
        const { storeOf } = await import("../../src/plugins/live.js");

        await enter(clay);
        const first = storeOf("page");
        typeSomething("first session");
        await flush();
        await clay.save();
        await flush();
        const save = await import("../../src/core/save.js");
        expect(await until(() => typeof save.acceptedReceipt()?.bytes === "string")).toBe(true);
        await leave(clay);

        // Another tab saves the page: the file the reader holds changes under this one.
        const bytes = otherTabFile(save.acceptedReceipt().bytes);
        await sendFrame(boot, bytes, 2);
        const paragraph = () => document.querySelector('article[data-page] [data-id="p1"]');
        expect(await until(() => paragraph()?.textContent === "from another tab")).toBe(true);

        await enter(clay);
        const second = storeOf("page");
        expect(second).toBeTruthy();
        expect(second).not.toBe(first);
        const represented = new DOMParser().parseFromString(bytes, "text/html");
        const article = represented.querySelector("article[data-page]");
        expect(second.value).toEqual(seedPageFromArticle(article.cloneNode(true)));
        await leave(clay);
      } finally {
        boot.stop();
      }
    });
  }

  test(`${name}: an initial edit boot leaves live and re-enters live`, async () => {
    const boot = await bootFixture(name, { mode: "edit", declare: true });
    try {
      const clay = boot.clay;
      expect(clay.mode).toBe("edit");
      await routeHost();
      const before = boot.counters().posts;
      const savesBefore = fileSaves(boot);

      await withFakeLocation(async (fake) => {
        // The session this import started is adopted, not started again.
        await leave(clay);
        expect(fake.reload).not.toHaveBeenCalled();
        // The reader an exit starts has no file until the host sends one.
        await openReader(boot, name);
        await enter(clay);
        expect(fake.reload).not.toHaveBeenCalled();
      });

      expect({ posts: boot.counters().posts - before }).toEqual({ posts: 0 });
      expect({ saves: fileSaves(boot) - savesBefore }).toEqual({ saves: 0 });
      expect(boot.eventSources().peak).toBeLessThanOrEqual(1);
    } finally {
      boot.stop();
    }
  });

  test(`${name}: a plugin with no support row keeps the guarded reload`, async () => {
    const search = fixtureParams(name);
    const boot = await bootFixture(name, { mode: "view", declare: true, params: withQuickcrop(search) });
    try {
      const clay = boot.clay;
      await withFakeLocation(async (fake) => {
        const result = await clay.setMode("edit");
        expect(result).toMatchObject({ ok: true, reloading: true });
        expect(fake.reload).toHaveBeenCalledTimes(1);
      });
      expect(clay.mode).toBe("view");
    } finally {
      boot.stop();
    }
  });
}
