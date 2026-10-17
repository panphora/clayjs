// The replay's fallback (placed by a diff, no history before the write) maps a
// formatting write through the original offsets of the units still there.
// Round 7 review, Astra finding 3.
import { createReplay, step } from "../../../../src/page/replay.js";

test("Astra 3: formatting after a peer deletion outside the window lands on the right units", () => {
  const format = { t: "paragraph", c: "abcd", m: ["", "b", "i", "i"], w: { a: "a", e: "e1", k: 0, s: [[1, 4, "bcd", 4]] } };
  const r = createReplay({ t: "paragraph", c: "acd" }, { seq: 1, epoch: "e1" });
  step(r, format, 2);
  const exact = createReplay({ t: "paragraph", c: "abcd" }, { epoch: "e1" });
  step(exact, { t: "paragraph", c: "acd", w: { a: "b", e: "e1", k: 0, s: [[1, 2, "b", 4]] } }, 1);
  step(exact, format, 2);
  expect(exact.S).toMatchObject({ c: "acd", m: ["", "i", "i"] });
  expect(r.S).toMatchObject({ c: "acd", m: ["", "i", "i"] });
  expect(r.stats.fallback).toBe(1);
});
