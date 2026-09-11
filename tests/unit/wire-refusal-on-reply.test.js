import { jest } from "@jest/globals";

/**
 * A refused named request must report the host's reason, not "no agent".
 *
 * When the attached handler is a raw one, the host refuses a named request with
 * `helper_protocol_unsupported`. It sends that refusal twice, on the POST reply
 * and down the stream, because the two are separate connections with no ordering
 * between them. Settling on the reply's `delivered: 0` first threw the typed
 * frame away and told the page nobody was attached, which is both wrong and
 * unactionable: the fix is to change the handler, not to start one.
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
});

afterEach(async () => {
  for (const rec of wire.list()) wire.cancel(rec.id);
  await settle();
  jest.useRealTimers();
});

test("a typed refusal on the reply is reported instead of no-agent", async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      delivered: 0,
      observers: 1,
      refused: {
        source: "host",
        code: "helper_protocol_unsupported",
        message: "this handler does not support named helpers",
      },
    }),
  }));

  // Unnamed on purpose: the branch under test is how the reply is read, and a
  // named request would stop at the host-capability check first, which jsdom
  // cannot satisfy. The host only ever sends "refused" for a named request; the
  // Go side pins that half.
  const handle = wire.send({}, { id: "r1" });
  await settle();
  const outcome = await handle.done;

  expect(outcome.errorCode).toBe("helper_protocol_unsupported");
  expect(outcome.errorSource).toBe("host");
  expect(outcome.error).toBe("this handler does not support named helpers");
});

test("a reply with no refusal still reports that nobody is attached", async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, delivered: 0, observers: 0 }),
  }));

  const handle = wire.send({}, { id: "r2" });
  await settle();
  const outcome = await handle.done;

  expect(outcome.error).toBe("no agent is attached to this file");
  expect(outcome.errorCode).toBeFalsy();
});
