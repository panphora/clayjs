import { jest } from "@jest/globals";

// Scenario: spec §5 discovery. Strict about what counts as an answer, forgiving
// about what to do without one, and asked at most once per page.

async function freshMeta() {
  jest.resetModules();
  return import("../../src/core/host-meta.js");
}

const ok = (body) => ({ ok: true, text: async () => JSON.stringify(body) });

beforeEach(() => {
  document.documentElement.removeAttribute("savetoken");
  document.documentElement.removeAttribute("htmlclaytoken");
});

test("reads spec, extensions and the document block", async () => {
  const { hostMeta } = await freshMeta();
  global.fetch = jest.fn(async () => ok({
    spec: 1,
    extensions: ["conditional", "upload"],
    document: { etag: "a1", upload: { allowed: true, maxBytes: 500 } }
  }));

  const meta = await hostMeta();
  expect(meta.spec).toBe(1);
  expect(meta.extensions).toEqual(["conditional", "upload"]);
  expect(meta.document.upload.maxBytes).toBe(500);
});

test("asks once per page even when several callers race", async () => {
  const { hostMeta } = await freshMeta();
  global.fetch = jest.fn(async () => ok({ spec: 1, extensions: [] }));

  await Promise.all([hostMeta(), hostMeta(), hostMeta()]);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("carries the save token in the path, and asks for no cookies", async () => {
  document.documentElement.setAttribute("savetoken", "tok123");
  const { hostMeta } = await freshMeta();
  global.fetch = jest.fn(async () => ok({ spec: 1, extensions: [] }));

  await hostMeta();
  const [url, opts] = global.fetch.mock.calls[0];
  // A sandboxed document holds no cookie, so the token is the only identity it
  // has, and the answer about ITSELF is only reachable through the token route.
  expect(new URL(url).pathname).toBe("/_/meta/tok123");
  expect(url).toBe(new URL("/_/meta/tok123", window.location.origin).href);
  expect(opts.credentials).toBe("omit");
});

test("without a token it uses the bare route and same-origin credentials", async () => {
  const { hostMeta } = await freshMeta();
  global.fetch = jest.fn(async () => ok({ spec: 1, extensions: [] }));

  await hostMeta();
  const [url, opts] = global.fetch.mock.calls[0];
  expect(new URL(url).pathname).toBe("/_/meta");
  expect(opts.credentials).toBe("same-origin");
  expect(opts.headers["Document-URL"]).toBe(window.location.href);
});

// Everything below is the same outcome by a different route: a bare core host,
// which is fully conforming. Discovery failing must never cost a person a save.
describe("anything that is not a capability document reads as a bare host", () => {
  const cases = {
    "a 404": async () => ({ ok: false, status: 404, text: async () => "" }),
    "an HTML error page from a proxy": async () => ({ ok: true, text: async () => "<html>502</html>" }),
    "a 2xx with no spec field": async () => ok({ extensions: ["upload"] }),
    "a spec that is not a number": async () => ok({ spec: "1", extensions: ["upload"] }),
    "an empty body": async () => ({ ok: true, text: async () => "" }),
    "a network failure": async () => { throw new TypeError("Failed to fetch"); },
  };

  for (const [name, impl] of Object.entries(cases)) {
    test(name, async () => {
      const { hostMeta } = await freshMeta();
      global.fetch = jest.fn(impl);
      const meta = await hostMeta();
      expect(meta).toEqual({ spec: null, extensions: [], document: null });
    });
  }
});

test("hostSupports answers only from the announced list", async () => {
  const { hostSupports } = await freshMeta();
  global.fetch = jest.fn(async () => ok({ spec: 1, extensions: ["format"] }));

  expect(await hostSupports("format")).toBe(true);
  expect(await hostSupports("upload")).toBe(false);
});
