import { jest } from "@jest/globals";

/**
 * The wire carries the document's save token on both legs.
 *
 * A helper-bound channel is the one place "one wire per file" has to be
 * isolation rather than addressing. A page names only its own URL, and the host
 * resolves that through the funnel the save route uses, which admits any
 * registered path on the origin. Without the token, another document's page on
 * the same loopback origin could subscribe to this file's channel and push
 * requests that run this file's helpers. The host refuses a tokenless caller on
 * a bound file with 403, on subscribe and on send alike, so a client that omits
 * it cannot use helpers at all.
 *
 * This file is separate from wire.test.js because that one deliberately runs
 * with no save token, which is the view-mode path.
 */

let wire;
let sockets;

class FakeEventSource {
  constructor(url) {
    this.url = url;
    sockets.push(this);
    Promise.resolve().then(() => this.onopen && this.onopen());
  }
  close() {}
}

const settle = () => jest.advanceTimersByTimeAsync(1);

beforeAll(async () => {
  sockets = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ wire } = await import("../../src/plugins/wire.js"));
});

beforeEach(() => {
  jest.useFakeTimers();
  sockets = [];
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ delivered: 1 }) }));
});

afterEach(async () => {
  for (const rec of wire.list()) wire.cancel(rec.id);
  await settle();
  jest.useRealTimers();
  document.documentElement.removeAttribute("savetoken");
});

test("the subscribe URL and the send headers both carry the save token", async () => {
  document.documentElement.setAttribute("savetoken", "tok-abc123");
  wire.send({ area: "intro" }, { id: "r1" });
  await settle();

  // In the query on subscribe, because native EventSource takes no custom
  // headers, and in a header on send, because fetch can carry one.
  const url = new URL(sockets[0].url);
  expect(url.pathname).toBe("/_/wire/subscribe");
  expect(url.searchParams.get("token")).toBe("tok-abc123");

  const [, init] = global.fetch.mock.calls[0];
  expect(init.headers["Save-Token"]).toBe("tok-abc123");
});

test("a response carrying no save token sends none, rather than an empty one", async () => {
  wire.send({ area: "intro" }, { id: "r2" });
  await settle();

  // An unbound file ignores the token, and a page served without one must not
  // start claiming the empty string as a credential.
  const url = new URL(sockets[0].url);
  expect(url.searchParams.get("token")).toBeNull();
  const [, init] = global.fetch.mock.calls[0];
  expect(init.headers["Save-Token"]).toBeUndefined();
});
