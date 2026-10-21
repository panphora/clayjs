import { readFileSync } from "node:fs";
import { applyOp, cloneJson } from "../../../../src/live/ops.js";
import { ARTIFACT_LIMIT, STATE_LIMIT, ToolStateError, validateArtifact, validateState, scopedStateHandle, readerStateHandle, scopeCss, mountTool } from "../../../../src/page/rich/tool-runtime.js";

const artifact = (javascript = "function mount() {}") => ({ title: "Example", html: "<output></output>", css: "output { color: red; }", javascript, fallbackHtml: "<p>Fallback</p>", summary: "Test" });
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

function store() {
  const writes = [];
  const data = { tool1: { r1: { count: 1 } } };
  return {
    data, writes,
    set(path, value) { writes.push(["set", path, value]); applyOp(data, { op: "set", path, value }); },
    delete(path) { writes.push(["delete", path]); applyOp(data, { op: "del", path }); },
    add(path, n) { writes.push(["add", path, n]); applyOp(data, { op: "add", path, n }); },
  };
}

test("artifact and state validation enforce exact JSON byte limits and shape", () => {
  const a = artifact();
  a.summary = "x".repeat(ARTIFACT_LIMIT - bytes({ ...a, summary: "" }));
  expect(validateArtifact(a)).toEqual({ ok: true });
  a.summary += "x";
  expect(validateArtifact(a).code).toBe("artifact-too-large");
  expect(validateArtifact({ ...a, extra: "x" }).code).toBe("invalid-artifact");
  const state = { text: "x".repeat(STATE_LIMIT - bytes({ text: "" })) };
  expect(validateState(state)).toEqual({ ok: true });
  state.text += "x";
  expect(validateState(state).code).toBe("state-too-large");
  expect(validateState({ bad: Infinity }).code).toBe("invalid-state");
  expect(validateState({ bad: undefined }).code).toBe("invalid-state");
  const cycle = {}; cycle.self = cycle;
  expect(validateState(cycle).code).toBe("invalid-state");
});

test("scoped state prefixes writes, rejects bad paths and oversize values, and delegates add", () => {
  const live = store();
  const state = scopedStateHandle(live, "tool1", "r1");
  state.set(["label"], "ready");
  state.add(["count"], 2);
  state.delete(["label"]);
  expect(state.data.count).toBe(3);
  expect(live.writes).toEqual([
    ["set", ["tool1", "r1", "label"], "ready"],
    ["add", ["tool1", "r1", "count"], 2],
    ["delete", ["tool1", "r1", "label"]],
  ]);
  expect(() => state.set("label", "wrong")).toThrow(TypeError);
  expect(() => state.set([-1], "wrong")).toThrow(TypeError);
  expect(() => state.set(["huge"], "x".repeat(STATE_LIMIT))).toThrow(ToolStateError);
  expect(live.writes).toHaveLength(3);
});

test("reader state is a private deep clone and notifies listeners", () => {
  const source = { nested: { count: 1 } };
  const state = readerStateHandle(source);
  let changes = 0;
  const off = state.on("change", () => changes++);
  state.add(["nested", "count"], 2);
  state.set(["label"], "local");
  off();
  state.delete(["label"]);
  expect(source).toEqual({ nested: { count: 1 } });
  expect(state.data.nested.count).toBe(3);
  expect(changes).toBe(2);
  const copy = state.data; copy.nested.count = 99;
  expect(state.data.nested.count).toBe(3);
});

test("CSS scope handles selector lists and media without changing keyframes", () => {
  const result = scopeCss("h1, p:hover {color:red}@media (max-width: 400px) {h2, p {opacity:.5}}@keyframes pulse {from {opacity:0}to {opacity:1}}", "#block");
  expect(result).toContain("#block h1, #block p:hover{color:red}");
  expect(result).toContain("@media (max-width: 400px){#block h2, #block p{opacity:.5}}");
  expect(result).toContain("@keyframes pulse{from {opacity:0}to {opacity:1}}");
});

test("mount receives frozen table copies and notifications; dispose clears timers and cleanup once", () => {
  const root = document.createElement("section");
  const state = readerStateHandle({ count: 1 });
  const tables = [{ id: "t", rows: [{ id: "r", cells: { n: "2" } }] }];
  const scheduled = [], cleared = [], errors = [];
  let cleanup = 0, changed = 0, tableChanged = 0;
  const js = "function mount(tool) { tool.on('change', () => tool.root.dataset.changed = 'yes'); tool.on('tables', () => tool.root.dataset.tables = 'yes'); tool.schedule(() => {}, 1000); const copy = tool.table('t'); tool.root.dataset.frozen = String(Object.isFrozen(copy.rows[0])); return () => { tool.root.dataset.cleaned = 'yes'; }; }";
  const view = mountTool({ root, artifact: artifact(js), mode: "edit", state, tables: () => tables, onError: (error) => errors.push(error), setTimer: (fn) => { scheduled.push(fn); return scheduled.length; }, clearTimer: (id) => cleared.push(id) });
  view.notifyState(); view.notifyTables();
  expect(root.dataset).toMatchObject({ changed: "yes", tables: "yes", frozen: "true" });
  expect(tables[0].rows[0].cells.n).toBe("2");
  view.dispose(); view.dispose();
  expect(cleared).toEqual([1]);
  expect(root.dataset.cleaned).toBe("yes");
  expect(errors).toEqual([]);
});

test.each(["throw new Error('script');", "function mount(tool) { tool.schedule(() => {}, 100); throw new Error('mount'); }"])("a throwing tool renders fallback and clears resources", (javascript) => {
  const root = document.createElement("section");
  const cleared = [], errors = [];
  const view = mountTool({ root, artifact: artifact(javascript), mode: "edit", state: readerStateHandle({}), onError: (error) => errors.push(error), setTimer: () => 7, clearTimer: (id) => cleared.push(id) });
  expect(root.innerHTML).toContain("Fallback");
  expect(root.querySelector("[data-tool-error]")).not.toBeNull();
  expect(errors).toHaveLength(1);
  if (javascript.includes("tool.schedule")) expect(cleared).toEqual([7]);
  view.dispose();
  expect(errors).toHaveLength(1);
});

test("all three documented artifacts validate and mount", () => {
  const doc = readFileSync(new URL("../../../../docs/page-tool.md", import.meta.url), "utf8");
  const examples = [...doc.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]));
  expect(examples).toHaveLength(3);
  for (const example of examples) {
    expect(validateArtifact(example)).toEqual({ ok: true });
    const root = document.createElement("section");
    const errors = [];
    const state = readerStateHandle({ remaining: 2, count: 0 });
    const view = mountTool({ root, artifact: example, mode: "reader", state, tables: () => [{ id: "revenue", rows: [{ cells: { amount: "12" } }] }], onError: (error) => errors.push(error), setTimer: () => 1, clearTimer: () => {} });
    expect(errors).toEqual([]);
    expect(root.querySelector("[data-tool-error]")).toBeNull();
    if (example.title === "Tally") { root.querySelector("button").click(); view.notifyState(); expect(root.querySelector("output").textContent).toBe("1"); }
    if (example.title === "Big number") expect(root.querySelector("output").textContent).toBe("12");
    view.dispose();
  }
});
