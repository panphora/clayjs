import { jest } from "@jest/globals";
import { editor } from "./view-helpers.js";

/**
 * The document settings gear and its panel: two switches over the page's own
 * settings API, the way the document surface reads them.
 */

afterEach(() => {
  document.body.innerHTML = "";
  delete window.clay;
});

const DOC = [["a", "paragraph", "First"], ["b", "paragraph", "Second"]];

const dock = (view) => view.dom.parentElement.querySelector(".page-dock");
const panel = (view) => view.dom.parentElement.querySelector(".page-settings");
const gear = (view) => dock(view).querySelector(".page-tool-settings");
const switches = (view) => [...panel(view).querySelectorAll('[role="switch"]')];
const frame = () => new Promise((done) => window.requestAnimationFrame(() => done()));

const install = (overrides = {}) => {
  const settings = {
    read: jest.fn(() => ({ assignees: true, dates: true })),
    set: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
  window.clay = { page: { settings } };
  return settings;
};

const withPhone = async (run) => {
  const media = window.matchMedia;
  window.matchMedia = (query) => ({ matches: query === "(max-width: 560px)", media: query, addEventListener() {}, removeEventListener() {} });
  try {
    return await run();
  } finally {
    window.matchMedia = media;
  }
};

test("the gear opens the panel with both switches on, read from the page", async () => {
  const settings = install();
  const view = editor(DOC);
  gear(view).click();
  await frame();
  expect(panel(view).hidden).toBe(false);
  expect(gear(view).getAttribute("aria-expanded")).toBe("true");
  expect(panel(view).getAttribute("role")).toBe("dialog");
  expect(panel(view).querySelector(".page-settings-title").textContent).toBe("Document settings");
  expect(switches(view).map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "true"]);
  expect(switches(view).map((s) => panel(view).querySelector(`#${s.getAttribute("aria-labelledby")}`).textContent))
    .toEqual(["Checklist assignees", "Checklist due dates"]);
  expect(settings.read).toHaveBeenCalled();
});

test("clicking Checklist assignees writes false, and the switch shows it", async () => {
  const settings = install();
  const view = editor(DOC);
  gear(view).click();
  const [assignees] = switches(view);
  assignees.click();
  await Promise.resolve();
  await Promise.resolve();
  expect(settings.set).toHaveBeenCalledWith("assignees", false);
  expect(assignees.getAttribute("aria-checked")).toBe("false");
});

test("a rejected set puts the switch back", async () => {
  install({ set: jest.fn(() => Promise.reject(new Error("offline"))) });
  const view = editor(DOC);
  gear(view).click();
  const dates = switches(view)[1];
  dates.click();
  expect(dates.getAttribute("aria-checked")).toBe("false");
  await new Promise((done) => setTimeout(done, 0));
  expect(dates.getAttribute("aria-checked")).toBe("true");
});

test("Escape closes the panel and gives focus back to the gear", () => {
  install();
  const view = editor(DOC);
  gear(view).click();
  expect(document.activeElement).toBe(panel(view).querySelector(".page-settings-close"));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(panel(view).hidden).toBe(true);
  expect(gear(view).getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(gear(view));
});

test("a press outside closes the panel", () => {
  install();
  const view = editor(DOC);
  gear(view).click();
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  expect(panel(view).hidden).toBe(true);
});

test("on a phone the More menu carries Document settings and opens the same panel", async () => {
  install();
  await withPhone(async () => {
    const view = editor(DOC);
    const bar = dock(view);
    expect([...bar.querySelectorAll(".page-tool-primary")].map((b) => b.dataset.cmd ?? "more")).toEqual(["strong", "em", "link", "more"]);
    bar.querySelector(".page-tool-more").click();
    const menu = view.dom.parentElement.querySelector(".page-menu");
    const row = [...menu.querySelectorAll(".page-menu-item")].find((r) => r.querySelector(".page-menu-label").textContent === "Document settings");
    expect(row).toBeTruthy();
    row.click();
    await frame();
    expect(panel(view).hidden).toBe(false);
    expect(switches(view).length).toBe(2);
  });
});

test("a page facade published after the toolbar is built still shows the gear", async () => {
  window.clay = {};
  const view = editor(DOC);
  expect(gear(view).hidden).toBe(true);
  install();
  view.dispatch(view.state.tr.insertText("x", 1));
  expect(gear(view).hidden).toBe(false);
});
