// The work after an accepted save has to stay small: the accepted page HTML is parsed,
// the checkpoint proof is built over the records the saved state covers, the channel
// validates it, the file debt clears and the journal base is derived. On the 2,000-block
// fixture the proof path took about 2 s before the containment index and about 30 ms
// after it, so this test guards the walk it replaced, not the machine.
import { webcrypto } from "node:crypto";
import { measureSaveAccept } from "../../../scripts/measure-save-accept.mjs";

const RECORDS = 200;

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });

test("the work after an accepted save stays small at 2,000 blocks", async () => {
  const result = await measureSaveAccept({ records: RECORDS, history: 0 });
  console.log(JSON.stringify(result));
  expect(result.covered).toBe(RECORDS);
  // A generous ceiling: the proof path measures about 30 ms, the code before step 1 about 2,000 ms.
  // A loaded test box has measured over 500 ms, so the ceiling sits halfway to the old walk.
  expect(result.total).toBeLessThan(1000);
}, 300000);
