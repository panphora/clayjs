import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Scenario: the vendored Sap runs against the real `clay.modeLifecycle` facade. A
// reader's record write is refused at its destination, the same write lands once the
// session is in edit, and Sap keeps one undo pair per editing session: it rebinds when
// a mode change is committed and lets go of the pair a retired session held.
//
// The vendor is the file the shipped templates load (`entries/sap.js`, served as
// /v1/sap.js) and the facade is the one the loader assembles, driven through the real
// controller. Each case gets its own module registry, as the mode lifecycle's does.

const BOARD = `
  <main sap state="sel q">
    <section items="cards" hidden>
      <article item template data-id="" state="data-done:presence"><input bind="title"></article>
      <article item data-id="c1" state="data-done:presence"><input bind="title" value="Alpha"></article>
      <article item data-id="c2" state="data-done:presence" data-done><input bind="title" value="Beta"></article>
    </section>
    <ul id="v" each="state.cards">
      <template><li><input class="t" bind="title"><button class="pick" set:sel="item.$key">pick</button></li></template>
    </ul>
    <output id="o" text="state.cards.map(c => c.title).join(',')"></output>
    <output id="s" text="state.sel"></output>
  </main>`;

const row = (root, key) => root.querySelector(`#v > [data-key="${key}"]`);
const record = (root, key) => root.querySelector(`[data-id="${key}"]`);

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

// What a keystroke does: one write path, on the control the person touched.
function type(control, value) {
  control.value = String(value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

// The page boots as its owner: view mode, and able to ask for edit. The body carries
// no [sap] root yet, so the loader's own derivation has nothing to mount and the case
// mounts the vendor itself, on top of the assembled facade.
async function bootPage() {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  window.history.replaceState({}, "", "/board.html");
  for (const name of Array.from(document.documentElement.attributes, (attribute) => attribute.name)) {
    document.documentElement.removeAttribute(name);
  }
  document.head.innerHTML = "";
  document.body.innerHTML = '<div id="content">start</div>';
  window.clay = {};
  window.fetch = jest.fn(async () => new Response("", { status: 404 }));
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams("exclude=richclay,source"), resolve));
  return window.clay;
}

// The classic script a template's own <script src="…/v1/sap.js"> runs.
function loadVendor() {
  new Function(readFileSync(join(process.cwd(), "entries/sap.js"), "utf8"))();
  return window.Sap;
}

function mountBoard(Sap, html = BOARD) {
  window.Sap._reset();
  document.body.innerHTML = html;
  const root = document.querySelector("[sap]");
  Sap.mount(root);
  return root;
}

// hyper-undo's shape: `on()` hands back the only proof a handler really attached, and
// that function is the only way to take it off again.
function undoPlugin() {
  const listeners = [];
  return {
    bound: 0,
    names: () => listeners.map((entry) => entry.name),
    // The subscriptions themselves: each on() makes a new one, so a retired pair is
    // recognizable even though Sap re-registers the same refresh closure.
    entries: () => listeners.slice(),
    on(name, fn) {
      const entry = { name, fn };
      this.bound++;
      listeners.push(entry);
      return () => {
        const index = listeners.indexOf(entry);
        if (index !== -1) listeners.splice(index, 1);
      };
    },
    fire(name) {
      const pair = listeners.filter((entry) => entry.name === name);
      for (const entry of pair) entry.fn();
      return pair.length;
    },
  };
}

// A case that leaves its Sap installed would keep listening, and the next case's undo
// plugin would be rebound by the retired instance. One case, one engine.
afterEach(() => {
  window.Sap?.unmount?.();
  delete window.Sap;
  document.cookie = "isAdminOfCurrentResource=; path=/";
});

describe("admission at the destination", () => {
  test("a reader's row write and declared-state write are refused; in edit the same writes land", async () => {
    const clay = await bootPage();
    const Sap = loadVendor();
    const root = mountBoard(Sap);

    expect(clay.mode).toBe("view");
    expect(clay.modeLifecycle.canWrite()).toBe(false);

    type(row(root, "c1").querySelector(".t"), "Alpha 2");
    click(row(root, "c2").querySelector(".pick"));
    await flush();

    expect(record(root, "c1").querySelector("input").value).toBe("Alpha");
    expect(root.querySelector("#o").textContent).toBe("Alpha,Beta");
    expect(root.querySelector("#s").textContent).toBe("");

    const lifecycle = await import("../../src/core/mode-lifecycle.js");
    await expect(lifecycle.requestMode("edit")).resolves.toMatchObject({ ok: true, mode: "edit" });
    expect(clay.modeLifecycle.canWrite()).toBe(true);

    type(row(root, "c1").querySelector(".t"), "Alpha 2");
    click(row(root, "c2").querySelector(".pick"));
    await flush();

    expect(record(root, "c1").querySelector("input").value).toBe("Alpha 2");
    expect(root.querySelector("#o").textContent).toBe("Alpha 2,Beta");
    expect(root.querySelector("#s").textContent).toBe("c2");
  });
});

describe("one undo pair per editing session", () => {
  test("the view session binds one pair, and readiness signals do not stack a second", async () => {
    const clay = await bootPage();
    const undo = undoPlugin();
    clay.undo = undo;
    const Sap = loadVendor();
    mountBoard(Sap);

    expect(undo.names()).toEqual(["undo", "redo"]);
    expect(undo.bound).toBe(2);

    document.dispatchEvent(new Event("clay:mutation-ready"));
    document.dispatchEvent(new Event("clay:ready"));
    document.dispatchEvent(new Event("clay:sync-applied"));
    await flush();

    expect(undo.names()).toEqual(["undo", "redo"]);
    expect(undo.bound).toBe(2);
    expect(undo.fire("undo")).toBe(1);
  });

  test("a committed mode change rebinds the pair once, to the new generation", async () => {
    const clay = await bootPage();
    const undo = undoPlugin();
    clay.undo = undo;
    const Sap = loadVendor();
    mountBoard(Sap);
    const retired = undo.entries();

    const lifecycle = await import("../../src/core/mode-lifecycle.js");
    await lifecycle.requestMode("edit");

    expect(clay.modeLifecycle.state.generation).toBe(1);
    expect(undo.names()).toEqual(["undo", "redo"]);
    expect(undo.bound).toBe(4);
    for (const entry of retired) expect(undo.entries()).not.toContain(entry);
    expect(undo.fire("redo")).toBe(1);

    await lifecycle.requestMode("view");

    expect(clay.modeLifecycle.state.mode).toBe("view");
    expect(clay.modeLifecycle.state.generation).toBe(2);
    expect(undo.names()).toEqual(["undo", "redo"]);
    expect(undo.bound).toBe(6);
    expect(undo.fire("undo")).toBe(1);
  }, 15000);

  test("an undo plugin published after the mode changed binds exactly once", async () => {
    const clay = await bootPage();
    const Sap = loadVendor();
    mountBoard(Sap);

    const lifecycle = await import("../../src/core/mode-lifecycle.js");
    await lifecycle.requestMode("edit");
    expect(clay.modeLifecycle.canWrite()).toBe(true);

    const undo = undoPlugin();
    clay.undo = undo;
    document.dispatchEvent(new Event("clay:mutation-ready"));
    await flush();

    expect(undo.names()).toEqual(["undo", "redo"]);
    expect(undo.bound).toBe(2);
    expect(undo.fire("undo")).toBe(1);
  }, 15000);
});

describe("a retired session keeps no handles", () => {
  test("unmount detaches the pair and a late mode change rebinds nothing", async () => {
    const clay = await bootPage();
    const undo = undoPlugin();
    clay.undo = undo;
    const Sap = loadVendor();
    mountBoard(Sap);
    const retired = undo.entries();

    expect(undo.fire("undo")).toBe(1);

    Sap.unmount();
    expect(undo.names()).toEqual([]);
    for (const entry of retired) expect(undo.entries()).not.toContain(entry);

    document.dispatchEvent(new Event("clay:modechange"));
    document.dispatchEvent(new Event("clay:mutation-ready"));
    document.dispatchEvent(new Event("clay:ready"));
    document.dispatchEvent(new Event("clay:route"));
    await flush();

    expect(undo.names()).toEqual([]);
    expect(undo.bound).toBe(2);
    expect(undo.fire("undo")).toBe(0);
    expect(undo.fire("redo")).toBe(0);
  });
});
