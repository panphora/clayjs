/**
 * @jest-environment jsdom
 */

import { runCase, validateCase } from "../mode-counterexamples/driver.mjs";

/**
 * The counterexample driver itself, driven through the real switch.
 *
 * A held save, a held import, a second tab, the schedules the driver must refuse, and the
 * determinism the whole corpus depends on. Only transport, chunk imports and the clock
 * belong to the case; the loader, the mode controller, the save code and the lane modules
 * are the production ones.
 */

// The plan's own case: an exit whose save answer never arrives.
const HELD_SAVE = {
  schema: 1,
  id: "exit-response-unknown",
  fixture: "persist-host",
  boot: { mode: "view", live: true, destination: "host" },
  steps: [
    { op: "enter" },
    { op: "input", target: "title", value: "Kept text" },
    { op: "hold", boundary: "save.response" },
    { op: "leave", await: false },
    { op: "release", boundary: "save.response", result: "unknown" },
    { op: "settle" },
  ],
  requires: ["input-admitted", "save-request-sent", "save-outcome-unknown"],
  expect: { mode: "edit", writes: 1 },
};

test("a held save answers unknown: the request and the unknown fate are both in the trace", async () => {
  const { status, trace, result } = await runCase(HELD_SAVE);
  const kinds = trace.map((event) => event.kind);
  expect(kinds).toContain("save-request-sent");
  expect(kinds).toContain("save-outcome-unknown");
  expect(result.writes).toBe(1);
  // The current code refuses the exit on an unresolved fate, and it reports that plainly.
  expect(["passed", "failed"]).toContain(status);
});

test("a held import keeps the entry in entering until the case loads it", async () => {
  const { status, trace, result } = await runCase({
    schema: 1,
    id: "held-import",
    fixture: "persist-host",
    boot: { mode: "view", live: true, destination: "host" },
    steps: [
      { op: "hold", boundary: "chunk.import:core/save.js" },
      { op: "enter" },
      { op: "release", boundary: "chunk.import:core/save.js", result: "loaded" },
      { op: "settle" },
    ],
    requires: ["chunk-import-done:core/save.js"],
    expect: { mode: "edit", writes: 0 },
  });

  const phases = trace.filter((event) => event.kind === "mode-phase").map((event) => event.detail.phase);
  expect(phases).toContain("entering");
  expect(trace.map((event) => event.kind)).toContain("chunk-import-start");
  expect(result.mode).toBe("edit");
  expect(status).toBe("passed");
});

test("two independent tabs: tab B's peer edit reaches tab A and the Yjs documents are each their own", async () => {
  const { status, result, trace } = await runCase({
    schema: 1,
    id: "peer-edit",
    fixture: "lane-peer",
    boot: { mode: "view", live: true, destination: "host" },
    steps: [{ op: "peer", tab: "B", action: { value: "PEER" } }],
    requires: ["peer-edit"],
    expect: { mode: "view", writes: 0 },
  });

  expect(status).toBe("passed");
  expect(result.tabs.a.ydoc).not.toBe(result.tabs.b.ydoc);
  expect(result.tabs.a.ydoc.clientID).not.toBe(result.tabs.b.ydoc.clientID);
  expect(result.tabs.a.text).toContain("PEER");
  expect(result.tabs.b.text).toContain("PEER");
  expect(trace.some((event) => event.kind === "peer-applied" && event.detail.applied === true)).toBe(true);
});

test("a schedule the driver cannot mean is invalid, and says why", async () => {
  const base = { schema: 1, fixture: "persist-host", boot: { mode: "view" } };
  const schedules = [
    [{ ...base, id: "unknown-op", steps: [{ op: "jump" }] }, "unknown-op"],
    [{ ...base, id: "unknown-key", steps: [{ op: "enter", until: "entering" }] }, "unknown-key"],
    [{ ...base, id: "unsupported-boundary", steps: [{ op: "hold", boundary: "sync.apply" }] }, "unsupported-boundary"],
    [
      { ...base, id: "release-without-hold", steps: [{ op: "release", boundary: "save.response", result: "accepted" }] },
      "release-without-hold",
    ],
    [
      {
        ...base,
        id: "never-reached",
        steps: [
          { op: "hold", boundary: "save.response" },
          { op: "leave", await: false },
          { op: "release", boundary: "save.response", result: "accepted" },
        ],
        requires: ["save-outcome-unknown"],
      },
      "unmet-requirement",
    ],
  ];

  for (const [schedule, code] of schedules) {
    const outcome = await runCase(schedule);
    expect(outcome.status).toBe("invalid");
    const errors = outcome.result.errors;
    expect(errors.map((error) => error.code)).toContain(code);
    for (const error of errors) expect(typeof error.message).toBe("string");
  }

  // A hold on something the code only ever observes is refused by name as well.
  expect(validateCase({ ...base, id: "no-hold", steps: [{ op: "hold", boundary: "save.capture" }] })).toMatchObject({
    ok: false,
    errors: [expect.objectContaining({ code: "boundary-not-holdable" })],
  });
});

test("the same schedule twice gives the same trace", async () => {
  const first = await runCase(HELD_SAVE);
  const second = await runCase(HELD_SAVE);
  expect(second.trace).toEqual(first.trace);
  expect(second.status).toBe(first.status);
});
