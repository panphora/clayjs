import { jest } from "@jest/globals";

// Scenario: clayjs's own root state must not reach disk. Four LOCAL_APPS documents
// carry savestatus="saved" in their stored bytes today, because the save path
// normalised the attribute instead of removing it.

test("the library's root attributes are stripped from the saved bytes", async () => {
  window.clayEditMode = true;
  document.documentElement.setAttribute("savestatus", "saving");
  document.documentElement.setAttribute("editmode", "true");
  document.documentElement.setAttribute("pageowner", "true");
  // The version stamp for the response this tab loaded. Writing it would freeze one
  // response's stamp into the file, where the next reader would read it as provenance
  // for bytes nobody built a response from.
  document.documentElement.setAttribute("documentetag", "response-stamp-abc123");
  // The author's own attributes, on a child: `option:savestatus` reads the first, and
  // the second is simply the author's. The same names away from the root are page
  // content and must survive.
  document.body.innerHTML =
    '<div id="c" savestatus="error" documentetag="child-owned">start</div>';

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
  expect(root).not.toContain("documentetag");
  expect(body).toContain('savestatus="error"');
  expect(body).toContain('documentetag="child-owned"');

  // The live page keeps them; only the saved copy loses them.
  expect(document.documentElement.hasAttribute("savestatus")).toBe(true);
  expect(document.documentElement.getAttribute("documentetag")).toBe("response-stamp-abc123");
});
