import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const fixture = fileURLToPath(new URL("../fixtures/clay-style-adoption.mjs", import.meta.url));

test.each([
  ["refresh-marked", "refreshing already marked styles creates no undo step"],
  ["late", "late adoption stays clean and the next edit saves current styles"],
  ["queued-edit", "an edit queued before adoption still autosaves"],
  ["dirty", "adoption preserves unsaved edits and their undo step"],
  ["flight-clean", "a pending save cannot restore the false style warning"],
  ["flight-edit", "edits made during a pending save remain unsaved"],
  ["flight-failed", "a rejected pending save leaves real edits unsaved"],
  ["flight-force", "a pending forced save keeps the adopted comparisons"],
  ["editor", "all legacy editor styles enter the same clean adoption"],
  ["boot-adopt", "startup rendering still settles after style adoption"],
  ["boot-save-edit", "a save during startup prevents later edits being absorbed"],
  ["sync-install", "adoption preserves edits after a new sync baseline"],
  ["policy", "ordinary policy changes still warn"],
  ["view", "view mode retains the synchronous style helper"],
])("%s: %s", async (scenario) => {
  const { stdout } = await run(process.execPath, [fixture, scenario], { timeout: 15000 });
  const result = JSON.parse(stdout.trim().split("\n").at(-1));
  expect(result.scenario).toBe(scenario);
  expect(result.pass).toBe(true);
}, 20000);
