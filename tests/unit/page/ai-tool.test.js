import { jest } from "@jest/globals";
import { createStore } from "../../../src/live/store.js";
import { createPageEditor } from "../../../src/page/editor.js";
import { createAiTool } from "../../../src/page/ai-tool.js";
import { capabilityAdvertised } from "../../../src/page/rich/page-tool.js";
import { history, state } from "../../../src/vendor/prosemirror.vendor.js";
import { typeText } from "./view-helpers.js";

const artifact = (title) => ({ title, html: `<output>${title}</output>`, css: "", javascript: "function mount() {}", fallbackHtml: `<p>${title}</p>`, summary: title });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
let view, ai, live, requests, finish, cancelled, order, nextId;

function setup({ block = { p: { t: "paragraph", pos: "V", c: "" } }, accepting = true, saveResult = { ok: true } } = {}) {
  document.body.innerHTML = '<article data-page="1"></article>';
  live = createStore({ name: "page.tools", value: block.t ? { t: { r1: { count: 1 } } } : {} }).handle;
  requests = []; cancelled = []; order = []; nextId = 0;
  const transport = { request(request) { requests.push(request); return new Promise((resolve) => { finish = resolve; }); }, cancel(id) { cancelled.push(id); } };
  ai = createAiTool({
    getView: () => view, store: accepting ? live : { set() { throw new Error("state-too-large"); } }, transport,
    acceptState: async () => {
      order.push("accepted");
      expect(Object.keys(live.data).length).toBeGreaterThan(0);
      expect(view.state.doc.toJSON().content.filter((node) => node.type === "tool")).toHaveLength(block.t ? 1 : 0);
      return saveResult;
    },
    newId: (prefix) => `${prefix}-${++nextId}`,
  });
  view = createPageEditor(document.querySelector("article"), {
    blocks: block,
    onAiTool: (_view, remove) => ai.open({ remove }),
    reviseTool: (toolId, rev) => ai.open({ target: { toolId, rev } }),
  });
}
function generate(title = "Made") {
  const panel = document.querySelector(".page-ai-panel");
  panel.querySelector("textarea").value = "make a counter";
  [...panel.querySelectorAll("button")].find((button) => button.textContent === "Generate").click();
  finish({ requestId: requests.at(-1).requestId, artifact: artifact(title), state: { count: 2 } });
  return settle();
}
const press = (label) => [...document.querySelectorAll(".page-ai-panel button")].find((button) => button.textContent === label).click();

afterEach(() => { ai?.dispose(); view?.destroy(); ai = view = null; });

test("the slash menu hides AI without capability and shows it with the page-tool capability", () => {
  expect(capabilityAdvertised({ extensions: ["page"] })).toBe(false);
  setup();
  view.dom.parentElement.querySelector(".page-plus").click();
  expect(view.dom.parentElement.querySelector(".page-menu").textContent).toContain("Make a tool with AI");
  view.destroy(); ai.dispose();
  document.body.innerHTML = '<article data-page="1"></article>';
  view = createPageEditor(document.querySelector("article"), { blocks: { p: { t: "paragraph", pos: "V", c: "" } } });
  view.dom.parentElement.querySelector(".page-plus").click();
  expect(view.dom.parentElement.querySelector(".page-menu").textContent).not.toContain("Make a tool with AI");
  expect(capabilityAdvertised({ extensions: ["page", "page-tool/1"] })).toBe(true);
});

test("Generate previews locally, then Keep saves state before one node transaction and one undo", async () => {
  setup();
  ai.open();
  await generate();
  expect(document.querySelector(".page-ai-preview output").textContent).toBe("Made");
  expect(live.data).toEqual({});
  press("Keep");
  await settle();
  expect(order).toEqual(["accepted"]);
  expect(view.state.doc.child(0).type.name).toBe("tool");
  expect(live.data[view.state.doc.child(0).attrs.id][view.state.doc.child(0).attrs.rev]).toEqual({ count: 2 });
  history.undo(view.state, view.dispatch);
  expect(view.state.doc.child(0).type.name).toBe("paragraph");
});

test("the /ai pick replaces its bookmark, and a deleted bookmark uses the current caret", async () => {
  setup();
  view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
  for (const char of "/ai") typeText(view, char);
  const row = [...document.querySelectorAll(".page-menu-item")].find((item) => item.textContent.includes("Make a tool with AI"));
  expect(row).toBeTruthy();
  row.click();
  await generate();
  press("Keep");
  await settle();
  expect(view.state.doc.child(0).type.name).toBe("tool");
  expect(view.state.doc.textContent).not.toContain("/ai");

  ai.open();
  await generate("Another");
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.child(0).nodeSize, view.state.schema.nodes.paragraph.create({ id: "new-host", pos: "V" })));
  press("Keep");
  await settle();
  expect(view.state.doc.child(0).type.name).toBe("tool");
  expect(view.state.doc.child(0).attrs.artifact.title).toBe("Another");
});

test("Keep removes an inline /ai query in the same insertion transaction", async () => {
  setup({ block: { p: { t: "paragraph", pos: "V", c: "hello " } } });
  view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
  view.dispatch(view.state.tr.setSelection(state.TextSelection.create(view.state.doc, view.state.doc.child(0).nodeSize - 1)));
  for (const char of "/ai") typeText(view, char);
  [...document.querySelectorAll(".page-menu-item")].find((item) => item.textContent.includes("Make a tool with AI")).click();
  await generate();
  press("Keep");
  await settle();
  expect(view.state.doc.child(0).textContent).toBe("hello ");
  expect(view.state.doc.child(1).type.name).toBe("tool");
});

test("a late result after Discard never inserts, and duplicate completion inserts once", async () => {
  setup();
  ai.open();
  document.querySelector(".page-ai-panel textarea").value = "counter";
  press("Generate");
  const id = requests[0].requestId;
  press("Cancel");
  finish({ requestId: id, artifact: artifact("Late"), state: {} });
  await settle();
  expect(view.state.doc.child(0).type.name).toBe("paragraph");
  expect(cancelled).toContain(id);
  ai.open();
  await generate();
  finish({ requestId: requests.at(-1).requestId, artifact: artifact("Again"), state: {} });
  press("Keep"); press("Keep");
  await settle();
  expect(view.state.doc.content.content.filter((node) => node.type.name === "tool")).toHaveLength(1);
});

test("Revise keeps the old revision for undo and detects a concurrent revision change", async () => {
  setup({ block: { t: { t: "tool", pos: "V", artifact: artifact("Old"), rev: "r1", state: { count: 1 } } } });
  ai.open({ target: { toolId: "t", rev: "r1" } });
  await generate("New");
  expect(requests[0].target).toEqual({ toolId: "t", rev: "r1" });
  press("Keep");
  await settle();
  expect(view.state.doc.child(0).attrs.artifact.title).toBe("New");
  expect(live.data.t.r1).toEqual({ count: 1 });
  history.undo(view.state, view.dispatch);
  expect(view.state.doc.child(0).attrs.rev).toBe("r1");
  ai.open({ target: { toolId: "t", rev: "r1" } });
  await generate("Later");
  view.dispatch(view.state.tr.setNodeMarkup(0, null, { ...view.state.doc.child(0).attrs, rev: "other" }));
  press("Keep");
  await settle();
  expect(document.querySelector(".page-ai-status").textContent).toContain("changed while you were revising");
  expect(document.querySelector(".page-ai-panel")).not.toBeNull();
});

test("a refused state write leaves no block and shows the error", async () => {
  setup({ accepting: false });
  ai.open();
  await generate();
  press("Keep");
  await settle();
  expect(view.state.doc.child(0).type.name).toBe("paragraph");
  expect(document.querySelector(".page-ai-status").textContent).toContain("state-too-large");
});

test("a save that does not accept the state leaves no block", async () => {
  setup({ saveResult: { ok: false, msgType: "skipped", msg: "Save already in progress" } });
  ai.open();
  await generate();
  press("Keep");
  await settle();
  expect(view.state.doc.child(0).type.name).toBe("paragraph");
  expect(document.querySelector(".page-ai-status").textContent).toContain("Save already in progress");
});
