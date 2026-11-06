import { jest } from "@jest/globals";
import { createShell } from "../../src/plugins/menu/shell.js";
import { attachDomItems } from "../../src/plugins/menu/dom-items.js";

// Scenario: a document marks an element with clay-menu-item and it becomes a row in the
// gear menu. An element that offers an x removes itself on that press and saves, so the
// removal is in the file and not just on this screen. The row stays until the removal
// succeeds: a refusal or a failure keeps it and says so.

const ITEM =
  '<a data-id="appreciation" clay-menu-item clay-menu-section="end" clay-menu-quiet clay-menu-dismiss="Remove" href="mailto:creator@example.com?subject=Hi">Send an appreciation email</a>';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const page = (inner = ITEM) => {
  document.body.innerHTML = `<div id="items">${inner}</div>`;
};

const menu = () => {
  const shell = createShell({ sections: [null] });
  attachDomItems(shell);
  return shell;
};

const rowOf = (shell, id) => shell.list.querySelector(`[data-menu-id="${id}"]`);
const xOf = (shell, id) => shell.list.querySelector(`[data-menu-id="${id}.dismiss"]`);
const noteOf = (shell) => shell.root.querySelector(".clay-menu-note");
const idsOf = (shell) => [...shell.list.children].map((node) => node.dataset.menuId).filter(Boolean);

beforeEach(() => {
  document.body.innerHTML = "";
  window.clay = { mode: "edit" };
});

test("a marked element becomes a quiet link row in the last section, with its x", () => {
  page();
  const shell = createShell({ sections: [null] });
  shell.addItem({ id: "doc.first", label: "First" });
  attachDomItems(shell);

  expect(idsOf(shell)).toEqual(["doc.first", "dom.appreciation"]);
  const row = shell.list.querySelector('a[data-menu-id="dom.appreciation"]');
  expect(row).not.toBeNull();
  expect(row.textContent).toBe("Send an appreciation email");
  expect(row.getAttribute("href")).toBe("mailto:creator@example.com?subject=Hi");
  expect(row.getAttribute("part")).toBe("item quiet");
  const x = xOf(shell, "dom.appreciation");
  expect(x.getAttribute("aria-label")).toBe("Remove");
});

test("a cms-template row produces no item", () => {
  page(ITEM.replace(' data-id="appreciation"', ' cms-template data-id="seed"'));
  const added = [];
  attachDomItems({ addItem: (item) => added.push(item), removeItem: () => {}, beforeOpen: [] });

  expect(added).toEqual([]);
});

test("the x removes the element, commits it as an undo step and saves", async () => {
  const soon = jest.fn();
  const commit = jest.fn((label, fn) => fn());
  window.clay = { mode: "edit", save: { soon }, undo: { commit } };
  page();
  const shell = menu();

  const el = document.querySelector("#items a");
  expect(el.isConnected).toBe(true);
  expect(rowOf(shell, "dom.appreciation")).not.toBeNull();

  xOf(shell, "dom.appreciation").click();
  await flush();

  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0]).toBe("Remove this item");
  expect(el.isConnected).toBe(false);
  expect(soon).toHaveBeenCalledTimes(1);
  expect(rowOf(shell, "dom.appreciation")).toBeNull();
});

test("the x removes the element on a page with no undo", async () => {
  const soon = jest.fn();
  window.clay = { mode: "edit", save: { soon } };
  page();
  const shell = menu();

  const el = document.querySelector("#items a");
  expect(el.isConnected).toBe(true);
  expect(rowOf(shell, "dom.appreciation")).not.toBeNull();

  xOf(shell, "dom.appreciation").click();
  await flush();

  expect(el.isConnected).toBe(false);
  expect(soon).toHaveBeenCalledTimes(1);
});

test("a view-mode owner gets no x, and a mode change brings it", () => {
  window.clay = { mode: "view" };
  page();
  const shell = menu();

  expect(rowOf(shell, "dom.appreciation")).not.toBeNull();
  expect(xOf(shell, "dom.appreciation")).toBeNull();

  window.clay.mode = "edit";
  document.dispatchEvent(new CustomEvent("clay:modechange"));

  expect(rowOf(shell, "dom.appreciation")).not.toBeNull();
  expect(xOf(shell, "dom.appreciation")).not.toBeNull();
});

test("an element a merge removed leaves the menu on the next sync", () => {
  page();
  const shell = menu();
  expect(rowOf(shell, "dom.appreciation")).not.toBeNull();

  document.querySelector("#items a").remove();
  document.dispatchEvent(new CustomEvent("clay:sync-applied"));

  expect(rowOf(shell, "dom.appreciation")).toBeNull();
});

test("an item with no href runs the element's own click", () => {
  page('<button data-id="go" clay-menu-item type="button">Run me</button>');
  const shell = menu();
  const el = document.querySelector("#items button");
  const clicked = jest.fn();
  el.addEventListener("click", clicked);

  expect(rowOf(shell, "dom.go")).not.toBeNull();
  rowOf(shell, "dom.go").click();

  expect(clicked).toHaveBeenCalledTimes(1);
});

test("an element with no id is skipped, and warned about once per scan", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  page('<a clay-menu-item href="#">No id here</a>');
  const added = [];
  const beforeOpen = [];
  attachDomItems({ addItem: (item) => added.push(item), removeItem: () => {}, beforeOpen });

  expect(added).toEqual([]);
  expect(warn).toHaveBeenCalledTimes(1);

  beforeOpen[0]();

  expect(added).toEqual([]);
  expect(warn).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});

test("a callback that returns false keeps the row and re-enables the x", async () => {
  page();
  const shell = menu();
  shell.addItem({ id: "kept", label: "Kept", dismiss: { label: "Remove", run: () => false } });

  const x = xOf(shell, "kept");
  expect(rowOf(shell, "kept")).not.toBeNull();
  expect(x.disabled).toBe(false);

  x.click();
  await flush();

  expect(rowOf(shell, "kept")).not.toBeNull();
  expect(xOf(shell, "kept")).toBe(x);
  expect(x.disabled).toBe(false);
});

test("a callback that rejects keeps the row and shows the note", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  page();
  const shell = menu();
  shell.addItem({
    id: "kept",
    label: "Kept",
    dismiss: {
      label: "Remove",
      run: async () => {
        throw new Error("nope");
      },
    },
  });

  const x = xOf(shell, "kept");
  expect(rowOf(shell, "kept")).not.toBeNull();

  x.click();
  await flush();

  expect(rowOf(shell, "kept")).not.toBeNull();
  expect(x.disabled).toBe(false);
  expect(noteOf(shell).hidden).toBe(false);
  expect(noteOf(shell).textContent).toBe("That didn't work. Try again.");
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test("a callback that returns nothing removes the row, as it does today", async () => {
  page();
  const shell = menu();
  shell.addItem({ id: "plain", label: "Plain", dismiss: { label: "Remove", run: () => {} } });

  expect(rowOf(shell, "plain")).not.toBeNull();

  xOf(shell, "plain").click();
  await flush();

  expect(rowOf(shell, "plain")).toBeNull();
});

test("a press before clay.ready resolves waits, then removes", async () => {
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  const soon = jest.fn();
  window.clay = { mode: "edit", ready, save: { soon } };
  page();
  const shell = menu();

  const el = document.querySelector("#items a");
  expect(el.isConnected).toBe(true);
  expect(rowOf(shell, "dom.appreciation")).not.toBeNull();

  xOf(shell, "dom.appreciation").click();
  await flush();

  expect(el.isConnected).toBe(true);
  expect(rowOf(shell, "dom.appreciation")).not.toBeNull();
  expect(soon).not.toHaveBeenCalled();

  release();
  await flush();

  expect(el.isConnected).toBe(false);
  expect(soon).toHaveBeenCalledTimes(1);
  expect(rowOf(shell, "dom.appreciation")).toBeNull();
});
