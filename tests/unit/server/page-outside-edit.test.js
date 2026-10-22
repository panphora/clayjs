/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import {
  createRooms,
  splitPage,
  documentEtag,
  inspectPage,
  makePageTransition,
  checkPageWriteAdmission,
  checkPageWriteFormat,
  pageLineageLost,
  PageFormatError,
} from "../../../src/server/rooms/index.js";

const template = readFileSync(new URL("../../fixtures/ypage-template.html", import.meta.url), "utf8");
const tagless = splitPage(template).file;
const pageTag = `<script type="application/json" merge="page" clay="live">${JSON.stringify({ v: 1, g: 0, y: { seed: "abc" } })}</script>`;
const doc = (...parts) => `<!doctype html><html><body>${parts.join("")}</body></html>`;
const hybrid = doc(`<script type="application/json" merge="page" clay="live">${JSON.stringify({ blocks: { b1: { text: "hi" } } })}</script>`);
const yjs = doc(pageTag);
const header = `v1; source=file; base=${"a".repeat(64)}`;

const refusesFormat = (fn) => {
  let thrown = null;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  return thrown;
};

test("a tagless write to a Yjs document is an ordinary write", () => {
  expect(inspectPage(template).kind).toBe("yjs");
  expect(inspectPage(tagless).kind).toBe("none");
  expect(checkPageWriteAdmission({ currentHtml: template, html: tagless, ifMatch: documentEtag(template) })).toBe("ordinary");
});

test("a tagless write with a conversion header is still refused as a page format", () => {
  let thrown = null;
  try {
    checkPageWriteAdmission({ currentHtml: template, html: tagless, header, ifMatch: documentEtag(template) });
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(PageFormatError);
  expect(thrown.code).toBe("page-format");
});

test("a room in a Yjs transition accepts a tagless body as ordinary", () => {
  const rooms = createRooms();
  const room = rooms.open("/page.html", template, { nodeId: 1 });
  expect(room.pageTransition.format).toBe("yjs");
  expect(checkPageWriteAdmission({ currentHtml: template, html: tagless, room })).toBe("ordinary");
});

test("a hybrid body after Yjs is still refused with page-format", () => {
  expect(inspectPage(hybrid).kind).toBe("hybrid");
  expect(refusesFormat(() => checkPageWriteAdmission({ currentHtml: template, html: hybrid }))).toBeInstanceOf(PageFormatError);
  expect(refusesFormat(() => checkPageWriteFormat({ currentHtml: template, html: hybrid }))).toBeInstanceOf(PageFormatError);
});

test("the guard accepts a tagless body on a Yjs document", () => {
  expect(checkPageWriteFormat({ currentHtml: template, html: tagless })).toBeUndefined();
  const room = createRooms().open("/page.html", template, { nodeId: 1 });
  expect(checkPageWriteFormat({ currentHtml: template, html: tagless, room })).toBeUndefined();
});

test("pageLineageLost answers whether a Yjs room lost its page lineage", () => {
  const rooms = createRooms();
  const room = rooms.open("/page.html", template, { nodeId: 1 });
  expect(room.stores.has("page")).toBe(true);
  expect(pageLineageLost(room, tagless)).toBe(true);
  expect(pageLineageLost(room, template)).toBe(false);

  const other = createRooms().open("/other.html", doc(`<script type="application/json" merge="game" clay="live">{"score":0}</script>`), { nodeId: 1 });
  expect(other.stores.has("page")).toBe(false);
  expect(pageLineageLost(other, tagless)).toBe(false);

  const hybridRoom = { ...room, pageTransition: makePageTransition({ format: "hybrid" }) };
  expect(pageLineageLost(hybridRoom, tagless)).toBe(false);
  expect(pageLineageLost(null, tagless)).toBe(false);
});
