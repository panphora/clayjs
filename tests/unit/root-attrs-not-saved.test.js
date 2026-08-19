import { jest } from "@jest/globals";

// Scenario: clayjs's own root state must not reach disk. Four LOCAL_APPS documents
// carry savestatus="saved" in their stored bytes today, because the save path
// normalised the attribute instead of removing it.

test("the library's root attributes are stripped from the saved bytes", async () => {
  window.clayEditMode = true;
  document.documentElement.setAttribute("savestatus", "saving");
  document.documentElement.setAttribute("editmode", "true");
  document.documentElement.setAttribute("pageowner", "true");
  // The author's own attribute, on a child, which `option:savestatus` reads. The
  // same name away from the root is page content and must survive.
  document.body.innerHTML = '<div id="c" savestatus="error">start</div>';

  const saveMod = await import("../../src/core/save.js");
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));
  document.getElementById("c").textContent = "changed";

  await saveMod.savePage();

  expect(global.fetch).toHaveBeenCalled();
  const body = global.fetch.mock.calls[0][1].body;
  // The opening <html> tag, not the doctype in front of it: slicing to the first
  // ">" finds the end of "<!DOCTYPE html>" and asserts nothing at all.
  const root = /<html\b[^>]*>/i.exec(body)[0];
  expect(root).toMatch(/^<html/i);
  expect(root).not.toContain("savestatus");
  expect(root).not.toContain("editmode");
  expect(root).not.toContain("pageowner");
  expect(body).toContain('savestatus="error"');

  // The live page keeps them; only the saved copy loses them.
  expect(document.documentElement.hasAttribute("savestatus")).toBe(true);
});
