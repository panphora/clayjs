/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";
import * as parse5Vendor from "../../src/vendor/parse5.vendor.js";
import { bootFixture } from "./helpers/mode-harness.js";

/**
 * The source map loads when a save needs it, and at no other time.
 *
 * The plugin used to be a late load that installed at import: a reader's idle tail paid
 * for parse5, the source model and a whole-document pairing before anybody had asked to
 * save anything, and on a Document that is 69 KB of the edit boot's bytes. It is now a
 * thin facade over `source/session.js`, and this file is the tracer that keeps it that
 * way: an edit boot loads the facade and nothing behind it, no idle tail and no later
 * microtask loads the parser, and the first save that actually needs a byte-preserving
 * render does. Everything after that — one preparation shared by two saves, an edit made
 * while the parser loads, a load that finishes after the page left edit — is the same
 * claim from the other side.
 *
 * parse5 is the recorded request: `source/session.js` is the only module that reaches
 * `core/source-map.js`, which is the only module that imports the vendor, so a boot that
 * never requests the parser never evaluated the session either. The last block drives the
 * real save pipeline over the source fixtures and pins the bytes to what they were.
 */

const requests = [];
jest.unstable_mockModule("../../src/vendor/parse5.vendor.js", () => {
  requests.push("parse5");
  return { parse: parse5Vendor.parse, Parser: parse5Vendor.Parser };
});

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const since = (mark) => requests.slice(mark);

function htmlResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    redirected: false,
    type: "basic",
    headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    text: async () => body,
  };
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    redirected: false,
    type: "basic",
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

/**
 * The host: a POST is a save, a GET for this page is the file, and nothing else answers.
 * `hold` keeps the file's answer until the returned function answers it, which is how a
 * test edits the page while the parser is still loading.
 */
function host(served) {
  const calls = { source: [], save: [], live: [], other: [] };
  let release = null;

  global.fetch = window.fetch = jest.fn(async (url, options = {}) => {
    const target = String(url ?? "");
    const method = (options.method || "GET").toUpperCase();
    if (target.includes("/_/live-sync/save")) {
      calls.live.push({ url: target, body: options.body });
      return jsonResponse({ msg: "Saved" });
    }
    if (method === "POST" || target.includes("/_/save")) {
      calls.save.push({ url: target, body: options.body, headers: options.headers || {} });
      return jsonResponse({ msg: "Saved" });
    }
    if (target.includes("/_/meta")) {
      calls.other.push(target);
      return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
    }
    calls.source.push(target);
    if (release) await release.gate;
    return htmlResponse(typeof served === "function" ? served() : served);
  });

  return {
    calls,
    hold() {
      let open;
      const gate = new Promise((resolve) => { open = resolve; });
      release = { gate };
      return () => { release = null; open(); };
    },
    restore() {
      global.fetch = window.fetch = undefined;
    },
  };
}

/** The bytes this page was served as, before anything clay did to it. */
function servedBytes() {
  return "<!DOCTYPE html>" + document.documentElement.outerHTML;
}

// How many captures this page has taken: a snapshot hook is the one thing every capture
// runs on its way past, so counting it is how a test sees one it did not ask for.
let captures = 0;
const capturing = () => captures;

async function boot() {
  const fixture = await bootFixture("document.html", { mode: "edit" });
  const plugin = await import("../../src/plugins/source.js");
  const snapshot = await import("../../src/core/snapshot.js");
  const save = await import("../../src/core/save.js");
  snapshot.onSnapshot(() => { captures++; });
  return { ...fixture, plugin, snapshot, save };
}

test("an edit boot loads the facade and nothing behind it", async () => {
  const mark = requests.length;
  const booted = await boot();
  try {
    // The plugin really is in this boot: the late tail imported it and announced it.
    expect(booted.arrivals).toContain("source");
    expect(booted.counters().moduleCalls["plugins/source.js"]).toBe(1);
    expect(booted.clay.source).toBeDefined();

    // Edit ready, the idle late tail, and one microtask later: no parser, no session.
    expect(since(mark)).toEqual([]);
    await Promise.resolve();
    expect(since(mark)).toEqual([]);
    await tick();
    expect(since(mark)).toEqual([]);

    // And the facade answers what it answered before it knew anything.
    const stats = booted.clay.source.stats();
    expect(stats.installed).toBe(false);
    expect(stats.sourceBytes).toBeNull();
    expect(booted.clay.source.text()).toBeNull();
    expect(booted.clay.source.locate(document.body)).toBeNull();

    // Nothing is on the save path either: the facade's renderer defers to today's bytes.
    expect(booted.plugin.renderSave(document.createElement("div"), "TODAY")).toBe("TODAY");
  } finally {
    booted.stop();
  }
});

test("the first save that needs a byte-preserving render loads it, once", async () => {
  const booted = await boot();
  const served = servedBytes();
  const net = host(served);
  const mark = requests.length;
  try {
    document.body.setAttribute("data-edited", "yes");
    const result = await booted.clay.save();
    expect(result.ok).toBe(true);
    expect(net.calls.save).toHaveLength(1);

    // Loaded, once, and modelling the file this page was served.
    expect(since(mark)).toEqual(["parse5"]);
    expect(booted.clay.source.stats().installed).toBe(true);
    expect(net.calls.save[0].body).toContain('data-edited="yes"');

    // A second save renders from the installed session and imports nothing more.
    document.body.setAttribute("data-edited", "again");
    const second = await booted.clay.save();
    expect(second.ok).toBe(true);
    expect(net.calls.save).toHaveLength(2);
    expect(since(mark)).toEqual(["parse5"]);
    expect(net.calls.save[1].body).toContain('data-edited="again"');
  } finally {
    net.restore();
    booted.stop();
  }
});

test("reading clay.source.ready starts the one load, and two reads share it", async () => {
  const booted = await boot();
  const served = servedBytes();
  const net = host(served);
  const mark = requests.length;
  try {
    const first = booted.clay.source.ready;
    const second = booted.clay.source.ready;
    expect(first).toBe(second);
    await first;
    expect(since(mark)).toEqual(["parse5"]);
    expect(booted.clay.source.stats().installed).toBe(true);
    expect(booted.clay.source.text()).toBe(served);
    expect(net.calls.source).toHaveLength(1);
  } finally {
    net.restore();
    booted.stop();
  }
});

test("two saves that arrive during the preparation share it, one load, newest capture", async () => {
  const booted = await boot();
  const net = host(servedBytes());
  const release = net.hold();
  const mark = requests.length;
  try {
    document.body.setAttribute("data-edited", "one");
    const first = booted.clay.save();
    await tick();
    document.body.setAttribute("data-edited", "two");
    const second = booted.clay.save();
    await tick();

    release();
    expect((await first).ok).toBe(true);
    // The second is deferred by the save already on the wire, which is the rule that
    // exists whether or not a parser was loading.
    expect((await second).msgType).toBe("skipped");

    expect(since(mark)).toEqual(["parse5"]);   // one preparation, not two
    expect(net.calls.source).toHaveLength(1);
    // The capture happens after the preparation, so the bytes that go out carry the
    // newest page rather than the one the first save saw when it asked.
    expect(net.calls.save[0].body).toContain('data-edited="two"');

    // And a later save renders from the installed map with a capture of its own.
    const before = capturing();
    document.body.setAttribute("data-edited", "later");
    const third = await booted.clay.save();
    expect(third.ok).toBe(true);
    expect(capturing()).toBeGreaterThan(before);
    const last = net.calls.save[net.calls.save.length - 1];
    expect(last.body).toContain('data-edited="later"');
  } finally {
    net.restore();
    booted.stop();
  }
});

test("an edit made while the parser loads is in the save that installs it", async () => {
  const booted = await boot();
  const net = host(servedBytes());
  const release = net.hold();
  const mark = requests.length;
  try {
    document.body.setAttribute("data-edited", "during");
    const saving = booted.clay.save();
    await tick();
    expect(since(mark)).toEqual(["parse5"]);   // the load is in flight
    document.body.setAttribute("data-later", "yes");
    release();
    const result = await saving;

    expect(result.ok).toBe(true);
    const sent = net.calls.save[0].body;
    expect(sent).toContain('data-edited="during"');
    expect(sent).toContain('data-later="yes"');
  } finally {
    net.restore();
    booted.stop();
  }
});

test("a load that finishes after the page left edit installs nothing", async () => {
  const booted = await boot();
  const net = host(servedBytes());
  const release = net.hold();
  try {
    const lease = booted.plugin.modeParticipant().prepare({ initial: false });
    lease.enable();
    const loading = booted.clay.source.ready;
    await tick();
    expect(net.calls.source).toHaveLength(1);   // in flight

    lease.dispose();
    release();
    await loading;

    expect(booted.clay.source.stats().installed).toBe(false);
    expect(booted.clay.source.text()).toBeNull();
    expect(booted.clay.source.locate(document.body)).toBeNull();
    expect(booted.plugin.renderSave(document.createElement("div"), "TODAY")).toBe("TODAY");
  } finally {
    net.restore();
    booted.stop();
  }
});

test("a newer accepted receipt supersedes an older one", async () => {
  const booted = await boot();
  const served = servedBytes();
  const net = host(served);
  const mark = requests.length;
  try {
    const older = served.replace("<body", "<body data-save='one'");
    const newer = served.replace("<body", "<body data-save='two'");
    const saveCore = await import("../../src/core/save-core.js");
    await saveCore.saveHtml(older);
    await saveCore.saveHtml(newer);
    expect(booted.clay.source.stats().installed).toBe(false);

    await booted.clay.source.ready;
    // The newest bytes this page knows the file holds are what it models, and asking the
    // host for a copy of a file it just wrote would be a request nobody needs.
    expect(booted.clay.source.text()).toBe(newer);
    expect(net.calls.source).toHaveLength(0);
    expect(since(mark)).toEqual(["parse5"]);
  } finally {
    net.restore();
    booted.stop();
  }
});

test("the install runs no authored handler of its own", async () => {
  const booted = await boot();
  const net = host(servedBytes());
  try {
    let runs = 0;
    window.__authoredRuns = () => { runs++; };
    const probe = document.createElement("div");
    probe.setAttribute("onbeforesave", "window.__authoredRuns()");
    probe.setAttribute("onbeforesnapshot", "window.__authoredRuns()");
    document.body.appendChild(probe);
    const before = runs;

    // The install pairs over an INSPECTION capture: not a save, so it takes neither the
    // page's [onbeforesave] handlers nor its [onbeforesnapshot] ones.
    await booted.clay.source.ready;
    expect(booted.clay.source.stats().installed).toBe(true);
    expect(runs).toBe(before);

    // And the save after it does run them, so the count above is not a dead hook.
    document.body.setAttribute("data-edited", "yes");
    expect((await booted.clay.save()).ok).toBe(true);
    expect(runs).toBeGreaterThan(before);
  } finally {
    delete window.__authoredRuns;
    net.restore();
    booted.stop();
  }
});

test("a clean autosave neither captures nor loads the parser", async () => {
  const booted = await boot();
  const net = host(servedBytes());
  const mark = requests.length;
  try {
    // The boot's own settle is what makes the cheap gate authoritative: waiting for it is
    // waiting for the page to go quiet, which is what an autosave sees.
    await new Promise((resolve) => {
      if (booted.save.baselineSettled()) return resolve();
      document.addEventListener("clay:baseline-settled", resolve, { once: true });
      setTimeout(resolve, 4000);
    });
    await booted.save.styleAdoptionsSettled();

    const before = captures;
    const result = await booted.save.savePageThrottled();

    expect(result.msgType).toBe("skipped");
    expect(result.msg).toBe("No changes to save");
    expect(captures).toBe(before);
    expect(net.calls.save).toHaveLength(0);
    expect(net.calls.source).toHaveLength(0);
    expect(since(mark)).toEqual([]);
    expect(booted.clay.source.stats().installed).toBe(false);
  } finally {
    net.restore();
    booted.stop();
  }
}, 20000);

/**
 * The bytes are today's bytes, on the fixture the source tests already use.
 *
 * The first save of a session is the one that installs the map, so this is the claim the
 * split could get wrong in a way none of the tests above would see: the install must not
 * cost a byte of the file.
 */
describe("the first save sends today's bytes", () => {
  const SRC = [
    "<!DOCTYPE html>",
    "<html>",
    "  <head><title>Notes</title></head>",
    "  <body class='page'>",
    "    <ul id=list>",
    "      <li data-id='a'>alpha</li>",
    "      <li data-id='b'>beta</li>",
    "    </ul>",
    "    <template id=tpl><li data-id='x'>from a template</li></template>",
    "  </body>",
    "</html>",
  ].join("\n");

  let snapshot, save, saveCore, plugin;

  beforeAll(async () => {
    jest.resetModules();
    window.clayEditMode = true;
    window.clay = {};
    const parsed = new DOMParser().parseFromString(SRC, "text/html");
    document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
    snapshot = await import("../../src/core/snapshot.js");
    save = await import("../../src/core/save.js");
    saveCore = await import("../../src/core/save-core.js");
    global.fetch = window.fetch = jest.fn(async (url, options = {}) => {
      const target = String(url ?? "");
      const method = (options.method || "GET").toUpperCase();
      if (method === "POST" || target.includes("/_/save")) return jsonResponse({ msg: "Saved" });
      if (target.includes("/_/meta")) return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
      return htmlResponse(SRC);
    });
    plugin = await import("../../src/plugins/source.js");
    // What the loader's own attach does, and what the save pipeline asks through.
    window.clay.source = plugin.source;
  });

  afterAll(() => {
    snapshot.setSaveRenderer(null);
  });

  test("nothing is installed, and a save would be the full serialization", () => {
    expect(plugin.source.stats().installed).toBe(false);
    expect(plugin.source.text()).toBeNull();
    expect(snapshot.captureForSave({ emitForSync: false })).toBe("<!DOCTYPE html>" + document.documentElement.outerHTML);
  });

  test("the first save installs the map, prints the edit and copies the rest", async () => {
    // `.data`, not `.textContent`: assigning textContent replaces the text node, and the
    // map is keyed by node identity.
    document.querySelector("[data-id='b']").firstChild.data = "BETA";
    const result = await save.savePage();

    expect(result.ok).toBe(true);
    expect(plugin.source.stats().installed).toBe(true);
    const sent = plugin.source.stats();
    expect(sent.reprints).toBe(0);
    expect(plugin.source.text()).toBe(SRC.replace(">beta<", ">BETA<"));
    expect(snapshot.captureForSave({ emitForSync: false })).toBe(SRC.replace(">beta<", ">BETA<"));
  });

  test("a save with nothing left to change sends the file byte for byte", async () => {
    const sent = global.fetch.mock.calls.filter(([url, options]) => String(url).includes("/_/save") && (options?.method || "GET").toUpperCase() === "POST");
    expect(sent.at(-1)[1].body).toBe(plugin.source.text());

    const forced = await save.savePageForce();
    expect(forced.ok).toBe(true);
    const last = global.fetch.mock.calls.filter(([url, options]) => String(url).includes("/_/save") && (options?.method || "GET").toUpperCase() === "POST").at(-1);
    expect(last[1].body).toBe(SRC.replace(">beta<", ">BETA<"));
  });

  test("the fallback is still today's bytes, and still counted when the host takes it", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const before = plugin.source.stats();
    const clone = snapshot.captureSaveClone();
    const today = "<!DOCTYPE html>" + clone.outerHTML;
    const out = plugin.renderSave(clone, today, { corrupt: "drop-first-text" });

    expect(out).toBe(today);
    expect(plugin.source.stats().reprints).toBe(before.reprints);
    await saveCore.saveHtml(out);
    expect(plugin.source.stats().reprints).toBe(before.reprints + 1);
    warn.mockRestore();
  });
});

/**
 * A parser that will not load is a save sent as today's full serialization, and the next
 * save asks again: a chunk that failed to arrive once is a network failure, not a
 * decision about this document.
 *
 * The session is a stub here because that is the only way to fail its import on purpose.
 * Everything the facade does with the answer — clearing what it remembered, asking again,
 * and never rejecting the save — is the real code.
 */
describe("a forced first save sends today's bytes too", () => {
  const SRC = [
    "<!DOCTYPE html>",
    "<html>",
    "  <head><title>Notes</title></head>",
    "  <body class='page'>",
    "    <ul id=list>",
    "      <li data-id='a'>alpha</li>",
    "      <li data-id='b'>beta</li>",
    "    </ul>",
    "    <template id=tpl><li data-id='x'>from a template</li></template>",
    "  </body>",
    "</html>",
  ].join("\n");

  let snapshot, save, saveCore, plugin;

  beforeAll(async () => {
    jest.resetModules();
    window.clayEditMode = true;
    window.clay = {};
    const parsed = new DOMParser().parseFromString(SRC, "text/html");
    document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
    snapshot = await import("../../src/core/snapshot.js");
    save = await import("../../src/core/save.js");
    saveCore = await import("../../src/core/save-core.js");
    global.fetch = window.fetch = jest.fn(async (url, options = {}) => {
      const target = String(url ?? "");
      const method = (options.method || "GET").toUpperCase();
      if (method === "POST" || target.includes("/_/save")) return jsonResponse({ msg: "Saved" });
      if (target.includes("/_/meta")) return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
      return htmlResponse(SRC);
    });
    plugin = await import("../../src/plugins/source.js");
    // What the loader's own attach does, and what the save pipeline asks through.
    window.clay.source = plugin.source;
  });

  afterAll(() => {
    snapshot.setSaveRenderer(null);
  });

  test("a forced save installs the map before its capture", async () => {
    document.querySelector("[data-id='b']").firstChild.data = "BETA";
    const result = await save.savePageForce();

    expect(result.ok).toBe(true);
    expect(plugin.source.stats().installed).toBe(true);
    const last = global.fetch.mock.calls.filter(([url, options]) => String(url).includes("/_/save") && (options?.method || "GET").toUpperCase() === "POST").at(-1);
    expect(last[1].body).toBe(SRC.replace(">beta<", ">BETA<"));
  });
});

test("a failed load keeps the fallback and stays retryable", async () => {
  jest.resetModules();
  let refuse = true;
  const started = [];
  jest.unstable_mockModule("../../src/source/session.js", () => {
    if (refuse) {
      refuse = false;
      throw new Error("chunk failed to arrive");
    }
    return {
      start: (options = {}) => { started.push(options); return Promise.resolve({ installed: true }); },
      installed: () => true,
      stats: () => ({ installed: true }),
      text: () => "the file",
      locateLive: () => null,
      unpaired: () => null,
      release: () => {},
      adoptAccepted: () => {},
      renderSave: (clone, today) => today,
    };
  });

  const info = jest.spyOn(console, "info").mockImplementation(() => {});
  document.documentElement.innerHTML = "<head><title>Notes</title></head><body><p>Hi</p></body>";
  window.clay = {};
  window.clayEditMode = true;

  const plugin = await import("../../src/plugins/source.js");
  try {
    // The first demand fails, and fails quietly: the save it belongs to keeps today's
    // bytes and the page is never told.
    await expect(Promise.resolve(plugin.source.ready)).resolves.toBeNull();
    expect(info).toHaveBeenCalledTimes(1);
    expect(started).toHaveLength(0);
    expect(plugin.source.stats().installed).toBe(false);

    // The second asks again, and this time the session is there.
    await plugin.source.ready;
    expect(started).toHaveLength(1);
    expect(plugin.source.stats().installed).toBe(true);
  } finally {
    info.mockRestore();
  }
});
