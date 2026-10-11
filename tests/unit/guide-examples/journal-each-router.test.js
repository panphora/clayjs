import { loadExample, peer, saves, tick } from "./helpers.js";

const FIXTURE = "../../tests/unit/guide-examples/fixtures/journal.html";
let clay;
const rows = () => [...document.querySelectorAll("#index > a.row")];
const titles = () => rows().map((r) => r.textContent);
const typeInto = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

beforeAll(async () => {
  history.replaceState(null, "", "/journal.html#entry=e-1");
  clay = await loadExample(FIXTURE);
  await clay.loaded.sap;
  await clay.loaded.router;
  await tick(50);
}, 15000);

test("opens clean, with the index projected and the hash's entry open", () => {
  expect(window.Sap.status().ok).toBe(true);
  expect(titles()).toEqual(["Second", "First"]);
  expect(rows().map((r) => r.getAttribute("href"))).toEqual(["#entry=e-2", "#entry=e-1"]);
  expect(document.documentElement.getAttribute("route-entry")).toBe("e-1");
  expect(document.querySelector('#entries [data-id="e-1"]').getAttribute("route-active")).toBe("entry");
  expect(document.querySelector('#index [data-key="e-1"]').getAttribute("route-active")).toBe("entry");
  expect(clay.hasUnsavedChanges()).toBe(false);
});

test("navigating and searching never mark the page unsaved", async () => {
  clay.route.set({ entry: "e-2" });
  await tick(20);
  expect(document.querySelector('#entries [data-id="e-2"]').getAttribute("route-active")).toBe("entry");
  expect(document.querySelector('#entries [data-id="e-1"]').hasAttribute("route-active")).toBe(false);

  const q = document.querySelector("#q");
  typeInto(q, "two");
  await tick(20);
  expect(titles()).toEqual(["Second"]);
  typeInto(q, "");
  await tick(20);
  expect(titles()).toEqual(["Second", "First"]);
  expect(clay.hasUnsavedChanges()).toBe(false);
});

test("editing an entry saves the entry and none of the index rows or router state", async () => {
  typeInto(document.querySelector('#entries [data-id="e-1"] textarea'), "# First, edited\none");
  await tick(20);
  expect(titles()).toEqual(["Second", "First, edited"]);
  expect(clay.hasUnsavedChanges()).toBe(true);

  await clay.save();
  const body = saves.at(-1);
  expect(body).toContain("First, edited");
  expect(body).not.toContain("data-key=");
  expect(body).not.toContain("route-entry");
  const saved = new DOMParser().parseFromString(body, "text/html");
  expect(saved.querySelector("[route-active]")).toBeNull();
  expect(saved.querySelectorAll("#index > a").length).toBe(0);
  expect(saved.querySelector("#index > template")).not.toBeNull();
  expect(saved.querySelector('header[clay="freeze"] h1').textContent).toBe("Journal");
  expect(clay.hasUnsavedChanges()).toBe(false);
});

test("a peer's new entry appears in the index and leaves this tab clean", async () => {
  const p = await peer();
  const doc = new DOMParser().parseFromString(p.base, "text/html");
  const a = doc.createElement("article");
  a.className = "entry";
  a.setAttribute("item", "");
  a.setAttribute("data-id", "e-3");
  a.setAttribute("state", "data-date");
  a.setAttribute("data-date", "2026-10-05");
  a.innerHTML = '<textarea bind="body" persist># Third\nthree</textarea>';
  doc.querySelector("#entries").appendChild(a);

  await p.apply("<!DOCTYPE html>" + doc.documentElement.outerHTML);
  await tick(50);
  expect(titles()).toEqual(["Third", "Second", "First, edited"]);
  expect(document.querySelectorAll("#index > a.row").length).toBe(3);
  expect(clay.hasUnsavedChanges()).toBe(false);

  clay.route.set({ entry: "e-3" });
  await tick(20);
  expect(document.querySelector('#entries [data-id="e-3"]').getAttribute("route-active")).toBe("entry");
  expect(document.querySelector('#index [data-key="e-3"]').getAttribute("route-active")).toBe("entry");
  expect(clay.hasUnsavedChanges()).toBe(false);
  p.stop();
});
