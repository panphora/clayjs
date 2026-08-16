/**
 * The scoped-sync dirty gate: a cheap counter that may over-report but must
 * never under-report, with generation-checked clearing so keystrokes during
 * an in-flight save stay dirty, and a persist probe that catches programmatic
 * value writes (no event, no MutationRecord).
 */

let gate;

beforeAll(async () => {
  window.clayEditMode = true;
  gate = await import("../../src/lib/dirty-gate.js");
});

beforeEach(async () => {
  document.body.innerHTML = "";
  // MutationObserver delivers as a microtask: let the innerHTML record land
  // BEFORE clearing, or every test starts with a phantom dirty count.
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

function type(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

test("typing in any form control marks the page maybe-dirty", () => {
  document.body.innerHTML = '<input type="text">';
  expect(gate.pageMaybeDirty()).toBe(false);
  type(document.querySelector("input"));
  expect(gate.pageMaybeDirty()).toBe(true);
});

test("a generation-checked clear resets the gate", () => {
  document.body.innerHTML = "<textarea></textarea>";
  type(document.querySelector("textarea"));
  const token = gate.gateCaptureToken();
  gate.gateClearIfUnchanged(token);
  expect(gate.pageMaybeDirty()).toBe(false);
});

test("an edit between capture and clear keeps the gate dirty", () => {
  document.body.innerHTML = "<textarea></textarea>";
  const area = document.querySelector("textarea");
  type(area);
  const token = gate.gateCaptureToken();
  type(area); // the keystroke that landed while the save was on the wire
  gate.gateClearIfUnchanged(token);
  expect(gate.pageMaybeDirty()).toBe(true);
});

test("events during the morph-apply window do not count", () => {
  document.body.innerHTML = '<input type="text">';
  gate.pauseGate();
  type(document.querySelector("input"));
  gate.resumeGate();
  expect(gate.pageMaybeDirty()).toBe(false);
});

test("a programmatic value write on a [persist] control trips the probe", () => {
  document.body.innerHTML = '<input persist type="text" value="saved">';
  expect(gate.pageMaybeDirty()).toBe(false);
  document.querySelector("input").value = "set-by-script";
  expect(gate.persistProbeDirty()).toBe(true);
  expect(gate.pageMaybeDirty()).toBe(true);
});

test("a [persist] control whose live state matches its serialized state is clean", () => {
  document.body.innerHTML =
    '<input persist type="text" value="v"><textarea persist data-value="tv">tv</textarea>';
  document.querySelector("textarea").value = "tv";
  expect(gate.persistProbeDirty()).toBe(false);
});

test("probeMarkClean stops a verified value from re-tripping the probe", () => {
  document.body.innerHTML = '<input persist type="text" value="saved">';
  const input = document.querySelector("input");
  input.value = "set-by-script";
  expect(gate.persistProbeDirty()).toBe(true);
  gate.probeMarkClean(); // the oracle just verified the page against baseline
  expect(gate.persistProbeDirty()).toBe(false);
});

test("a token clear does not cache a value written after the capture", () => {
  document.body.innerHTML = '<input persist type="text" value="saved">';
  const input = document.querySelector("input");
  const token = gate.gateCaptureToken();
  input.value = "written-mid-flight";
  gate.gateClearIfUnchanged(token);
  expect(gate.persistProbeDirty()).toBe(true);
});
