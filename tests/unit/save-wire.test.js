import { jest } from "@jest/globals";

// Scenario: with a save token on the root, the save must POST to /_/save/{token},
// carry the Document-URL + Page-URL + X-Hyperclay-User-Driven headers, ask for no
// cookies, and send the JSON envelope {content, snapshotHtml, userDriven} when the
// document declares the desktop transport (§1.4).

test("save wire contract: token endpoint, headers, and declared JSON envelope", async () => {
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
  expect(opts.headers["X-Hyperclay-User-Driven"]).toBeDefined();
  expect(opts.headers["Content-Type"]).toBe("application/json");
  // The token IS the credential. Asking for cookies as well needs
  // Access-Control-Allow-Credentials back, which a token-minting host must never
  // send, so the browser would block the save before it left.
  expect(opts.credentials).toBe("omit");

  const envelope = JSON.parse(opts.body);
  expect(envelope).toHaveProperty("content");
  expect(envelope).toHaveProperty("snapshotHtml");
  expect(envelope).toHaveProperty("userDriven");
  expect(envelope.content).toContain("wire-change");
});
