/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/page.html"}
 */
import { jest } from "@jest/globals";

// Scenario: no htmlclaytoken and a production (non-localhost) origin — the save
// must POST to the bare /_/save endpoint with the raw HTML body (no JSON
// envelope, no Content-Type override) and exact header values (§1.4).

test("save wire contract: bare endpoint and raw body on production origins", async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';

  const saveMod = await import("../../src/core/save.js");

  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ msg: "Saved" }) }));
  document.getElementById("content").textContent = "prod-wire-change";

  await saveMod.savePage();

  expect(global.fetch).toHaveBeenCalled();
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toBe("/_/save");
  expect(opts.method).toBe("POST");
  expect(opts.headers["Page-URL"]).toBe("https://example.com/page.html");
  expect(opts.headers["X-Hyperclay-User-Driven"]).toBe("0");
  expect(opts.headers["Content-Type"]).toBeUndefined();
  expect(typeof opts.body).toBe("string");
  expect(opts.body).toContain("prod-wire-change");
  expect(() => JSON.parse(opts.body)).toThrow();
});
