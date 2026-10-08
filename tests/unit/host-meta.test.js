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

// The document block is the one part of the answer that changes under a loaded
// page: its etag ticks on every save, by anyone. A caller that needs a current one
// asks for a fresh answer, and that answer becomes the memoized one.
test("fresh asks again, and what comes back replaces the memoized answer", async () => {
  const { hostMeta } = await freshMeta();
  let etag = "a1";
  global.fetch = jest.fn(async () => ok({ spec: 1, extensions: ["conditional"], document: { etag } }));

  expect((await hostMeta()).document.etag).toBe("a1");
  expect((await hostMeta()).document.etag).toBe("a1");
  expect(global.fetch).toHaveBeenCalledTimes(1);

  etag = "b2";
  expect((await hostMeta({ fresh: true })).document.etag).toBe("b2");
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect((await hostMeta()).document.etag).toBe("b2");
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test("two fresh callers at once make one request", async () => {
  const { hostMeta } = await freshMeta();
  global.fetch = jest.fn(async () => ok({ spec: 1, extensions: [], document: { etag: "c3" } }));

  await Promise.all([hostMeta({ fresh: true }), hostMeta({ fresh: true })]);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("hostSupports answers only from the announced list", async () => {
  const { hostSupports } = await freshMeta();
  global.fetch = jest.fn(async () => ok({ spec: 1, extensions: ["format"] }));

  expect(await hostSupports("format")).toBe(true);
  expect(await hostSupports("upload")).toBe(false);
});

// The outcome rides beside the answer, not on it, so the answer\'s shape is the same
// whatever happened. Save and upload can treat "none" and "failed" alike; people
// cannot, because a host that failed to say who you are has not said you are nobody.
describe("hostMetaOutcome names how the discovery ended", () => {
  test("a capability document is ok", async () => {
    const { hostMeta, hostMetaOutcome } = await freshMeta();
    global.fetch = jest.fn(async () => ok({ spec: 1, extensions: ["people"] }));

    expect(hostMetaOutcome(await hostMeta())).toBe("ok");
  });

  test("a 404 is none: this host offers no discovery", async () => {
    const { hostMeta, hostMetaOutcome } = await freshMeta();
    global.fetch = jest.fn(async () => ({ ok: false, status: 404 }));

    expect(hostMetaOutcome(await hostMeta())).toBe("none");
  });

  test("a 503 is failed: a host that should have answered did not", async () => {
    const { hostMeta, hostMetaOutcome } = await freshMeta();
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 }));

    expect(hostMetaOutcome(await hostMeta())).toBe("failed");
  });

  test("a network failure is failed", async () => {
    const { hostMeta, hostMetaOutcome } = await freshMeta();
    global.fetch = jest.fn(async () => { throw new TypeError("network"); });

    expect(hostMetaOutcome(await hostMeta())).toBe("failed");
  });

  test("a 2xx that is not JSON is none", async () => {
    const { hostMeta, hostMetaOutcome } = await freshMeta();
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => "<html>" }));

    expect(hostMetaOutcome(await hostMeta())).toBe("none");
  });

  test("an object this module never produced is none", async () => {
    const { hostMetaOutcome } = await freshMeta();

    expect(hostMetaOutcome({})).toBe("none");
  });
});

// A refresh that fails is a blip (a deploy, a proxy), not news that the host forgot
// its capabilities: the page keeps the last good answer. But an answer that was
// already bare stays bare, so a failure never invents a capability.
test("a failed fresh answer keeps the page's last good answer", async () => {
  const { hostMeta } = await freshMeta();
  let calls = 0;
  global.fetch = jest.fn(async () => {
    calls += 1;
    return calls > 1 ? { ok: false, status: 502 } : ok({ spec: 1, extensions: ["upload"] });
  });

  expect((await hostMeta()).extensions).toEqual(["upload"]);

  const fresh = await hostMeta({ fresh: true });
  expect(fresh.extensions).toEqual([]);
  expect((await hostMeta()).extensions).toEqual(["upload"]);

  const bare = await freshMeta();
  let bareCalls = 0;
  global.fetch = jest.fn(async () => {
    bareCalls += 1;
    return bareCalls > 1 ? { ok: false, status: 502 } : { ok: false, status: 404 };
  });

  expect((await bare.hostMeta()).extensions).toEqual([]);
  expect((await bare.hostMeta({ fresh: true })).extensions).toEqual([]);
  expect((await bare.hostMeta()).extensions).toEqual([]);
});
