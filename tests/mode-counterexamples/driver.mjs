/**
 * @jest-environment jsdom
 */

/**
 * The counterexample driver: a schedule, run against the real view/edit switch.
 *
 * A case boots a fixture's page through the production loader and modules, then applies
 * its steps. Only transport, chunk imports (and, under the corpus command, a lazy import
 * where the module loads) and the clock are the driver's: a hold parks one boundary of the
 * machinery until the case releases it, a settle advances fake time, and the trace records
 * what actually happened, in order, with no wall clock in it.
 *
 * A schedule that cannot mean anything (an unknown op, an unsupported boundary, a release
 * of something never held, a requirement the run never reached) is invalid, never passed.
 */

import { FIXTURES, createHost, bootPage, createLanePair, runtimeImport } from "./fixtures.mjs";

// The clock and the module registry are the host's, not the case's: under Jest the test
// environment lends its own, and the check command lends a deterministic clock of its own
// so a corpus run does not need the test runner.
let harness = null;

export function setHarness(next) {
  harness = next;
}

async function hostHarness() {
  if (harness) return harness;
  const { jest } = await import("@jest/globals");
  harness = {
    resetModules: () => jest.resetModules(),
    startClock: () => jest.useFakeTimers({ doNotFake: ["setImmediate", "queueMicrotask", "nextTick"] }),
    stopClock: () => jest.useRealTimers(),
    advance: (ms) => jest.advanceTimersByTimeAsync(ms),
  };
  return harness;
}

const BOUNDARIES = new Set(["save.capture", "save.request", "save.response", "chunk.import", "lazy.import", "metadata"]);
// save.capture is observed, not held: the snapshot is taken by the code that decides to
// take it, so a case can only see that it happened.
const HOLDABLE = new Set(["save.request", "save.response", "chunk.import", "lazy.import", "metadata"]);

const SAVE_RESULTS = ["accepted", "rejected", "unknown"];
const CHUNK_RESULTS = ["loaded", "failed"];

const CASE_KEYS = new Set(["schema", "id", "fixture", "boot", "steps", "requires", "expect", "control", "knownFailing", "reducedFrom", "page", "host"]);
const BOOT_KEYS = new Set(["mode", "live", "destination"]);
const STEP_KEYS = {
  enter: [],
  leave: ["await"],
  input: ["target", "value"],
  unsent: ["field", "value"],
  compose: ["phase", "target", "value"],
  cycles: ["count"],
  hold: ["boundary"],
  release: ["boundary", "result"],
  settle: ["ms"],
  peer: ["tab", "action"],
  reload: [],
  click: ["target"],
  storage: ["mode"],
  flush: ["timeoutMs"],
};
const PEER_KEYS = new Set(["value"]);

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHUNK_PATH = /^(?:core|lib|attrs|plugins|sync)\/[a-z0-9./-]+\.js$/;
const CHUNK_PREFIX = "chunk.import:";
// A module the save path imports on first use, outside the loader's map: the preparer a
// large page's first sliced save loads, the style stripper, the source map's session. Its
// download is as slow as the network makes it, and only a runner that can park a module
// load (the corpus command) can hold one.
const LAZY_PREFIX = "lazy.import:";
const LAZY_PATH = /^(?:core|lib|source)\/[a-z0-9./-]+\.js$/;
const PEER_SETTLE_MS = 3000;
// The modes a run can end in: view and edit on a host page, draft on a visitor's.
const MODES = new Set(["view", "edit", "draft"]);
// The baseline's quiet window is SETTLE_MS = 500 in src/core/save.js: an exit that waits
// for `clay:baseline-settled` cannot commit until that much of the case's clock passed.
const LEAVE_SETTLE_MS = 600;
// A transition settles on the case's own clock, and nothing else moves it: a step that
// waits for one is spent in slices, up to this budget of case time. A budget that runs out
// is a stalled driver, not a verdict.
const TRANSITION_STEP_MS = 50;
const TRANSITION_BUDGET_MS = 60000;

const baseOf = (boundary) => boundary.slice(0, boundary.indexOf(":") === -1 ? boundary.length : boundary.indexOf(":"));

/**
 * The fixture a case runs, with the case's own overrides applied.
 *
 * A case may replace the page's fields (`page`) or the host's (`host`), and a host asked
 * to serve the page serves the page's own bytes as `text/html`.
 *
 * @param {object} json
 */
export function specOf(json) {
  const base = FIXTURES[json.fixture];
  if (!json.page && !json.host) return base;
  const page = json.page ? { ...base.page, ...json.page } : base.page;
  let host = json.host ? { ...(base.host ?? {}), ...json.host } : base.host;
  if (host && host.served === "page") {
    const doc = `<!DOCTYPE html><html><head>${page.head ?? ""}</head><body>${page.body}</body></html>`;
    host = { ...host, served: { path: page.path, html: doc, etag: "etag-1", contentType: "text/html; charset=utf-8" } };
  }
  return { ...base, page, host };
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Refuse every schedule the driver cannot run as written.
 *
 * @param {object} json
 * @returns {{ok: true}|{ok: false, errors: Array<{code: string, path: string, message: string}>}}
 */
export function validateCase(json) {
  const errors = [];
  const fail = (code, path, message) => errors.push({ code, path, message });

  if (!isObject(json)) {
    fail("bad-case", "", "a case is a JSON object");
    return { ok: false, errors };
  }
  for (const key of Object.keys(json)) {
    if (!CASE_KEYS.has(key)) fail("unknown-key", key, `a case has no "${key}"`);
  }
  if (json.schema !== 1) fail("unsupported-schema", "schema", "schema must be 1");
  if (typeof json.id !== "string" || !SLUG.test(json.id)) {
    fail("bad-id", "id", "an id is a lowercase slug");
  }
  if (typeof json.fixture !== "string" || !Object.hasOwn(FIXTURES, json.fixture)) {
    fail("unknown-fixture", "fixture", `no fixture named "${json.fixture}"`);
  }

  if (!isObject(json.boot)) {
    fail("bad-boot", "boot", "boot must say which mode the page starts in");
  } else {
    for (const key of Object.keys(json.boot)) {
      if (!BOOT_KEYS.has(key)) fail("unknown-key", `boot.${key}`, `boot has no "${key}"`);
    }
    if (json.boot.mode !== "view" && json.boot.mode !== "edit") {
      fail("bad-boot-mode", "boot.mode", "boot.mode is \"view\" or \"edit\"");
    }
    if (json.boot.live !== undefined && typeof json.boot.live !== "boolean") {
      fail("bad-boot-field", "boot.live", "boot.live is a boolean");
    }
    if (json.boot.destination !== undefined && json.boot.destination !== "host") {
      fail("unsupported-destination", "boot.destination", "step 1 boots a host destination only");
    }
  }

  if (!Array.isArray(json.steps)) {
    fail("bad-steps", "steps", "steps is a list");
  } else {
    validateSteps(json, errors, fail);
  }

  if (json.control !== undefined && (typeof json.control !== "string" || !SLUG.test(json.control))) {
    fail("bad-control", "control", "control names the positive-control case by its id");
  }
  if (json.knownFailing !== undefined && (typeof json.knownFailing !== "string" || !json.knownFailing)) {
    fail("bad-known-failing", "knownFailing", "knownFailing is one line saying what fails");
  }
  if (json.reducedFrom !== undefined && (typeof json.reducedFrom !== "string" || !SLUG.test(json.reducedFrom))) {
    fail("bad-reduced-from", "reducedFrom", "reducedFrom names the case a shrink was made from");
  }

  if (json.requires !== undefined) {
    if (!Array.isArray(json.requires) || json.requires.some((entry) => typeof entry !== "string" || !entry)) {
      fail("bad-requires", "requires", "requires is a list of trace events");
    }
  }

  if (json.expect !== undefined) {
    if (!isObject(json.expect)) {
      fail("bad-expect", "expect", "expect is an object");
    } else {
      if (json.expect.mode !== undefined && !MODES.has(json.expect.mode)) {
        fail("bad-expect", "expect.mode", `expect.mode is ${[...MODES].map((mode) => `"${mode}"`).join(", ")}`);
      }
      if (json.expect.writes !== undefined && !Number.isSafeInteger(json.expect.writes)) {
        fail("bad-expect", "expect.writes", "expect.writes counts save requests");
      }
      if (json.expect.canonical !== undefined && typeof json.expect.canonical !== "boolean") {
        fail("bad-expect", "expect.canonical", "expect.canonical asks for the served article back byte for byte");
      }
      if (json.expect.saves !== undefined) {
        if (!Array.isArray(json.expect.saves)) {
          fail("bad-expect", "expect.saves", "expect.saves lists the requests the run must send");
        } else {
          json.expect.saves.forEach((entry, index) => {
            const at = `expect.saves[${index}]`;
            if (!isObject(entry)) {
              fail("bad-expect", at, "an expected request is an object");
              return;
            }
            for (const key of Object.keys(entry)) {
              if (!["path", "contains", "relayOf"].includes(key)) fail("unknown-key", `${at}.${key}`, `an expected request has no "${key}"`);
            }
            if (typeof entry.path !== "string" || !entry.path.startsWith("/")) {
              fail("bad-expect", `${at}.path`, "path is the request path, starting with /");
            }
            if (entry.contains !== undefined && (typeof entry.contains !== "string" || !entry.contains)) {
              fail("bad-expect", `${at}.contains`, "contains is the text the request body carries");
            }
            if (entry.relayOf !== undefined && (!Number.isSafeInteger(entry.relayOf) || entry.relayOf < 0)) {
              fail("bad-expect", `${at}.relayOf`, "relayOf is the index of the save whose bytes and stamp the relay must repeat");
            }
            if (entry.contains === undefined && entry.relayOf === undefined) {
              fail("bad-expect", at, "an expected request says what its body contains or which save it relays");
            }
          });
        }
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

function validateSteps(json, errors, fail) {
  const held = new Set();
  json.steps.forEach((step, index) => {
    const at = `steps[${index}]`;
    if (!isObject(step)) {
      fail("bad-step", at, "a step is an object");
      return;
    }
    const allowed = STEP_KEYS[step.op];
    if (!allowed) {
      fail("unknown-op", `${at}.op`, `unknown op "${step.op}"`);
      return;
    }
    for (const key of Object.keys(step)) {
      if (key !== "op" && !allowed.includes(key)) fail("unknown-key", `${at}.${key}`, `op "${step.op}" has no "${key}"`);
    }

    switch (step.op) {
      case "leave": {
        if (step.await !== undefined && typeof step.await !== "boolean") {
          fail("bad-step-field", `${at}.await`, "await is a boolean");
        }
        if (step.await !== false && held.size) {
          fail("awaited-leave-under-hold", at, "a leave that waits cannot outlive a held boundary");
        }
        break;
      }
      case "input": {
        if (typeof step.target !== "string" || !step.target) fail("bad-step-field", `${at}.target`, "target is an element id");
        if (typeof step.value !== "string") fail("bad-step-field", `${at}.value`, "value is a string");
        break;
      }
      case "unsent": {
        if (typeof step.field !== "string" || !step.field) fail("bad-step-field", `${at}.field`, "field names the unsent field");
        if (typeof step.value !== "string") fail("bad-step-field", `${at}.value`, "value is a string");
        break;
      }
      case "click": {
        if (typeof step.target !== "string" || !step.target) fail("bad-step-field", `${at}.target`, "target is a selector");
        break;
      }
      case "storage": {
        if (!["ok", "full", "off"].includes(step.mode)) fail("bad-step-field", `${at}.mode`, "mode is ok, full or off");
        break;
      }
      case "flush": {
        if (step.timeoutMs !== undefined && (!Number.isSafeInteger(step.timeoutMs) || step.timeoutMs < 0)) {
          fail("bad-step-field", `${at}.timeoutMs`, "timeoutMs is the flush's own deadline in milliseconds");
        }
        break;
      }
      case "cycles": {
        if (!Number.isSafeInteger(step.count) || step.count < 1) {
          fail("bad-step-field", `${at}.count`, "count is how many enter/leave cycles to run");
        }
        break;
      }
      case "compose": {
        if (!["start", "update", "end"].includes(step.phase)) {
          fail("bad-step-field", `${at}.phase`, "phase is start, update or end");
        }
        if (typeof step.target !== "string" || !step.target) fail("bad-step-field", `${at}.target`, "target is an element id");
        if (step.phase !== "start" && typeof step.value !== "string") {
          fail("bad-step-field", `${at}.value`, "value is a string");
        }
        break;
      }
      case "settle": {
        if (step.ms !== undefined && (typeof step.ms !== "number" || !Number.isFinite(step.ms) || step.ms < 0)) {
          fail("bad-step-field", `${at}.ms`, "ms is a number of milliseconds");
        }
        break;
      }
      case "reload": {
        const spec = FIXTURES[json.fixture];
        if (spec?.lanes === true || spec?.peer === true) {
          fail("unsupported-reload", at, "a reload tears the page down, so a fixture with a lane peer cannot survive it");
        }
        break;
      }
      case "peer": {
        if (step.tab !== "B") fail("bad-step-field", `${at}.tab`, "the peer is tab \"B\"");
        if (json.fixture !== "lane-peer" && FIXTURES[json.fixture]?.peer !== true) {
          fail("unknown-tab", `${at}.tab`, "this fixture has no second tab");
        }
        if (!isObject(step.action)) {
          fail("bad-step-field", `${at}.action`, "action is an edit");
        } else {
          for (const key of Object.keys(step.action)) {
            if (!PEER_KEYS.has(key)) fail("unknown-key", `${at}.action.${key}`, `action has no "${key}"`);
          }
          if (typeof step.action.value !== "string") fail("bad-step-field", `${at}.action.value`, "action.value is a string");
        }
        break;
      }
      case "hold": {
        const boundary = boundaryOf(step, at, fail);
        if (boundary === null) break;
        if (!HOLDABLE.has(baseOf(boundary))) {
          fail("boundary-not-holdable", `${at}.boundary`, `"${baseOf(boundary)}" is observed, not held`);
          break;
        }
        if (held.has(boundary)) fail("boundary-already-held", `${at}.boundary`, `"${boundary}" is already held`);
        held.add(boundary);
        break;
      }
      case "release": {
        const boundary = boundaryOf(step, at, fail);
        if (boundary === null) break;
        if (!held.has(boundary)) {
          fail("release-without-hold", `${at}.boundary`, `"${boundary}" was never held`);
          break;
        }
        held.delete(boundary);
        const results = baseOf(boundary) === "chunk.import" || baseOf(boundary) === "lazy.import" ? CHUNK_RESULTS : SAVE_RESULTS;
        if (!results.includes(step.result)) {
          fail("bad-release-result", `${at}.result`, `a ${baseOf(boundary)} release is ${results.join(", ")}`);
        }
        break;
      }
      default:
        break;
    }
  });
}

function boundaryOf(step, at, fail) {
  if (typeof step.boundary !== "string" || !step.boundary) {
    fail("bad-step-field", `${at}.boundary`, "boundary names what to hold");
    return null;
  }
  const base = baseOf(step.boundary);
  if (!BOUNDARIES.has(base)) {
    fail("unsupported-boundary", `${at}.boundary`, `"${base}" is not a boundary this step supports`);
    return null;
  }
  if (base === "chunk.import") {
    const path = step.boundary.slice(CHUNK_PREFIX.length);
    if (!step.boundary.startsWith(CHUNK_PREFIX) || !CHUNK_PATH.test(path)) {
      fail("boundary-needs-path", `${at}.boundary`, `a chunk hold names its path, as ${CHUNK_PREFIX}core/save.js`);
      return null;
    }
  }
  if (base === "lazy.import") {
    const path = step.boundary.slice(LAZY_PREFIX.length);
    if (!step.boundary.startsWith(LAZY_PREFIX) || !LAZY_PATH.test(path)) {
      fail("boundary-needs-path", `${at}.boundary`, `a lazy hold names its path, as ${LAZY_PREFIX}core/save-prepare.js`);
      return null;
    }
  }
  return step.boundary;
}

const readValue = (element) =>
  element && element.matches?.("input, textarea") ? element.value : element?.textContent ?? null;

const unsentField = (field) => document.querySelector(`[unsent="${field}"]`);

// A target is an element id, or — where a page's own editor owns the element and it has
// no id of its own — the selector that reaches it.
const elementFor = (target) => document.getElementById(target) ?? document.querySelector(target);

// The page under test's own live store, as the value a peer's frames land in and the
// article it projects onto.
const pageStore = (clay) => (typeof clay?.live === "function" ? clay.live("page") : null);

const pageSeed = (clay) => pageStore(clay)?.data ?? null;

// Whether the page under test took a peer's value: in its own store, or in the article
// its editor projected there.
const pageHolds = (clay, value) => {
  const data = pageStore(clay)?.data;
  return String(data ? JSON.stringify(data) : "").includes(value) || String(document.body.innerHTML).includes(value);
};

// The input op edits the page the way a person does: the value reaches the element and
// the element says it changed. Whether it got there is read back, never assumed.
function applyInput(element, value) {
  if (!element) return false;
  if (element.matches?.("input, textarea")) element.value = value;
  else element.textContent = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  return readValue(element) === value;
}

// Every request a case names, judged from the host's own account: an accepted request to
// the path whose body carries the text, and a relay whose html and etag are exactly the
// bytes and stamp of the save it repeats.
function judgeSaves(expected, result, fail) {
  const saves = result.calls.filter((call) => call.kind === "save");
  const accepted = saves.filter((call) => call.status === 200);
  expected.forEach((want, index) => {
    const at = `expect.saves[${index}]`;
    const candidates = accepted.filter((call) => call.path === want.path);
    if (!candidates.length) {
      fail(at, `the run sent no accepted request to "${want.path}"`);
      return;
    }
    if (want.contains !== undefined && !candidates.some((call) => call.body.includes(want.contains))) {
      fail(at, `no accepted request to "${want.path}" carried "${want.contains}"`);
      return;
    }
    if (want.relayOf === undefined) return;
    const source = saves[want.relayOf];
    if (!source) {
      fail(at, `the run sent no save at index ${want.relayOf} for "${want.path}" to relay`);
      return;
    }
    const relay = candidates[0];
    let parsed = null;
    try {
      parsed = JSON.parse(relay.body);
    } catch {
      parsed = null;
    }
    if (!isObject(parsed)) {
      fail(at, `the request to "${want.path}" carries no JSON body to relay save ${want.relayOf}`);
      return;
    }
    if (parsed.html !== source.body) {
      fail(at, `the relay to "${want.path}" carries html that is not the bytes save ${want.relayOf} sent`);
      return;
    }
    if (parsed.etag !== source.etag) {
      fail(at, `the relay to "${want.path}" carries etag ${JSON.stringify(parsed.etag)}, not the stamp ${JSON.stringify(source.etag)} save ${want.relayOf}'s response named`);
    }
  });
}

function reached(trace, requirement) {
  const cut = requirement.indexOf(":");
  const kind = cut === -1 ? requirement : requirement.slice(0, cut);
  const subject = cut === -1 ? null : requirement.slice(cut + 1);
  return trace.some((event) => {
    if (event.kind !== kind) return false;
    if (subject === null) return true;
    return event.detail.path === subject || event.detail.boundary === subject;
  });
}

/**
 * Run one schedule against the real switch.
 *
 * @param {object} json
 * @returns {Promise<{status: "passed"|"failed"|"invalid", trace: object[], result: object}>}
 */
export async function runCase(json) {
  const verdict = validateCase(json);
  const trace = [];
  if (!verdict.ok) return { status: "invalid", trace, result: { errors: verdict.errors } };

  let seq = 0;
  const record = (kind, detail = {}, tab = "A") => {
    trace.push({ seq: ++seq, tab, kind, detail });
  };

  const fixture = specOf(json);
  // Which session a request left in, read off the page the moment it is sent: the mode
  // generation and phase the page reports, and whether the save module was admitting an
  // ordinary save then, so the oracle can tell a write inside a closed exit from one an
  // open session made.
  let saveModule = null;
  const stamp = () => {
    const state = window.clay?.modeLifecycle?.state;
    return {
      generation: state?.generation ?? null,
      phase: state?.phase ?? null,
      open: typeof saveModule?.savesAdmitted === "function" ? saveModule.savesAdmitted() : null,
    };
  };
  const host = createHost(record, fixture.host ?? {}, { stamp });
  const cleanups = [];
  // A schedule can reach a page the case did not describe: an entry answered by a reload is
  // answered by a document a browser would replace, so nothing this driver could type into
  // it would be the page the case asked for. The precondition is the case's, so a run that
  // violates one is invalid, never failed. A stalled driver is the same kind of answer.
  const violations = [];
  let stalled = false;

  try {
    const host_ = await hostHarness();

    const flush = async (turns = 12) => {
      for (let i = 0; i < turns; i++) await new Promise((resolve) => process.nextTick(resolve));
      await host_.advance(0);
    };
    const settle = async (ms) => {
      await host_.advance(ms);
      await flush();
    };
    // A transition parks on the case's own clock: the page's promise settles only when the
    // clock moves, and only this driver moves it. The step is spent in slices until the
    // boundary answers, and a budget that runs out stalls the case instead of the child.
    const until = async (flight, at, op) => {
      let state = "pending";
      let value;
      let failure;
      Promise.resolve(flight).then(
        (answer) => {
          state = "settled";
          value = answer;
        },
        (error) => {
          state = "failed";
          failure = error;
        },
      );
      for (let spent = 0; ; spent += TRANSITION_STEP_MS) {
        await flush();
        if (state !== "pending") break;
        if (spent >= TRANSITION_BUDGET_MS) {
          record("driver-stalled", { step: at, op, budget: TRANSITION_BUDGET_MS });
          violations.push({ code: "driver-stalled", path: at, message: `the ${op} did not settle within ${TRANSITION_BUDGET_MS} ms of case time` });
          return { stalled: true, value: null };
        }
        await host_.advance(TRANSITION_STEP_MS);
      }
      if (state === "failed") throw failure;
      return { stalled: false, value };
    };

    let booted = await bootPage(fixture, { mode: json.boot.mode, host, resetModules: host_.resetModules, until });
    cleanups.push(() => booted.resources.stop());
    if (booted.stalled) return { status: "invalid", trace, result: { errors: violations } };
    let clay = booted.clay;

    // The entry imports its edit plan through this map, so a case holds an import here.
    // A reload imports the map again after a module reset, so its holds are re-applied.
    let MODULES = null;
    const holdChunks = async () => {
      MODULES = (await runtimeImport("src/loader-logic.js")).MODULES;
      for (const path of Object.keys(MODULES)) {
        const original = MODULES[path];
        cleanups.push(() => {
          MODULES[path] = original;
        });
        MODULES[path] = async () => {
          const boundary = `${CHUNK_PREFIX}${path}`;
          record("chunk-import-start", { path });
          if (host.held(boundary)) {
            const result = await host.wait(boundary);
            if (result === "failed") {
              record("chunk-import-done", { path, result: "failed" });
              throw new Error(`the case failed the import of ${path}`);
            }
          }
          const module = await original();
          record("chunk-import-done", { path, result: "loaded" });
          return module;
        };
      }
    };
    await holdChunks();

    // A lazy import is parked where the module loads, not in the loader's map: the runner
    // routes a held path through this gate, and this is the only place it is answered.
    const lazyHeld = new Set();
    if (host_.lazyImports === true) {
      globalThis.__clayLazyHeld = lazyHeld;
      globalThis.__clayLazyGate = async (path) => {
        const boundary = `${LAZY_PREFIX}${path}`;
        record("lazy-import-start", { path });
        if (host.held(boundary)) {
          const result = await host.wait(boundary);
          if (result === "failed") {
            record("lazy-import-done", { path, result: "failed" });
            throw new Error(`the case failed the import of ${path}`);
          }
        }
        record("lazy-import-done", { path, result: "loaded" });
      };
      cleanups.push(() => {
        delete globalThis.__clayLazyHeld;
        delete globalThis.__clayLazyGate;
      });
    }

    host_.startClock();
    cleanups.push(() => host_.stopClock());

    const onModeChange = () => record("modechange", { mode: clay.mode });
    const onSnapshot = (event) => record("snapshot-ready", { forSave: event.detail?.forSave === true });
    const onDraftFailed = (event) => record("draft-store-failed", { message: event.detail?.error?.message ?? null });
    const onDraftSaved = (event) => record("draft-saved", { unchanged: event.detail?.unchanged === true });
    document.addEventListener("clay:modechange", onModeChange);
    document.addEventListener("clay:snapshot-ready", onSnapshot);
    document.addEventListener("clay:drafts-store-failed", onDraftFailed);
    document.addEventListener("clay:drafts-saved", onDraftSaved);
    cleanups.push(() => {
      document.removeEventListener("clay:modechange", onModeChange);
      document.removeEventListener("clay:snapshot-ready", onSnapshot);
      document.removeEventListener("clay:drafts-store-failed", onDraftFailed);
      document.removeEventListener("clay:drafts-saved", onDraftSaved);
    });

    let phase = clay.modeLifecycle.state.phase;
    let mode = clay.mode;
    const observe = () => {
      if (!saveModule && typeof clay.save?.flush === "function") {
        runtimeImport("src/core/save.js").then((module) => {
          saveModule = module;
        });
      }
      const nextPhase = clay.modeLifecycle.state.phase;
      if (nextPhase !== phase) {
        phase = nextPhase;
        record("mode-phase", { phase: nextPhase });
      }
      const nextMode = clay.mode;
      if (nextMode !== mode) {
        mode = nextMode;
        record("mode", { mode: nextMode });
      }
    };

    const errors = [];
    for (const [index, step] of json.steps.entries()) {
      if (step.op !== "hold" || !step.boundary.startsWith(CHUNK_PREFIX)) continue;
      const path = step.boundary.slice(CHUNK_PREFIX.length);
      if (!Object.hasOwn(MODULES, path)) {
        errors.push({ code: "unknown-chunk", path: `steps[${index}].boundary`, message: `no module is named "${path}"` });
      }
    }
    for (const [index, step] of json.steps.entries()) {
      if (step.op !== "hold" || !step.boundary.startsWith(LAZY_PREFIX) || host_.lazyImports === true) continue;
      errors.push({ code: "unsupported-boundary", path: `steps[${index}].boundary`, message: "this runner cannot hold a lazy import: the corpus command can" });
    }
    if (errors.length) return { status: "invalid", trace, result: { errors } };

    let reloading = false;
    let flushes = 0;
    const precondition = (index, message) => violations.push({ code: "precondition", path: `steps[${index}]`, message });

    const lanes = fixture.lanes
      ? await createLanePair({ settle })
      : fixture.peer
        ? await createLanePair({ settle, channel: booted.channel, seed: pageSeed(clay), peer: true })
        : null;
    if (lanes) cleanups.push(() => lanes.stop());

    for (const [index, step] of json.steps.entries()) {
      if (stalled) break;
      record("step", { index, op: step.op });
      switch (step.op) {
        case "enter": {
          // A held import parks the entry, so the transition is started and watched
          // rather than awaited: awaiting it would be the case waiting on itself.
          const flight = clay.setMode("edit").catch((error) => ({ ok: false, code: error?.message ?? "threw" }));
          flight.then((answer) => {
            record("transition", { op: "enter", ok: answer?.ok === true, mode: answer?.mode ?? null, code: answer?.code ?? null, pending: answer?.pending ?? null, reloading: answer?.reloading ?? null, changed: answer?.changed ?? null });
            if (answer?.ok === false) record("transition-refused", { op: "enter", code: answer?.code ?? null, pending: answer?.pending ?? null });
            if (answer?.reloading === true) reloading = true;
          });
          await flush();
          break;
        }
        case "leave": {
          const flight = clay.setMode("view").catch((error) => ({ ok: false, code: error?.message ?? "threw" }));
          flight.then((answer) => {
            record("transition", { op: "leave", ok: answer?.ok === true, mode: answer?.mode ?? null, code: answer?.code ?? null, pending: answer?.pending ?? null });
            if (answer?.ok === false) record("transition-refused", { op: "leave", code: answer?.code ?? null, pending: answer?.pending ?? null });
          });
          await settle(LEAVE_SETTLE_MS);
          if (step.await !== false) {
            const answer = await until(flight, `steps[${index}]`, "leave");
            if (answer.stalled) {
              stalled = true;
              break;
            }
          }
          await flush();
          break;
        }
        case "input": {
          if (reloading) {
            precondition(index, "the entry was answered by a reload, so this page is no longer the one the case described");
            break;
          }
          const admitted = applyInput(elementFor(step.target), step.value);
          record(admitted ? "input-admitted" : "input-refused", { target: step.target, value: step.value });
          break;
        }
        case "unsent": {
          if (reloading) {
            precondition(index, "the entry was answered by a reload, so this page is no longer the one the case described");
            break;
          }
          const target = unsentField(step.field);
          if (target) target.dispatchEvent(new Event("beforeinput", { bubbles: true }));
          const admitted = applyInput(target, step.value);
          record(admitted ? "input-admitted" : "input-refused", { target: step.field, value: step.value, via: "unsent" });
          break;
        }
        case "compose": {
          if (reloading) {
            precondition(index, "the entry was answered by a reload, so this page is no longer the one the case described");
            break;
          }
          // An end commits a composition into the page that was being edited: after the
          // page left edit there is no such page, and a browser has already committed on
          // blur, so a schedule that ends one there is not describing a person.
          if (step.phase === "end" && clay.mode !== "edit") {
            precondition(index, `a composition cannot end in "${clay.mode}": the page left edit before it did`);
            break;
          }
          const target = elementFor(step.target);
          if (!target) {
            record("input-refused", { target: step.target, value: step.value ?? null });
            break;
          }
          // A field with a registry of its own is named by that registry, not by the id or
          // the selector the case reached it with.
          const unsent = target.getAttribute?.("unsent") ?? null;
          const name = unsent ?? step.target;
          if (step.phase === "start") {
            target.dispatchEvent(new Event("compositionstart", { bubbles: true }));
            record("compose-start", { target: name });
            break;
          }
          const admitted = applyInput(target, step.value);
          if (step.phase === "end") target.dispatchEvent(new Event("compositionend", { bubbles: true }));
          const detail = { target: name, value: step.value, composing: step.phase === "update" };
          if (unsent) detail.via = "unsent";
          record(admitted ? "input-admitted" : "input-refused", detail);
          break;
        }
        case "cycles": {
          for (let cycle = 1; cycle <= step.count; cycle++) {
            const entered = await until(clay.setMode("edit").catch((error) => ({ ok: false, code: error?.message ?? "threw" })), `steps[${index}]`, "enter");
            if (entered.stalled) {
              stalled = true;
              break;
            }
            const enterAnswer = entered.value;
            record("transition", { op: "enter", ok: enterAnswer?.ok === true, mode: enterAnswer?.mode ?? null, code: enterAnswer?.code ?? null, pending: enterAnswer?.pending ?? null });
            if (enterAnswer?.ok === false) record("transition-refused", { op: "enter", code: enterAnswer?.code ?? null, pending: enterAnswer?.pending ?? null });
            if (enterAnswer?.reloading === true) reloading = true;
            await flush();
            const departed = await until(clay.setMode("view").catch((error) => ({ ok: false, code: error?.message ?? "threw" })), `steps[${index}]`, "leave");
            if (departed.stalled) {
              stalled = true;
              break;
            }
            const leaveAnswer = departed.value;
            record("transition", { op: "leave", ok: leaveAnswer?.ok === true, mode: leaveAnswer?.mode ?? null, code: leaveAnswer?.code ?? null, pending: leaveAnswer?.pending ?? null });
            if (leaveAnswer?.ok === false) record("transition-refused", { op: "leave", code: leaveAnswer?.code ?? null, pending: leaveAnswer?.pending ?? null });
            await flush();
            observe();
            // Both ends of the pair: the first cycle leaves the page as an entry should and
            // the last leaves it as the hundredth should, and the two readings compare.
            if (cycle === 1 || cycle === step.count) record("resources", { cycle, ...booted.resources.snapshot() });
          }
          if (!stalled) record("cycles", { count: step.count });
          break;
        }
        case "click": {
          const target = elementFor(step.target);
          if (!target) {
            record("click-refused", { target: step.target });
            break;
          }
          target.click();
          record("click", { target: step.target });
          break;
        }
        case "flush": {
          // The page's own `clay.save.flush()`, started and watched like a transition: the
          // call is stamped with the session it was made in, and its answer with its number.
          const flush = clay.save?.flush;
          if (typeof flush !== "function") {
            record("flush-refused", { reason: "the page has no clay.save.flush" });
            break;
          }
          const number = ++flushes;
          const { generation, phase } = stamp();
          record("flush", { flush: number, generation, phase, mode: clay.mode });
          Promise.resolve(flush(step.timeoutMs === undefined ? {} : { timeoutMs: step.timeoutMs })).then(
            (answer) => record("flush-settled", { flush: number, state: answer?.state ?? null }),
            (error) => record("flush-settled", { flush: number, state: error?.state ?? "threw" }),
          );
          break;
        }
        case "storage": {
          if (window.__storageSwitch) window.__storageSwitch.mode = step.mode;
          record("storage", { mode: step.mode });
          break;
        }
        case "hold": {
          host.hold(step.boundary);
          if (step.boundary.startsWith(LAZY_PREFIX)) lazyHeld.add(step.boundary.slice(LAZY_PREFIX.length));
          record("hold", { boundary: step.boundary });
          break;
        }
        case "release": {
          host.release(step.boundary, step.result);
          if (step.boundary.startsWith(LAZY_PREFIX)) lazyHeld.delete(step.boundary.slice(LAZY_PREFIX.length));
          record("release", { boundary: step.boundary, result: step.result });
          break;
        }
        case "settle": {
          await settle(step.ms ?? 50);
          break;
        }
        case "reload": {
          // The bytes the host last accepted are the file a reload is served: this boot is
          // torn down, and the next one reads what the host kept. The boot runs on the
          // platform's own timers again, as the first one did.
          const accepted = host.calls.filter((call) => call.kind === "save" && call.status === 200).at(-1) ?? null;
          if (!accepted || typeof accepted.body !== "string" || accepted.body === "") {
            record("reload-refused", { reason: "the host accepted no bytes to serve" });
            break;
          }
          await host_.stopClock();
          booted.resources.stop();
          const again = await until(bootPage(fixture, {
            mode: json.boot.mode,
            host,
            resetModules: host_.resetModules,
            served: accepted.body,
            until,
          }), `steps[${index}]`, "reload");
          if (again.stalled) {
            stalled = true;
            break;
          }
          booted = again.value;
          if (booted.stalled) {
            stalled = true;
            break;
          }
          clay = booted.clay;
          saveModule = null;
          await holdChunks();
          await host_.startClock();
          phase = clay.modeLifecycle.state.phase;
          mode = clay.mode;
          record("reload", { bytes: accepted.body.length, etag: accepted.etag ?? null });
          break;
        }
        case "peer": {
          lanes.b.flow.insert(lanes.b.flow.length, step.action.value);
          record("peer-edit", { value: step.action.value }, "B");
          // The lane's own idle window: a frame is sent and ordered on its clock, not
          // on the case's.
          await settle(PEER_SETTLE_MS);
          const seen = lanes.a ? lanes.a.text().includes(step.action.value) : pageHolds(clay, step.action.value);
          record("peer-applied", { applied: seen }, "A");
          break;
        }
        default:
          break;
      }
      await flush();
      observe();
    }

    await settle(50);
    observe();

    const { pendingIds } = await runtimeImport("src/lib/unsaved-state.js");
    const result = {
      mode: clay.mode,
      writes: host.posts.length,
      phase: clay.modeLifecycle.state.phase,
      canWrite: clay.modeLifecycle?.canWrite?.() === true,
      // What the page held when the schedule ended, read off the DOM itself: the oracle
      // never takes the driver's word for what a save contained or where a value went.
      inputHtml: fixture.page.body,
      pageHtml: document.body.innerHTML,
      documentHtml: document.documentElement.outerHTML,
      fields: [...document.querySelectorAll("[id], [unsent]")].map((element) => ({
        id: element.id || null,
        unsent: element.getAttribute("unsent"),
        value: readValue(element),
      })),
      // The element each step named, resolved the way the ops resolved it: a target that
      // is a selector has no id to look up, so what it reached is recorded here.
      targets: [...new Set(json.steps.map((step) => step.target).filter((target) => typeof target === "string"))].map((target) => {
        const element = elementFor(target);
        return {
          target,
          id: element?.id || null,
          unsent: element?.getAttribute?.("unsent") ?? null,
          value: readValue(element),
        };
      }),
      // The page's own answer to the question a person asks before closing it.
      unsaved: clay.hasUnsavedChanges?.() === true,
      // The sources still pending when the run ended, as the page's own registry lists them.
      pending: pendingIds(),
      // The visitor's own store, as the run left it: a draft page's saves go there and
      // never to a host, so the oracle reads this rather than an accepted save's body.
      draft: (() => {
        const drafts = clay.visitorDrafts;
        if (!drafts || drafts.active !== true) return null;
        let raw = null;
        try { raw = window.localStorage.getItem(drafts.key); } catch { raw = null; }
        let data = null;
        try { data = raw == null ? null : JSON.parse(raw).data ?? null; } catch { data = null; }
        return { key: drafts.key, raw, data };
      })(),
      calls: host.calls.map((call) => ({ ...call })),
      tabs: lanes
        ? {
            a: lanes.a ? { ydoc: lanes.a.ydoc, text: lanes.a.text() } : null,
            b: { ydoc: lanes.b.ydoc, text: lanes.b.text() },
          }
        : null,
      errors: [],
    };

    if (violations.length) {
      result.errors = violations;
      return { status: "invalid", trace, result };
    }

    const unmet = (json.requires ?? []).filter((requirement) => !reached(trace, requirement));
    if (unmet.length) {
      result.errors = unmet.map((requirement) => ({
        code: "unmet-requirement",
        path: "requires",
        message: `the run never reached "${requirement}"`,
      }));
      return { status: "invalid", trace, result };
    }

    const expected = json.expect ?? {};
    if (expected.mode !== undefined && expected.mode !== result.mode) {
      result.errors.push({ code: "expect-mode", path: "expect.mode", message: `the run ended in "${result.mode}", not "${expected.mode}"` });
    }
    if (expected.writes !== undefined && expected.writes !== result.writes) {
      result.errors.push({ code: "expect-writes", path: "expect.writes", message: `the run sent ${result.writes} save requests, not ${expected.writes}` });
    }
    if (Array.isArray(expected.saves)) {
      judgeSaves(expected.saves, result, (path, message) => {
        result.errors.push({ code: "expect-saves", path, message });
      });
    }

    return { status: result.errors.length ? "failed" : "passed", trace, result };
  } finally {
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch {}
    }
  }
}
