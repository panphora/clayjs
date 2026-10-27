/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * The production host adapter behind the format gate. The save it sends is the real
 * one, so the marker the host receives is the marker save-core puts on the bytes: an
 * accepted activation is the only thing that raises what this tab knows the document
 * at, and a refusal leaves every later save exactly as it was.
 *
 * The floors here are the modules' own state and only ever rise, so the tests that
 * need a floor-0 document run before the one that activates it.
 */

const PAGE = '<article data-page="1"><p data-type="paragraph">start</p></article>';
const MARKER = '<meta name="clay-page-format" content="1">';

let level;
let gateOf;
let hostOf;
let saveMod;
let saves;

const page = () => {
  document.body.innerHTML = PAGE;
  document.documentElement.setAttribute("savetoken", "abc");
  document.querySelector('meta[name="clay-page-format"]')?.remove();
};

// Every answer is the host's: the meta discovery is not a save, and it says nothing.
const answer = (respond) => {
  saves = [];
  global.fetch = jest.fn(async (url, options) => {
    if (!String(url).includes("/_/save/")) return { ok: true, status: 200, text: async () => "{}" };
    const body = options.body;
    saves.push({ url: String(url), body });
    return respond(saves.length, body);
  });
};
const saved = () => ({ ok: true, status: 200, text: async () => JSON.stringify({ msg: "Saved", etag: "e1" }) });
const refused = () => ({
  ok: false,
  status: 409,
  statusText: "Conflict",
  text: async () => JSON.stringify({ code: "page-format-upgrade-required", msg: "This document uses a newer page format" }),
});
const offline = () => {
  throw new TypeError("Failed to fetch");
};

const gateOver = (host) => gateOf.createFormatGate({ host, supported: host.supported, installed: () => "tab-r", revision: () => null });

beforeAll(async () => {
  window.clayEditMode = true;
  level = await import("../../../src/page/format-level.js");
  gateOf = await import("../../../src/page/format-gate.js");
  hostOf = await import("../../../src/page/format-host.js");
  saveMod = await import("../../../src/core/save.js");
});

beforeEach(page);

test("a refused activation leaves the floor at 0, applies nothing, and the next save carries no marker", async () => {
  answer(refused);
  const gate = gateOver(hostOf.createFormatHost({ supported: async () => true }));
  const applied = [];
  const result = await gate.run({ apply: () => applied.push("sparkle") });

  expect(result.status).toBe("upgrade-required");
  expect(result.code).toBe("page-format-upgrade-required");
  expect(result.minimum).toBe(1);
  expect(applied).toEqual([]);
  expect(gate.floor).toBe(0);
  // The one save that was sent asked for floor 1, even though nothing has noted it.
  expect(saves).toHaveLength(1);
  expect(saves[0].body).toContain(MARKER);
  expect(level.knownPageFormatFloor()).toBe(0);

  answer(saved);
  const after = await saveMod.savePageForce();
  expect(after.ok).toBe(true);
  expect(saves).toHaveLength(1);
  expect(saves[0].body).not.toContain(MARKER);
  expect(level.knownPageFormatFloor()).toBe(0);
});

test("a network failure is a retryable failure, not an upgrade requirement", async () => {
  answer(offline);
  const gate = gateOver(hostOf.createFormatHost({ supported: async () => true }));
  const applied = [];
  const result = await gate.run({ apply: () => applied.push("sparkle") });

  expect(result.status).toBe("failed");
  expect(result.code).toBe("page-format-activation-failed");
  expect(result.retry).toBe(true);
  expect(applied).toEqual([]);
  expect(level.knownPageFormatFloor()).toBe(0);
});

test("an unsupported host refuses before any save is sent", async () => {
  answer(saved);
  const gate = gateOver(hostOf.createFormatHost({ supported: async () => false }));
  const result = await gate.run({ apply: () => "sparkle" });

  expect(result.status).toBe("unsupported-host");
  expect(result.extension).toBe("page-format-v1");
  expect(saves).toHaveLength(0);
  expect(level.knownPageFormatFloor()).toBe(0);
});

test("a second concurrent run shares the one activation save, which carries the marker at floor 0", async () => {
  expect(level.knownPageFormatFloor()).toBe(0);
  answer(saved);
  const gate = gateOver(hostOf.createFormatHost({ supported: async () => true }));
  const applied = [];
  const [first, second] = await Promise.all([
    gate.run({ apply: () => applied.push("one") }),
    gate.run({ apply: () => applied.push("two") }),
  ]);

  expect(saves).toHaveLength(1);
  expect(saves[0].body).toContain(MARKER);
  expect(first.status).toBe("applied");
  expect(second.status).toBe("applied");
  expect(applied).toEqual(["one", "two"]);
  // Only an accepted activation makes this tab's known floor 1.
  expect(level.knownPageFormatFloor()).toBe(1);
});

test("the next ordinary save carries the floor the accepted activation wrote", async () => {
  expect(level.knownPageFormatFloor()).toBe(1);
  answer(saved);
  await saveMod.savePageForce();

  expect(saves).toHaveLength(1);
  expect(saves[0].body).toContain(MARKER);
});

test("runFormatCommand on a disposed editor applies nothing", async () => {
  const { createPageEditor } = await import("../../../src/page/editor.js");
  const applied = [];
  let disposed = false;
  const gate = {
    async run({ apply }) {
      return { status: "applied", result: await apply() };
    },
    dispose() {
      disposed = true;
    },
  };
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, {
    blocks: { p: { t: "paragraph", pos: "V", c: "Hi" } },
    formatGate: () => Promise.resolve(gate),
  });
  expect(await view.runFormatCommand(() => applied.push("before"))).toEqual({ status: "applied", result: 1 });

  view.destroy();
  const after = await view.runFormatCommand(() => applied.push("after"));
  expect(after).toEqual({ status: "disposed", retry: false });
  expect(applied).toEqual(["before"]);
  expect(disposed).toBe(true);
});
