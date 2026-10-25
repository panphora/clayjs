/**
 * @jest-environment node
 */
import { formatReport, measureBoot } from "../../../scripts/measure-page-boot.mjs";

const RESULT_KEYS = ["assetsOverlappedAuthority", "firstReady", "fixture", "inputAccepted", "installId", "phases"];

test("the boot meter reports each fixture's installation, phase order, overlap, first-ready outcome and input", async () => {
  const results = await measureBoot();

  expect(results.map((result) => result.fixture)).toEqual(["tagged text", "seeded text", "required feature", "serial boot", "blocked", "cancelled"]);
  for (const result of results) {
    expect(Object.keys(result).sort()).toEqual(RESULT_KEYS);
    expect(typeof result.installId).toBe("number");
    expect(Array.isArray(result.phases)).toBe(true);
    expect(typeof result.assetsOverlappedAuthority).toBe("boolean");
    expect(typeof result.firstReady).toBe("string");
    expect(typeof result.inputAccepted).toBe("boolean");
  }
  expect(new Set(results.map((result) => result.installId)).size).toBe(results.length);

  const byFixture = Object.fromEntries(results.map((result) => [result.fixture, result]));
  for (const name of ["tagged text", "seeded text", "required feature"]) {
    expect(byFixture[name]).toMatchObject({
      phases: ["loading", "joining", "adopting", "ready"],
      assetsOverlappedAuthority: true,
      firstReady: "ready",
      inputAccepted: true,
    });
  }
  expect(byFixture["serial boot"]).toMatchObject({
    phases: ["loading", "joining", "adopting", "ready"],
    assetsOverlappedAuthority: false,
    firstReady: "ready",
    inputAccepted: true,
  });
  expect(byFixture.blocked).toMatchObject({
    phases: ["loading", "joining", "blocked"],
    assetsOverlappedAuthority: true,
    firstReady: "blocked (editor-assets-failed)",
    inputAccepted: false,
  });
  expect(byFixture.cancelled).toMatchObject({ phases: ["loading", "joining"], assetsOverlappedAuthority: false, firstReady: "cancelled", inputAccepted: false });

  const text = formatReport(results);
  expect(text).toContain("clayjs page boot meter");
  expect(text).toContain("6 fixtures, 4 accepted input");
  expect(text).toMatch(
    /tagged text\n {2}install +\d+\n {2}phases +loading -> joining -> adopting -> ready\n {2}assets overlap +yes\n {2}first ready +ready\n {2}input accepted +yes\n/
  );
  expect(text).toMatch(
    /serial boot\n {2}install +\d+\n {2}phases +loading -> joining -> adopting -> ready\n {2}assets overlap +no\n {2}first ready +ready\n {2}input accepted +yes\n/
  );
  expect(text).toMatch(/cancelled\n {2}install +\d+\n {2}phases +loading -> joining\n {2}assets overlap +no\n {2}first ready +cancelled\n {2}input accepted +no\n/);
});
