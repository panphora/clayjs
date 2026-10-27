/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { history, state as pmState, view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createPageEditor, runPageCommand, setEditorActive } from "../../../src/page/editor.js";
import { schema } from "../../../src/page/schema.js";
import { runsOf } from "../../../src/page/inline.js";
import { blockMap } from "../../../src/page/model.js";
import { canon, parseModel, project, renderModel, revOf } from "../../../src/page/projection.js";
import { earlyDays, isISODate, localISODate } from "../../../src/page/features/dates.js";
import { createStore } from "../../../src/live/store.js";
import { createYPageBinding } from "../../../src/page/ybind/index.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { yValueOf } from "../../../src/page/ybind/provider.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";
import { NEIGHBOUR } from "../../fixtures/page/formats/m13-cases.mjs";
import { runFormatted } from "../../../src/page/format-command.js";

/**
 * Date mentions: the Date action offers Today and Tomorrow, and choosing one writes that
 * calendar day as ordinary ISO text under the date mark, read as a `time` element. Both
 * days are resolved once, when the command runs, from the local calendar, and nothing here
 * stores a time, a zone or a reminder or changes the document while the picker is up.
 */

const DATE_KEY = (date) => `x["date",{"date":"${date}"}]`;
const BLOCKS = () => ({
  a: { t: "paragraph", pos: "00000001", c: "Hello " },
  z: { t: "paragraph", pos: "00000002", c: "Neighbour line" },
});
const TABLE = { t: "table", pos: "00000001", cols: { c1: { pos: "00000001", name: "Due" } }, rows: { r1: { pos: "00000001", cells: { c1: "Due" } } } };

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  jest.useRealTimers();
});

// The local calendar day of an instant, written the way a person reads it. Independent of
// the module under test, so it pins the local fields rather than repeating its arithmetic.
const localOf = (at) => `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;

function open(blocks = BLOCKS()) {
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks });
  // No gate is loaded on this page, so a mention asks this one and writes when it says yes.
  view.runFormatCommand = async (apply) => ({ status: "applied", floor: 1, result: await apply({}) });
  cleanups.push(() => { if (!view.isDestroyed) view.destroy(); mount.remove(); });
  return view;
}

// An editor over a live binding, so the same records travel through Yjs as in a real page.
function bindingView(binding) {
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  cleanups.push(() => { if (!view.isDestroyed) view.destroy(); mount.remove(); });
  binding.attach(view);
  return view;
}

const record = (view, id) => blockMap(view.state.doc)[id];
const blockPos = (view, id) => {
  let found = null;
  view.state.doc.forEach((node, pos) => { if (found === null && node.attrs.id === id) found = pos; });
  return found;
};
const endOf = (view, id) => blockPos(view, id) + 1 + view.state.doc.nodeAt(blockPos(view, id)).textContent.length;
const caret = (view, pos) => view.dispatch(view.state.tr.setSelection(pmState.TextSelection.create(view.state.doc, pos)));
const pickerEl = () => document.querySelector(".page-mention-picker");
const options = () => [...document.querySelectorAll(".page-mention-picker .page-menu-item")];
const keys = (view, key) => view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const start = (view) => runPageCommand(view, "dates", {});
// The date the command just wrote, read back from the record rather than predicted, so the
// test cannot race a clock it is not holding.
const written = (view, id) => String(/^\D*(\d{4}-\d{2}-\d{2}) /.exec(record(view, id).c)?.[1] ?? "");

function articleOf(html, rev) {
  const parsed = new DOMParser().parseFromString(`<!DOCTYPE html><html><body><article data-page="1" data-rev="${rev}">\n${html}\n</article></body></html>`, "text/html");
  return parsed.querySelector("article");
}
// The page value a document opens with, from the projection's own bytes.
const seed = (blocks) => {
  const model = project(blocks);
  return JSON.parse(JSON.stringify(seedPageFromArticle(articleOf(renderModel(model), revOf(model)))));
};
const reopen = (blocks) => {
  const model = project(blocks);
  return parseModel(articleOf(renderModel(model), revOf(model)));
};

test("a leap day is a date, and the day after one is March", () => {
  expect(isISODate("2024-02-29")).toBe(true);
  expect(earlyDays("2024-02-28").map((day) => day.date)).toEqual(["2024-02-28", "2024-02-29"]);
  expect(earlyDays("2024-02-29").map((day) => day.date)).toEqual(["2024-02-29", "2024-03-01"]);
  expect(earlyDays("2023-12-31").map((day) => day.date)).toEqual(["2023-12-31", "2024-01-01"]);
});

test("a day that does not exist is not a date, and a stored one stays readable", () => {
  for (const value of ["2023-02-29", "2024-04-31", "2024-13-01", "2024-00-10", "2024-1-01", "2024-02-29T00:00", "20240229", "", null, 20240229]) {
    expect([value, isISODate(value)]).toEqual([value, false]);
  }
  expect(isISODate("2024-04-30")).toBe(true);

  // A record a writer already stored with a day that is not a day keeps its text and its
  // mark for the next writer, and a reader shows the text it holds.
  const blocks = { a: { t: "paragraph", pos: "00000001", c: "Due 2023-02-29", m: [[4, ""], [10, DATE_KEY("2023-02-29")]] }, z: { t: "paragraph", pos: "00000002", c: NEIGHBOUR.c } };
  const model = project(blocks);
  const article = articleOf(renderModel(model), revOf(model));
  expect(article.textContent).toContain("Due 2023-02-29");
  expect(reopen(blocks).find((item) => item.id === "a").m).toEqual(blocks.a.m);
});

test("today is the local calendar date, never the UTC instant", () => {
  const instant = new Date("2024-02-29T23:30:00Z");
  expect(localISODate(instant)).toBe(localOf(instant));
  // A clock whose UTC instant is already the next month while its own calendar still says
  // the 29th: the date a person picked is the one their wall clock shows.
  const clock = { getFullYear: () => 2024, getMonth: () => 1, getDate: () => 29, toISOString: () => "2024-03-01T00:30:00.000Z" };
  expect(localISODate(clock)).toBe("2024-02-29");
});

test("Today is captured once, when the command runs", async () => {
  jest.useFakeTimers({ now: new Date("2024-02-28T09:00:00Z"), doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "queueMicrotask", "nextTick", "requestAnimationFrame", "cancelAnimationFrame"] });
  const today = localOf(new Date());
  const view = open();
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  expect(options().map((option) => option.textContent)).toEqual([`Today (${today})`, `Tomorrow (${earlyDays(today)[1].date})`]);

  // A picker left open across days still writes the day the command was asked for.
  jest.setSystemTime(new Date("2024-03-04T09:00:00Z"));
  options()[0].click();
  expect(record(view, "a").c).toBe(`Hello ${today} `);
});

test("the date is ISO text with the date mark, in a paragraph and in a table cell", async () => {
  const view = open();
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  options()[1].click();
  const date = written(view, "a");
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(record(view, "a").c).toBe(`Hello ${date} `);
  expect(runsOf(record(view, "a").m)).toEqual([[6, ""], [10, DATE_KEY(date)], [1, ""]]);

  // The article states the day twice, as the text and as `datetime`, inside a `time`.
  const saved = blockMap(view.state.doc);
  const article = articleOf(renderModel(project(saved)), revOf(project(saved)));
  expect(article.innerHTML).toContain(`<time datetime="${date}" data-page-date=""`);
  const reopened = reopen(saved).find((item) => item.id === "a");
  expect(reopened.c).toBe(`Hello ${date} `);
  expect(reopened.m).toEqual(runsOf(saved.a.m));

  // And the same mark travels through a table cell's {c, m} value.
  const cellView = open({ tbl: { ...TABLE }, z: { t: "paragraph", pos: "00000002", c: NEIGHBOUR.c } });
  let cell = null;
  cellView.state.doc.descendants((node, pos) => { if (cell === null && node.type.name === "table_cell") cell = { node, pos }; });
  caret(cellView, cell.pos + 1 + cell.node.textContent.length);
  expect(await start(cellView)).toEqual({ ok: true, picker: true });
  options()[1].click();
  const inCell = blockMap(cellView.state.doc).tbl.rows.r1.cells.c1;
  const cellDate = String(inCell.c).slice(3, 13);
  expect(inCell.c).toBe(`Due${cellDate} `);
  expect(cellDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(inCell.m).toEqual([[3, ""], [10, DATE_KEY(cellDate)], [1, ""]]);
  const afterCell = blockMap(cellView.state.doc);
  const cellArticle = articleOf(renderModel(project(afterCell)), revOf(project(afterCell)));
  expect(cellArticle.querySelector("td time")).not.toBeNull();
  expect(reopen(afterCell).find((item) => item.id === "tbl").rows[0].cells.c1).toEqual(inCell);
});

test("nothing about an open picker changes the document in the background", async () => {
  const view = open();
  caret(view, endOf(view, "a"));
  const before = canon(blockMap(view.state.doc));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  expect(options()).toHaveLength(2);
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(canon(blockMap(view.state.doc))).toBe(before);
  expect(pickerEl()).not.toBeNull();

  // A list that wrote something would leave an undo entry; undo finds nothing to take back.
  history.undoNoScroll(view.state, view.dispatch);
  expect(canon(blockMap(view.state.doc))).toBe(before);
  expect(pickerEl()).not.toBeNull();
});

test("a block that refuses marks, and a selection that is not a caret, refuse the date", async () => {
  const view = open({
    code: { t: "code_block", pos: "00000001", c: "let x" },
    a: { t: "paragraph", pos: "00000002", c: "Hello " },
  });
  caret(view, blockPos(view, "code") + 1);
  expect(await start(view)).toEqual({ ok: false, code: "stale-target" });
  expect(pickerEl()).toBeNull();
  expect(record(view, "code").c).toBe("let x");
  expect(record(view, "code").m).toBeUndefined();

  view.dispatch(view.state.tr.setSelection(pmState.TextSelection.create(view.state.doc, blockPos(view, "a") + 1, blockPos(view, "a") + 3)));
  expect(await start(view)).toEqual({ ok: false, code: "stale-target" });
  expect(pickerEl()).toBeNull();
  expect(record(view, "a").c).toBe("Hello ");
  expect(record(view, "a").m).toBeUndefined();
  history.undoNoScroll(view.state, view.dispatch);
  expect(record(view, "a").c).toBe("Hello ");
});

test("a bookmark whose caret moved refuses, and writes nothing", async () => {
  const view = open();
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  caret(view, endOf(view, "z"));
  options()[0].click();
  expect(record(view, "a").c).toBe("Hello ");
  expect(record(view, "z").c).toBe("Neighbour line");
  expect(pickerEl()).toBeNull();
});

test("undo takes the date back out and redo puts it back", async () => {
  const view = open();
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  options()[0].click();
  const date = written(view, "a");
  expect(record(view, "a").c).toBe(`Hello ${date} `);

  history.undoNoScroll(view.state, view.dispatch);
  expect(record(view, "a").c).toBe("Hello ");
  expect(record(view, "a").m).toBeUndefined();
  history.redoNoScroll(view.state, view.dispatch);
  expect(record(view, "a").c).toBe(`Hello ${date} `);
  expect(runsOf(record(view, "a").m)).toEqual([[6, ""], [10, DATE_KEY(date)], [1, ""]]);
});

test("an older writer's neighbour edit keeps the date and its mark", () => {
  const date = "2024-02-29";
  const blocks = JSON.parse(JSON.stringify({
    a: { t: "paragraph", pos: "00000001", c: "Due 2024-02-29", m: [[4, ""], [10, DATE_KEY(date)]] },
    z: { t: "paragraph", pos: NEIGHBOUR.pos, c: NEIGHBOUR.c },
  }));
  const store = createStore({ name: "page", value: seed(blocks) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  cleanups.push(() => { binding.dispose(); binding.ydoc.destroy(); });
  const view = bindingView(binding);

  let neighbour = null;
  view.state.doc.forEach((node, pos) => { if (node.attrs.id === NEIGHBOUR.id) neighbour = { node, pos }; });
  view.dispatch(view.state.tr.insertText(NEIGHBOUR.add, neighbour.pos + 1 + neighbour.node.textContent.length));

  const after = blocksFromYValue(yValueOf(binding.ydoc));
  expect(after.a.c).toBe("Due 2024-02-29");
  expect(after.a.m).toEqual([[4, ""], [10, DATE_KEY(date)]]);
  expect(after.z.c).toBe(NEIGHBOUR.c + NEIGHBOUR.add);

  const article = articleOf(renderModel(project(after)), revOf(project(after)));
  expect(article.innerHTML).toContain(`<time datetime="${date}" data-page-date=""`);
  expect(article.textContent).toContain("2024-02-29");
  expect(after.a.c.slice(0, 4)).toBe("Due ");
});

test("view, edit, view leaves no picker and no listener behind", async () => {
  const view = open();
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  expect(pickerEl()).not.toBeNull();
  setEditorActive(view, false);
  expect(pickerEl()).toBeNull();
  expect(view.dom.hasAttribute("aria-activedescendant")).toBe(false);
  // The disposed session hears nothing: a stale Enter writes no date.
  keys(view, "Enter");
  expect(record(view, "a").c).toBe("Hello ");

  setEditorActive(view, true);
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  expect(document.querySelectorAll(".page-mention-picker")).toHaveLength(1);
  keys(view, "ArrowDown");
  keys(view, "Enter");
  expect(document.querySelectorAll(".page-mention-picker")).toHaveLength(0);
  expect(record(view, "a").c).toMatch(/^Hello \d{4}-\d{2}-\d{2} $/);
  expect(view.dom.hasAttribute("aria-activedescendant")).toBe(false);
  expect(schema.marks.date.spec.excludes).toBe("mention date link");
});

// The gate awaits, so a date asks it before it writes and writes only when it says yes.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a gate that refuses writes no date, marks nothing and leaves no undo entry", async () => {
  const view = open();
  const asked = [];
  view.runFormatCommand = async () => { asked.push(true); return { status: "upgrade-required", code: "page-format-upgrade-required" }; };
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  const before = view.state.doc;
  options()[0].click();
  await settle();

  expect(asked).toHaveLength(1);
  expect(record(view, "a").c).toBe("Hello ");
  expect(record(view, "a").m).toBeUndefined();
  // Nothing was dispatched at all, so history has no entry for a date that was refused.
  expect(view.state.doc).toBe(before);
  history.undoNoScroll(view.state, view.dispatch);
  expect(record(view, "a").c).toBe("Hello ");
  expect(record(view, "a").m).toBeUndefined();

  // The answer is the gate's own refusal, so a caller reads the code rather than a date.
  expect(await runFormatted(view, () => { throw new Error("a refused command writes nothing"); }))
    .toEqual({ ok: false, code: "page-format-upgrade-required", retry: false });
});

test("the gate is asked once per date, and the written day is its answer", async () => {
  const view = open();
  const asked = [];
  view.runFormatCommand = async (apply) => { asked.push(apply); return { status: "applied", floor: 1, result: await apply({}) }; };
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  options()[0].click();
  await settle();

  expect(asked).toHaveLength(1);
  const date = written(view, "a");
  expect(isISODate(date)).toBe(true);
  expect(record(view, "a").c).toBe(`Hello ${date} `);
  expect(runsOf(record(view, "a").m)).toEqual([[6, ""], [10, DATE_KEY(date)], [1, ""]]);
});

test("a caret that moves while the gate is pending refuses with stale-target", async () => {
  const view = open();
  const answers = [];
  let release = null;
  view.runFormatCommand = async (apply) => {
    await new Promise((resolve) => { release = resolve; });
    const result = await apply({});
    answers.push(result);
    return { status: "applied", floor: 1, result };
  };
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  options()[0].click();
  expect(release).not.toBeNull();
  caret(view, endOf(view, "z"));
  release();
  await settle();

  expect(answers).toEqual([{ ok: false, code: "stale-target" }]);
  expect(record(view, "a").c).toBe("Hello ");
  expect(record(view, "a").m).toBeUndefined();
  expect(record(view, "z").c).toBe("Neighbour line");
});
