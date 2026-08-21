import { jest } from "@jest/globals";

// Scenario: with a save token on the root, the save must POST to /_/save/{token},
// carry the Document-URL + Page-URL + Save-Trigger headers, ask for no cookies,
// and send the document as the raw body (§1.4).
//
// The root also carries the attribute a host once used to ask for a JSON envelope
// on this lane. Spec §3 gives /_/save exactly one body shape, so it buys nothing
// now: the assertion below is what keeps it that way.

test("save wire contract: token endpoint, headers, and a text body", async () => {
  window.clayEditMode = true;
  document.documentElement.setAttribute("htmlclaytoken", "abc");
  document.documentElement.setAttribute("clay-save-transport", "desktop-json-v1");
  document.body.innerHTML = '<div id="content">start</div>';

  const saveMod = await import("../../src/core/save.js");

  global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));
  document.getElementById("content").textContent = "wire-change";

  await saveMod.savePage();

  expect(global.fetch).toHaveBeenCalled();
  const [url, opts] = global.fetch.mock.calls[0];
  // Absolute against the document's real origin, so a <base href> in the page
  // cannot redirect the save — and the token in its path — somewhere else.
  expect(url).toBe(new URL("/_/save/abc", window.location.origin).href);
  expect(new URL(url).pathname).toBe("/_/save/abc");
  expect(opts.method).toBe("POST");
  expect(opts.headers["Document-URL"]).toBeDefined();
  expect(opts.headers["Page-URL"]).toBeDefined();
  expect(opts.headers["Save-Trigger"]).toBe("auto");
  expect(opts.headers["X-Hyperclay-User-Driven"]).toBeUndefined();
  // The token IS the credential. Asking for cookies as well needs
  // Access-Control-Allow-Credentials back, which a token-minting host must never
  // send, so the browser would block the save before it left.
  expect(opts.credentials).toBe("omit");

  // One body shape: the document, as text. Not JSON, and no Content-Type that
  // would make it a preflighted request.
  expect(opts.headers["Content-Type"]).toBeUndefined();
  expect(typeof opts.body).toBe("string");
  expect(opts.body).toContain("wire-change");
  expect(() => JSON.parse(opts.body)).toThrow();
});
