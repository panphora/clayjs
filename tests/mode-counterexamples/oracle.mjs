/**
 * @jest-environment jsdom
 */

/**
 * The oracle: an independent judgement of one run.
 *
 * It reads what the run left behind — the transport's own account of every request and
 * its answer, the page's HTML and field values, and the trace — and never the driver's
 * opinion about whether the run went well. A property that cannot be judged from that
 * evidence is not passed by default: it is skipped only when the run never reached the
 * situation it is about, and the driver's `requires` list is what decides invalid.
 *
 * Every zero-write family carries a positive control: a twin case with one admitted input
 * more, which must send exactly one write. A pair whose twin writes nothing proves
 * nothing, so it fails.
 */

const PROPERTIES = [
  "conservation",
  "zero-implicit-writes",
  "positive-control",
  "bytes-etag-pairing",
  "no-writer-after-view",
  "no-growth",
];

// A refusal that names no source is one whose work has no registry: a save whose fate is
// unknown, or a composition the session will not cut. The page itself is then the only
// place the value can still be, so nothing but reachability can be asked of it.
const UNNAMED_REFUSALS = new Set(["save-unknown", "composition", "save-failed", "timeout"]);

const parseHtml = (html) => new DOMParser().parseFromString(String(html ?? ""), "text/html");

const saves = (run) => (run?.result?.calls ?? []).filter((call) => call.kind === "save");

const accepted = (run) => saves(run).filter((call) => call.status === 200);

const admittedOf = (run) => (run?.trace ?? []).filter((event) => event.kind === "input-admitted").map((event) => event.detail);

// Whether HTML the host accepted still carries this exact value: as text somewhere, or as
// a control's own value.
function carries(html, value) {
  const parsed = parseHtml(html);
  if ((parsed.body?.textContent ?? "").includes(value)) return true;
  return [...parsed.querySelectorAll("input, textarea")].some(
    (element) => element.getAttribute("value") === value || element.textContent === value,
  );
}

function fieldFor(result, entry) {
  const fields = result?.fields ?? [];
  if (entry.via === "unsent") return fields.find((field) => field.unsent === entry.target) ?? null;
  return fields.find((field) => field.id === entry.target && field.unsent === null) ?? null;
}

function lastRefusal(run) {
  const refusals = (run?.trace ?? []).filter((event) => event.kind === "transition-refused");
  return refusals.length ? refusals[refusals.length - 1].detail : null;
}

// The value each target was left holding: a later edit to the same field is the value
// that has to survive, and the text it replaced is not owed to anyone.
function standingAdmissions(run) {
  const standing = new Map();
  for (const entry of admittedOf(run)) standing.set(`${entry.via ?? "input"}:${entry.target}`, entry);
  return [...standing.values()];
}

function conservation(run, fail) {
  const admitted = standingAdmissions(run);
  if (!admitted.length) return;
  const last = accepted(run).at(-1) ?? null;
  const outstanding = admitted.filter((entry) => !last || !carries(last.body, entry.value));
  if (!outstanding.length) return;

  const refusal = lastRefusal(run);
  const unknown = (run.trace ?? []).some((event) => event.kind === "save-outcome-unknown");
  const ended = run.result?.mode;
  if (!refusal && !unknown) {
    fail(
      "conservation",
      `"${outstanding[0].value}" is in no accepted save and the run ended in ${ended} without a refusal or an unknown fate`,
    );
    return;
  }

  const pending = Array.isArray(refusal?.pending) ? refusal.pending : [];
  for (const entry of outstanding) {
    const field = fieldFor(run.result, entry);
    if (!field || field.value !== entry.value) {
      fail(
        "conservation",
        `"${entry.value}" is not in the last accepted save and not reachable as an exact pending value at "${entry.target}"`,
      );
      continue;
    }
    if (!refusal) continue;
    if (UNNAMED_REFUSALS.has(refusal.code) && !pending.length) continue;
    const name = entry.via === "unsent" ? "unsent" : null;
    if (!pending.length) {
      fail("conservation", `the refusal "${refusal.code}" names no pending source for "${entry.value}"`);
    } else if (name && !pending.includes(name)) {
      fail("conservation", `the refusal's pending ${JSON.stringify(pending)} does not name "${name}" for "${entry.value}"`);
    }
  }
}

function zeroImplicitWrites(json, run, fail) {
  const writes = saves(run).length;
  const expected = json.expect?.writes;
  if (expected === 0 && writes !== 0) {
    fail("zero-implicit-writes", `the run sent ${writes} save requests where the schedule admits no edit`);
  }
}

function positiveControl(json, run, control, fail) {
  if (!json.control) return;
  if (!control || !control.run) {
    fail("positive-control", `the positive control "${json.control}" is not in the corpus`);
    return;
  }
  if (control.run.status === "invalid") {
    fail("positive-control", `the positive control "${json.control}" is invalid: ${control.run.result?.errors?.[0]?.message ?? "no reason given"}`);
    return;
  }
  const writes = saves(control.run).length;
  if (writes !== 1) {
    fail("positive-control", `the positive control "${json.control}" sent ${writes} save requests, not exactly one`);
  }
  const admitted = admittedOf(control.run).length;
  const pairAdmitted = admittedOf(run).length;
  if (admitted <= pairAdmitted) {
    fail(
      "positive-control",
      `the positive control "${json.control}" admits ${admitted} inputs, not more than the ${pairAdmitted} its pair admits`,
    );
  }
}

function etagPairing(run, fail) {
  const all = saves(run);
  for (const call of all.filter((entry) => entry.status === 200)) {
    if (!call.body) fail("bytes-etag-pairing", `an accepted save carries no request body to pair with "${call.etag}"`);
    if (!call.etag) fail("bytes-etag-pairing", `an accepted save carries no response stamp for its ${call.body?.length ?? 0} bytes`);
  }
  // Only a host that announced conditional saves makes the stamp a request's business.
  if (!all.some((call) => call.ifMatch)) return;
  for (let index = 1; index < all.length; index++) {
    const previous = all[index - 1];
    if (previous.status !== 200) continue;
    if (all[index].ifMatch !== previous.etag) {
      fail(
        "bytes-etag-pairing",
        `save ${index + 1} carried If-Match ${JSON.stringify(all[index].ifMatch)}, not the stamp ${JSON.stringify(previous.etag)} its predecessor's response named`,
      );
    }
  }
}

function noWriterAfterView(run, fail) {
  const committed = (run.trace ?? []).filter(
    (event) => event.kind === "transition" && event.detail.op === "leave" && event.detail.ok === true,
  );
  if (!committed.length) return;
  const from = committed[committed.length - 1].seq;
  if (run.result?.mode === "view" && run.result?.canWrite !== false) {
    fail("no-writer-after-view", "the page is in view and canWrite() is still true");
  }
  const later = (run.trace ?? []).filter((event) => event.seq > from && event.kind === "save-request-sent");
  if (later.length) {
    fail("no-writer-after-view", `${later.length} save request(s) were sent after the committed leave`);
  }
}

function noGrowth(run, fail) {
  const readings = (run.trace ?? []).filter((event) => event.kind === "resources").map((event) => event.detail);
  if (readings.length < 2) return;
  const first = readings[0];
  const last = readings[readings.length - 1];
  for (const key of ["documentListeners", "windowListeners", "editors"]) {
    if (first[key] === last[key]) continue;
    fail("no-growth", `${key} grew from ${first[key]} after cycle ${first.cycle} to ${last[key]} after cycle ${last.cycle}`);
  }
}

/**
 * Judge one run.
 *
 * @param {object} options
 * @param {object} options.case - the case JSON the run applied
 * @param {object} options.run - the driver's `{status, trace, result}`
 * @param {?{case: object, run: object}} [options.control] - the positive control's own case and run
 * @returns {{status: "passed"|"failed"|"invalid", failures: Array<{property: string, detail: string}>}}
 */
export function judge({ case: json, run, control = null } = {}) {
  if (!run) return { status: "invalid", failures: [{ property: "run", detail: "the driver produced no run" }] };
  if (run.status === "invalid") return { status: "invalid", failures: [] };

  const failures = [];
  const fail = (property, detail) => failures.push({ property, detail });

  for (const error of run.result?.errors ?? []) {
    fail("driver-expect", `${error.path ?? "case"}: ${error.message ?? error.code ?? "the run did not match the case"}`);
  }
  conservation(run, fail);
  zeroImplicitWrites(json, run, fail);
  positiveControl(json, run, control, fail);
  etagPairing(run, fail);
  noWriterAfterView(run, fail);
  noGrowth(run, fail);

  return { status: failures.length ? "failed" : "passed", failures };
}

export { PROPERTIES };
