/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/page.html"}
 */
import { jest } from "@jest/globals";

// Scenario: no save token and no declared transport — the save must POST to the
// bare /_/save endpoint with the raw HTML body (no JSON envelope, no Content-Type
// override), exact header values, and the cookie that authenticates it (§1.4).

test("save wire contract: bare endpoint and raw body on a cookie host", async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';

  const saveMod = await import("../../src/core/save.js");

  global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));
  document.getElementById("content").textContent = "prod-wire-change";

  await saveMod.savePage();

  expect(global.fetch).toHaveBeenCalled();
  const [url, opts] = global.fetch.mock.calls[0];
  // Absolute against the document's real origin, so a <base href> in the page
  // cannot redirect the save somewhere else.
  expect(url).toBe("https://example.com/_/save");
  expect(opts.method).toBe("POST");
  expect(opts.credentials).toBe("same-origin");
  expect(opts.headers["Document-URL"]).toBe("https://example.com/page.html");
  expect(opts.headers["Page-URL"]).toBe("https://example.com/page.html");
  expect(opts.headers["X-Hyperclay-User-Driven"]).toBe("0");
  expect(opts.headers["Content-Type"]).toBeUndefined();
  expect(typeof opts.body).toBe("string");
  expect(opts.body).toContain("prod-wire-change");
  expect(() => JSON.parse(opts.body)).toThrow();
});
