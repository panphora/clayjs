/**
 * Positions captured before the format gate's wait are stale once a peer edit
 * lands during activation. Each command below either re-finds its target or
 * refuses, so nothing is deleted or written at a place that has moved.
 */
import { schema } from "../../../src/page/schema.js";
import { model } from "../../../src/vendor/prosemirror.vendor.js";
import { BLOCK_TYPES, runItem } from "../../../src/page/items.js";
import { pasteFormats } from "../../../src/page/format-native-commands.js";
import { editor, posOf, select, typeText } from "./view-helpers.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const shapeOf = (view) => {
  const out = [];
  view.state.doc.forEach((node) => out.push([node.type.name, node.textContent]));
  return out;
};

test("a slash quote whose line moved while the gate waited deletes nothing", async () => {
  const view = editor([["a", "paragraph", "First line"], ["b", "paragraph", "Second /quote"]]);
  let release;
  view.runFormatCommand = (apply) => new Promise((done) => {
    release = async () => done({ status: "applied", floor: 1, result: await apply({ floor: 1 }) });
  });
  const from = posOf(view, "b") + 7, to = from + 6;
  expect(view.state.doc.textBetween(from, to)).toBe("/quote");
  const pending = runItem(view, BLOCK_TYPES.find((b) => b.key === "quote"), 1, { from, to });
  view.dispatch(view.state.tr.insertText("PEER ", posOf(view, "a")));
  await release();
  expect(await pending).toMatchObject({ ok: false, code: "stale-target" });
  expect(shapeOf(view)).toEqual([["paragraph", "PEER First line"], ["paragraph", "Second /quote"]]);
});

test("a refused formatted paste writes nothing at positions a peer edit moved", async () => {
  const view = editor([["a", "paragraph", "Hello world"]]);
  let release;
  view.runFormatCommand = () => new Promise((done) => {
    release = () => done({ status: "upgrade-required", message: "no" });
  });
  const slice = new model.Slice(model.Fragment.from(schema.text("UL", [schema.marks.underline.create()])), 0, 0);
  const start = posOf(view, "a");
  pasteFormats(view, slice, start + 6, start + 11);
  view.dispatch(view.state.tr.insertText("PEER ", start));
  release();
  await settle();
  await settle();
  expect(shapeOf(view)).toEqual([["paragraph", "PEER Hello world"]]);
});

test('a refused " shortcut with later typing in the line puts no stale space back', async () => {
  const view = editor([["a", "paragraph", ""]]);
  let release;
  view.runFormatCommand = () => new Promise((done) => {
    release = () => done({ status: "upgrade-required", message: "no" });
  });
  select(view, posOf(view, "a"));
  typeText(view, '"');
  expect(typeText(view, " ")).toBe(true);
  await settle();
  typeText(view, "x");
  const mismatched = [];
  const dispatch = view.dispatch;
  view.dispatch = (tr) => { try { dispatch(tr); } catch (error) { mismatched.push(error); } };
  release();
  await settle();
  await settle();
  expect(mismatched).toEqual([]);
  expect(shapeOf(view)).toEqual([["paragraph", '"x']]);
});
