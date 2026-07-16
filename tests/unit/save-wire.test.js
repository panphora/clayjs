import { jest } from "@jest/globals";

// Scenario: with <html htmlclaytoken="abc">, the save must POST to
// /_/save/abc, carry the Page-URL + X-Hyperclay-User-Driven headers, and (on
// localhost) send the JSON envelope {content, snapshotHtml, userDriven} (§1.4).

test("save wire contract: token endpoint, headers, and localhost JSON envelope", async () => {
  window.clayEditMode = true;
  document.documentElement.setAttribute("htmlclaytoken", "abc");
  document.body.innerHTML = '<div id="content">start</div>';

  const saveMod = await import("../../src/core/save.js");

  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ msg: "Saved" }) }));
  document.getElementById("content").textContent = "wire-change";

  await saveMod.savePage();

  expect(global.fetch).toHaveBeenCalled();
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toBe("/_/save/abc");
  expect(opts.method).toBe("POST");
  expect(opts.headers["Page-URL"]).toBeDefined();
  expect(opts.headers["X-Hyperclay-User-Driven"]).toBeDefined();
  expect(opts.headers["Content-Type"]).toBe("application/json");

  const envelope = JSON.parse(opts.body);
  expect(envelope).toHaveProperty("content");
  expect(envelope).toHaveProperty("snapshotHtml");
  expect(envelope).toHaveProperty("userDriven");
  expect(envelope.content).toContain("wire-change");
});
