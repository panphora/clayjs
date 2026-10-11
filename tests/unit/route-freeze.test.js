import { jest } from "@jest/globals";

// save-freeze records each region's authored innerHTML when the module loads, so
// the stamp has to be on the live DOM before the import runs.
test("a freeze region captured after the router stamped it saves no route-active", async () => {
  window.clayEditMode = true;
  document.body.innerHTML =
    '<nav clay="freeze" route="entry"><a data-id="e-1" route-active="entry">one</a><a data-id="e-2">two</a></nav>' +
    '<p id="edit">start</p>';
  await import("../../src/attrs/save-freeze.js");
  const saveMod = await import("../../src/core/save.js");
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));

  document.querySelector('[data-id="e-1"]').removeAttribute("route-active");
  document.querySelector('[data-id="e-2"]').setAttribute("route-active", "entry");
  document.getElementById("edit").textContent = "changed";
  await saveMod.savePage();

  const body = global.fetch.mock.calls[0][1].body;
  const saved = new DOMParser().parseFromString(body, "text/html");
  expect(saved.querySelector("[route-active]")).toBeNull();
  expect(saved.querySelectorAll("nav > a")).toHaveLength(2);
  expect(body).toContain("changed");
});
