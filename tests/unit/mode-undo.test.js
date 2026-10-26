/**
 * @jest-environment jsdom
 */

/**
 * Undo as a mode lease.
 *
 * The page has one DOM history per edit session. So:
 *
 *   - the entry starts a fresh history over the page as it stands, a second preparation
 *     adds no second history, and the exit hands back the history, its Cmd+Z binding and
 *     exactly the subscriptions the session added;
 *   - a reader update that lands while the page is in view is not the next session's to
 *     undo: nothing recorded before the entry can be replayed over it;
 *   - a refused exit resumes the same history, and what the barrier writes while
 *     recording is closed never becomes an entry;
 *   - the durable recovery records outlive the session: neither the entry nor the exit
 *     reaches the page's recovery service, so leaving edit takes the history and never
 *     this browser's only copy of unsaved writing;
 *   - a preparation whose body was not there yet starts nothing once its generation has
 *     moved on;
 *   - an effect takes the undo backstop from the instance that is current, again after
 *     every committed change, and releases exactly the handlers it was given.
 *
 * The modules are the real ones, driven in the order a boot and a switch drive them.
 */

import { jest } from "@jest/globals";
import Mutation from "../../src/lib/mutation.js";
import { effect } from "../../src/lib/effect.js";

const FIXTURE = `
  <p id="article">authored</p>
  <div id="elsewhere"></div>
`;

const additions = [];
const removals = [];
const realAdd = EventTarget.prototype.addEventListener;
const realRemove = EventTarget.prototype.removeEventListener;
const realWindowAdd = window.addEventListener;
const realWindowRemove = window.removeEventListener;

const forType = (log, type, target) => log.filter((entry) => entry.type === type && entry.target === target);

const article = () => document.getElementById("article");

const pressUndo = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true }));
const pressRedo = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey: true }));

let plugin;
let undo;
const leases = [];

const prepare = (context = {}) =>
  plugin.undoParticipant().prepare({ generation: 1, isCurrent: () => true, ...context });

const enter = async (context) => {
  const lease = await prepare(context);
  lease.enable();
  leases.push(lease);
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
  // jsdom keeps the window's own pair off EventTarget.prototype, and Cmd+Z is bound there.
  window.addEventListener = function (type, handler, options) {
    additions.push({ target: this, type, handler, options });
    return realWindowAdd.call(this, type, handler, options);
  };
  window.removeEventListener = function (type, handler, options) {
    removals.push({ target: this, type, handler, options });
    return realWindowRemove.call(this, type, handler, options);
  };
  plugin = await import("../../src/plugins/undo.js");
  undo = plugin.undo;
});

afterAll(() => {
  EventTarget.prototype.addEventListener = realAdd;
  EventTarget.prototype.removeEventListener = realRemove;
  window.addEventListener = realWindowAdd;
  window.removeEventListener = realWindowRemove;
});

beforeEach(() => {
  additions.length = 0;
  removals.length = 0;
  window.clay = {};
  document.body.innerHTML = FIXTURE;
});

afterEach(() => {
  while (leases.length) leases.pop().dispose();
  window.clay = undefined;
});

test("the entry starts one history and one Cmd+Z binding, a second preparation adds neither, and dispose takes exactly those back", async () => {
  const lease = await enter();
  const added = forType(additions, "keydown", window);
  expect(added).toHaveLength(1);
  expect(added[0].options).toBe(true);

  const second = await prepare();
  second.enable();
  expect(forType(additions, "keydown", window)).toHaveLength(1);

  lease.dispose();
  const removed = forType(removals, "keydown", window);
  expect(removed).toHaveLength(1);
  expect(removed[0].handler).toBe(added[0].handler);
  expect(removed[0].options).toBe(true);
});

test("an explicit edit boot's history is adopted, and its dispose takes the history and the binding back", async () => {
  // The import road: this tab booted in edit, so the module's own init() started the page's
  // history and its Cmd+Z binding before any mode lease existed.
  jest.resetModules();
  window.clayEditMode = true;
  let booted;
  let adopted;
  let live;
  try {
    booted = await import("../../src/plugins/undo.js");
    await booted.ready;

    const added = forType(additions, "keydown", window);
    expect(added).toHaveLength(1);
    expect(added[0].options).toBe(true);

    // Adoption is that same history: no second binding, and what it recorded is undoable.
    adopted = await booted.modeParticipant().prepare({ generation: 1, isCurrent: () => true, initial: true });
    adopted.enable();
    expect(forType(additions, "keydown", window)).toHaveLength(1);

    booted.undo.commit("Typing", () => {
      article().textContent = "typed";
    });
    pressUndo();
    expect(article().textContent).toBe("authored");

    adopted.dispose();

    const removed = forType(removals, "keydown", window);
    expect(removed).toHaveLength(1);
    expect(removed[0].handler).toBe(added[0].handler);

    // A live entry after that exit starts one fresh history and one fresh binding.
    live = await booted.undoParticipant().prepare({ generation: 2, isCurrent: () => true });
    live.enable();
    expect(forType(additions, "keydown", window)).toHaveLength(2);

    live.dispose();
    expect(forType(removals, "keydown", window)).toHaveLength(2);
  } finally {
    live?.dispose();
    adopted?.dispose();
    (await booted?.ready)?.dispose?.();
    delete window.clayEditMode;
    jest.resetModules();
  }
});

test("a later session starts from the page it finds: the last session's history and a reader update in between are not its to undo", async () => {
  const first = await enter();
  undo.commit("Typing", () => {
    article().textContent = "typed";
  });
  expect(undo.canUndo).toBe(true);
  pressUndo();
  expect(article().textContent).toBe("authored");

  undo.commit("Typing", () => {
    article().textContent = "typed again";
  });
  first.dispose();
  expect(undo.canUndo).toBe(false);

  // The reader repaints the article while the page is in view.
  article().textContent = "from a peer";

  await enter();
  expect(undo.history).toEqual([]);
  pressUndo();
  expect(article().textContent).toBe("from a peer");

  undo.commit("Typing", () => {
    article().textContent = "second session";
  });
  pressUndo();
  expect(article().textContent).toBe("from a peer");

  pressRedo();
  expect(article().textContent).toBe("second session");
});

test("a refused exit resumes the same history, and what the barrier writes is not recorded", async () => {
  const lease = await enter();
  undo.commit("Typing", () => {
    article().textContent = "one";
  });
  expect(undo.history).toHaveLength(1);

  lease.quiesce();
  document.getElementById("elsewhere").setAttribute("data-barrier", "1");
  await Promise.resolve();
  lease.resume();

  expect(undo.history).toHaveLength(1);
  pressUndo();
  expect(article().textContent).toBe("authored");
  expect(document.getElementById("elsewhere").getAttribute("data-barrier")).toBe("1");
});

test("the session takes the history and never reaches the page's durable recovery service", async () => {
  const touched = [];
  window.clay.recovery = new Proxy(
    {},
    {
      get(_, prop) {
        touched.push(prop);
        return () => {};
      },
    }
  );

  const lease = await enter();
  undo.commit("Typing", () => {
    article().textContent = "typed";
  });
  pressUndo();
  lease.quiesce();
  lease.resume();
  lease.dispose();

  expect(touched).toEqual([]);
});

test("an adoption on a boot that started nothing starts nothing", async () => {
  // A view boot: init() answered null, so there is no history to adopt and the lease must
  // not fall back to starting one.
  jest.resetModules();
  try {
    const view = await import("../../src/plugins/undo.js");
    expect(await view.ready).toBeNull();

    const adopted = await view.modeParticipant().prepare({ generation: 1, isCurrent: () => true, initial: true });
    adopted.enable();

    expect(forType(additions, "keydown", window)).toHaveLength(0);

    adopted.dispose();
    expect(forType(removals, "keydown", window)).toHaveLength(0);
  } finally {
    jest.resetModules();
  }
});

test("a preparation whose generation moved on starts nothing", async () => {
  let current = true;
  const pending = prepare({ isCurrent: () => current });
  // The page leaves edit while the body the scope needs is still being waited for.
  current = false;

  await expect(pending).rejects.toMatchObject({ code: "stale-document" });
  expect(forType(additions, "keydown", window)).toHaveLength(0);

  await expect(
    plugin.undoParticipant().prepare({ generation: 2, signal: { aborted: true }, isCurrent: () => true })
  ).rejects.toMatchObject({ code: "stale-document" });
});

test("an effect takes the undo backstop from the instance that is current, again after a committed change, and releases exactly those handlers", async () => {
  const on = jest.spyOn(undo, "on");
  const off = jest.spyOn(undo, "off");
  let stop = null;
  try {
    // The page has an effect before the undo plugin is on it.
    window.clay = { Mutation };
    stop = effect(() => {});
    expect(on).not.toHaveBeenCalled();

    // The plugin arrives, and the committed change that follows takes the pair.
    window.clay.undo = undo;
    document.dispatchEvent(new Event("clay:modechange"));
    expect(on.mock.calls.map(([type]) => type)).toEqual(["undo", "redo"]);
    const handler = on.mock.calls[0][1];

    // A later committed change takes the pair again, on the instance that is current now.
    document.dispatchEvent(new Event("clay:modechange"));
    expect(on.mock.calls.map(([type]) => type)).toEqual(["undo", "redo", "undo", "redo"]);
    expect(off).not.toHaveBeenCalled();

    stop();
    stop = null;
    expect(off.mock.calls.map(([type]) => type)).toEqual(["undo", "redo"]);
    expect(off.mock.calls.at(-1)[1]).toBe(handler);
    expect(off.mock.calls.at(-1)[1]).toBe(on.mock.calls.at(-1)[1]);
  } finally {
    stop?.();
    on.mockRestore();
    off.mockRestore();
  }
});
