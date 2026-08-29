/**
 * @jest-environment-options {"url": "file:///tmp/exported-app.html"}
 *
 * Scenario: a document opened from disk, where there is no origin to pin to.
 *
 * The save URL is deliberately resolved against the real origin rather than left
 * relative, so an authored <base href> cannot redirect a save and the token in its
 * path to an origin the document chose. That pin has a sharp edge:
 * `window.location.origin` is the STRING "null" on a file:// document, not the
 * value null, and `new URL(path, "null")` raises. The URL is built before fetch
 * and outside the promise chain, so an unguarded pin throws synchronously out of
 * the save rather than becoming a failed one.
 *
 * Downloading an app as a standalone HTML file is a headline feature, so a
 * document running from disk is ordinary rather than exotic. There is no origin to
 * pin to and no host to save to there, which is why falling back to the relative
 * path is the honest answer and not a workaround.
 */

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  document.documentElement.removeAttribute("savetoken");
});

// The precondition. If this stops holding, everything below would pass against an
// unguarded pin and prove nothing.
test("a file:// document reports the string \"null\" as its origin", () => {
  expect(window.location.origin).toBe("null");
  expect(() => new URL("/_/save/TOK", window.location.origin)).toThrow();
});

test("a token save resolves instead of throwing, and keeps the relative path", async () => {
  document.documentElement.setAttribute("savetoken", "TOK");
  const calls = [];
  globalThis.fetch = (url, options) => {
    calls.push(url);
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ msg: "Saved", msgType: "success" })),
    });
  };

  const { saveHtml } = await import("../../src/core/save-core.js");

  await expect(saveHtml("<html>from disk</html>")).resolves.toBeDefined();
  expect(calls[0]).toBe("/_/save/TOK");
});

test("a tokenless save resolves instead of throwing", async () => {
  const calls = [];
  globalThis.fetch = (url) => {
    calls.push(url);
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ msg: "Saved", msgType: "success" })),
    });
  };

  const { saveHtml } = await import("../../src/core/save-core.js");

  await expect(saveHtml("<html>from disk</html>")).resolves.toBeDefined();
  expect(calls[0]).toBe("/_/save");
});
