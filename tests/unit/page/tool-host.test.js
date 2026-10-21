import { readFileSync } from "node:fs";
import { jest } from "@jest/globals";
import { createStore } from "../../../src/live/store.js";
import { createToolHost } from "../../../src/page/tools.js";

const examples = [...readFileSync(new URL("../../../docs/page-tool.md", import.meta.url), "utf8").matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]));
const root = () => document.createElement("section");
const store = (value) => createStore({ name: "page.tools", value }).handle;

test("the documented tally shares add operations across two editors", () => {
  const live = store({ tally: { r1: { count: 0 } } });
  const first = createToolHost({ store: live, mode: "edit" });
  const second = createToolHost({ store: live, mode: "edit" });
  const a = root(), b = root();
  first.mount(a, { id: "tally", rev: "r1", artifact: examples[1] });
  second.mount(b, { id: "tally", rev: "r1", artifact: examples[1] });
  a.querySelector("button").click();
  b.querySelector("button").click();
  expect(live.data.tally.r1.count).toBe(2);
  expect(a.querySelector("output").textContent).toBe("2");
  expect(b.querySelector("output").textContent).toBe("2");
  first.dispose(); second.dispose();
});

test("an editor waits for missing state and mounts without initializing it", () => {
  const live = store({});
  const host = createToolHost({ store: live, mode: "edit" });
  const el = root();
  host.mount(el, { id: "tally", rev: "r1", artifact: examples[1], seed: { count: 7 } });
  expect(el.textContent).toContain("Waiting for this tool's state");
  expect(live.data).toEqual({});
  live.set(["tally", "r1"], { count: 3 });
  expect(el.querySelector("output").textContent).toBe("3");
  host.dispose();
});

test("reader clicks remain local, and an old document uses its seed with a warning", () => {
  const live = store({ tally: { r1: { count: 1 } } });
  const reader = createToolHost({ store: live, mode: "view" });
  const el = root();
  reader.mount(el, { id: "tally", rev: "r1", artifact: examples[1] });
  el.querySelector("button").click();
  expect(el.querySelector("output").textContent).toBe("2");
  expect(live.data.tally.r1.count).toBe(1);
  reader.dispose();
  const old = createToolHost({ mode: "edit" });
  old.mount(el, { id: "tally", rev: "r1", artifact: examples[1], seed: { count: 4 } });
  expect(el.querySelector("output").textContent).toBe("4");
  expect(el.textContent).toContain("This document can't save tool state");
  old.dispose();
});

test("revision changes dispose timers and cleanup once while a failing neighbor remains isolated", () => {
  jest.useFakeTimers();
  globalThis.__toolCleanup = 0;
  const live = store({ clock: { r1: { remaining: 2 }, r2: { remaining: 9 } }, bad: { r1: {} } });
  const host = createToolHost({ store: live, mode: "edit" });
  const clock = root(), bad = root();
  const artifact = { ...examples[0], javascript: examples[0].javascript.replace("return tool.on('change', draw);", "const off = tool.on('change', draw); return () => { off(); globalThis.__toolCleanup++; };") };
  const mounted = host.mount(clock, { id: "clock", rev: "r1", artifact });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  host.mount(bad, { id: "bad", rev: "r1", artifact: { ...examples[1], javascript: "throw new Error('boom')" } });
  expect(bad.textContent).toContain("Tool could not start");
  mounted.update({ artifact, rev: "r2" });
  expect(globalThis.__toolCleanup).toBe(1);
  expect(clock.querySelector(".count").textContent).toBe("9");
  mounted.dispose(); mounted.dispose(); host.dispose();
  expect(globalThis.__toolCleanup).toBe(2);
  expect(jest.getTimerCount()).toBe(0);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
  jest.useRealTimers();
});

test("the documented big number receives one coalesced table notification", () => {
  jest.useFakeTimers();
  let tables = [{ id: "revenue", cols: [], rows: [{ cells: { amount: "2" } }] }];
  const host = createToolHost({ mode: "view", tables: () => tables });
  const el = root();
  host.mount(el, { id: "number", rev: "r1", artifact: examples[2] });
  expect(el.querySelector("output").textContent).toBe("2");
  tables = [{ id: "revenue", cols: [], rows: [{ cells: { amount: "4" } }] }];
  host.tablesChanged(); host.tablesChanged();
  jest.runOnlyPendingTimers();
  expect(el.querySelector("output").textContent).toBe("4");
  host.dispose();
  jest.useRealTimers();
});

test("a state notification failure leaves its fallback and does not stop another tool", () => {
  const live = store({ bad: { r1: { count: 0 } }, good: { r1: { count: 0 } } });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const host = createToolHost({ store: live, mode: "edit" });
  const bad = root(), good = root();
  host.mount(bad, { id: "bad", rev: "r1", artifact: { ...examples[1], javascript: "function mount(tool) { tool.on('change', () => { throw new Error('boom') }); }" } });
  host.mount(good, { id: "good", rev: "r1", artifact: examples[1] });
  live.add(["bad", "r1", "count"], 1);
  live.add(["good", "r1", "count"], 1);
  expect(bad.textContent).toContain("Tool could not start");
  expect(good.querySelector("output").textContent).toBe("1");
  expect(warn).toHaveBeenCalledTimes(1);
  host.dispose(); warn.mockRestore();
});
