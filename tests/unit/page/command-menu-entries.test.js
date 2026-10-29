import { jest } from "@jest/globals";
import { COMMAND_FEATURES } from "../../../src/page/features/registry.js";
import { editor, posOf, select, typeText } from "./view-helpers.js";

/**
 * The optional commands reach the menus: a row asks for its command by the id it has in
 * COMMAND_FEATURES, so a page nobody asks never fetches a picker or an export and one module
 * arrives on the first pick. The insertable ones sit on the slash menu, the page's own
 * actions on the More menu.
 */

const SLASH = [["Mention", "mentions"], ["Date", "dates"], ["Emoji", "emoji"]];
const MORE = [["Page icon", "titleIcon"], ["Add cover", "titleCover"], ["Export reading copy", "exportHtml"]];

const originals = new Map();
const spies = {};
const installed = [];

beforeEach(() => {
  for (const [id, row] of Object.entries(COMMAND_FEATURES)) {
    originals.set(id, row.load);
    spies[id] = jest.fn(() => Promise.resolve({
      createFeature: () => {
        installed.push(id);
        return { run: () => ({ ok: true }), dispose() {} };
      },
    }));
    row.load = spies[id];
  }
});

afterEach(() => {
  for (const [id, load] of originals) COMMAND_FEATURES[id].load = load;
  originals.clear();
  for (const id of Object.keys(spies)) delete spies[id];
  installed.length = 0;
});

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((done) => setTimeout(done, 0)); };
const page = () => {
  const view = editor([["a", "paragraph", ""]]);
  select(view, posOf(view, "a"));
  return view;
};
const menu = (view) => view.dom.parentElement.querySelector(".page-menu");
const rows = (view) => [...menu(view).querySelectorAll(".page-menu-item")];
const row = (view, label) => rows(view).find((r) => r.querySelector(".page-menu-label").textContent === label);
const slash = (view, query) => { for (const ch of `/${query}`) typeText(view, ch); };
const more = (view) => view.dom.parentElement.querySelector(".page-dock .page-tool-more");

test("opening a page and both menus imports no command module", async () => {
  const view = page();
  slash(view, "");
  more(view).click();
  await flush();
  for (const id of Object.keys(COMMAND_FEATURES)) expect(spies[id]).not.toHaveBeenCalled();
  expect(installed).toEqual([]);
});

test("the slash menu lists the mention, date and emoji rows", () => {
  const view = page();
  slash(view, "");
  for (const [label] of SLASH) expect(row(view, label)).toBeTruthy();
});

test("the More menu lists the icon, cover and reading-copy rows", () => {
  const view = page();
  more(view).click();
  for (const [label] of MORE) expect(row(view, label)).toBeTruthy();
});

for (const [label, id] of SLASH) {
  test(`the slash menu's ${label} row runs the ${id} command and takes its typed query with it`, async () => {
    const view = page();
    slash(view, label.toLowerCase());
    expect(view.state.doc.textContent).toBe(`/${label.toLowerCase()}`);
    row(view, label).click();
    await flush();
    expect(spies[id]).toHaveBeenCalledTimes(1);
    expect(view.state.doc.textContent).toBe("");
  });
}

for (const [label, id] of MORE) {
  test(`the More menu's ${label} row runs the ${id} command`, async () => {
    const view = page();
    more(view).click();
    row(view, label).click();
    await flush();
    expect(spies[id]).toHaveBeenCalledTimes(1);
  });
}

test("choosing one entry twice imports its module and installs it once", async () => {
  const view = page();
  for (const _ of [1, 2]) {
    more(view).click();
    row(view, "Page icon").click();
    await flush();
  }
  expect(spies.titleIcon).toHaveBeenCalledTimes(1);
  expect(installed).toEqual(["titleIcon"]);
});

test("a command that refuses leaves the page and the menu as they were", async () => {
  const view = page();
  spies.exportHtml.mockImplementation(() => Promise.resolve({
    createFeature: () => { installed.push("exportHtml"); return { run: () => ({ ok: false, code: "not-editing" }), dispose() {} }; },
  }));
  more(view).click();
  row(view, "Export reading copy").click();
  await flush();
  expect(installed).toEqual(["exportHtml"]);
  expect(view.state.doc.textContent).toBe("");
  expect(menu(view).hidden).toBe(true);
});
