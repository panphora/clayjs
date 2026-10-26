/**
 * @jest-environment jsdom
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { CORE_WAVES, PLUGIN_PATHS } from "../../src/loader-logic.js";
import { bootFixture, TEMPLATES } from "./helpers/mode-harness.js";

/**
 * Step 17b-0: what an explicit initial edit boot of each starter template starts today.
 *
 * Every later road into edit has to leave this one as it is, and a live entry has to be
 * comparable against it, so the numbers are recorded once, on the unchanged tree, in
 * tests/fixtures/mode/initial-edit-parity.json. A view boot is recorded beside them: no
 * POST, no edit-only module, and the streams a reader already opens today.
 *
 * Set CLAY_RECORD_MODE_PARITY=1 to re-record. The fixture is the record, not a golden
 * value: it only changes when someone means to change what a boot starts.
 */

const FIXTURE_URL = new URL("../fixtures/mode/initial-edit-parity.json", import.meta.url);
const RECORD = Boolean(process.env.CLAY_RECORD_MODE_PARITY);
const recorded = RECORD ? {} : JSON.parse(readFileSync(FIXTURE_URL, "utf8"));

// Every path only an edit resolves: the edit-only core wave and every edit-only plugin,
// in both the draft spelling and the owner spelling.
const EDIT_ONLY = new Set([
  ...CORE_WAVES.editOnly,
  ...Object.values(PLUGIN_PATHS)
    .filter((spec) => spec.editOnly)
    .flatMap((spec) => [spec.path, spec.ownerPath])
    .filter(Boolean),
]);

async function measure(name, mode) {
  const boot = await bootFixture(name, { mode });
  try {
    return boot.counters();
  } finally {
    boot.stop();
  }
}

afterAll(() => {
  if (!RECORD) return;
  mkdirSync(dirname(FIXTURE_URL.pathname), { recursive: true });
  writeFileSync(FIXTURE_URL, `${JSON.stringify(recorded, null, 2)}\n`);
});

for (const name of TEMPLATES) {
  test(`${name}: an explicit initial edit starts exactly what the recorded fixture says`, async () => {
    const counts = await measure(name, "edit");
    if (RECORD) {
      recorded[name] = { ...recorded[name], edit: counts };
      return;
    }

    expect(counts).toEqual(recorded[name].edit);
  });
}

test("each template booted in view writes nothing, imports no edit-only module and opens no stream beyond its recorded view boot", async () => {
  for (const name of TEMPLATES) {
    const counts = await measure(name, "view");
    if (RECORD) {
      recorded[name] = { ...recorded[name], view: counts };
      continue;
    }

    expect({ name, posts: counts.posts }).toEqual({ name, posts: 0 });
    expect({ name, editOnly: Object.keys(counts.moduleCalls).filter((path) => EDIT_ONLY.has(path)) }).toEqual({
      name,
      editOnly: [],
    });
    expect({ name, eventSources: counts.eventSources }).toEqual({ name, eventSources: recorded[name].view.eventSources });
    expect(counts).toEqual(recorded[name].view);
  }
});
