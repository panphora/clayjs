/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";
import { isTabLocalRootAttr } from "../../src/lib/root-attrs.js";

// Scenario: the host tells the owner's tab whether this site is served privately or
// publicly, by stamping the response's <html>. It is a statement about the RESPONSE,
// not about the file: the same bytes are private today and public tomorrow, and a peer
// tab's answer describes a response this tab never received. So it is read once, at
// import, and it belongs to the same tab-local set as the response etag.

const importServedSiteVisibility = async (value) => {
  if (value === null) {
    document.documentElement.removeAttribute("sitevisibility");
  } else {
    document.documentElement.setAttribute("sitevisibility", value);
  }
  jest.resetModules();
  const mod = await import("../../src/core/host-attrs.js");
  return mod.servedSiteVisibility;
};

test("the host's private answer is read from the root", async () => {
  expect(await importServedSiteVisibility("private")).toBe("private");
});

test("the host's public answer is read from the root", async () => {
  expect(await importServedSiteVisibility("public")).toBe("public");
});

test("a host that says nothing leaves it null", async () => {
  expect(await importServedSiteVisibility(null)).toBe(null);
});

test("an answer this library does not recognize leaves it null", async () => {
  expect(await importServedSiteVisibility("banana")).toBe(null);
});

test("the answer is captured once and survives a later change to the root", async () => {
  expect(await importServedSiteVisibility("private")).toBe("private");

  document.documentElement.setAttribute("sitevisibility", "public");

  expect((await import("../../src/core/host-attrs.js")).servedSiteVisibility).toBe("private");
});

test("the answer is stripped from the saved bytes and kept on the live root", async () => {
  window.clayEditMode = true;
  document.documentElement.setAttribute("sitevisibility", "private");
  document.body.innerHTML = '<div id="c">start</div>';

  const saveMod = await import("../../src/core/save.js");
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ msg: "Saved" }),
  }));
  document.getElementById("c").textContent = "changed";

  await saveMod.savePage();

  expect(global.fetch).toHaveBeenCalled();
  const body = global.fetch.mock.calls[0][1].body;
  const root = /<html\b[^>]*>/i.exec(body)[0];
  expect(root).toMatch(/^<html/i);
  expect(root).not.toContain("sitevisibility");

  expect(document.documentElement.getAttribute("sitevisibility")).toBe("private");
});

test("sitevisibility is a tab-local root attribute", () => {
  expect(isTabLocalRootAttr("sitevisibility", document.documentElement)).toBe(true);
});
