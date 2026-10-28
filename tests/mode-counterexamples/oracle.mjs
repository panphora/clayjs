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
  "liveness",
  "enter-refused",
  "zero-implicit-writes",
  "positive-control",
  "bytes-etag-pairing",
  "no-writer-after-view",
  "unsaved-after-exit",
  "no-growth",
  "canonical-attributes",
];

// A refusal that names no source is one whose work has no registry: a save whose fate is
// unknown, or a composition the session will not cut. The page itself is then the only
// place the value can still be, so nothing but reachability can be asked of it.
const UNNAMED_REFUSALS = new Set(["save-unknown", "composition", "save-failed", "timeout"]);

const parseHtml = (html) => new DOMParser().parseFromString(String(html ?? ""), "text/html");

const saves = (run) => (run?.result?.calls ?? []).filter((call) => call.kind === "save");

const accepted = (run) => saves(run).filter((call) => call.status === 200);

const admittedOf = (run) => (run?.trace ?? []).filter((event) => event.kind === "input-admitted").map((event) => event.detail);

// Whether HTML the host accepted still carries this exact value: as text somewhere in the
// body or the head, or as a control's own value. The head is where a page's title and
// description live, and a sheet that edits them saves them there.
function carries(html, value) {
  const parsed = parseHtml(html);
  if ((parsed.body?.textContent ?? "").includes(value)) return true;
  if ((parsed.head?.textContent ?? "").includes(value)) return true;
  return [...parsed.querySelectorAll("input, textarea")].some(
    (element) => element.getAttribute("value") === value || element.textContent === value,
  );
}

// A draft page's save is a write into the visitor's own store and never a request to a
// host, so a value is conserved there when that store kept it — and a host save from a
// draft page is itself the violation, since a visitor has no host to write to.
const draftOf = (run) => run?.result?.draft ?? null;

const draftCarries = (run, value) => {
  const draft = draftOf(run);
  return draft?.data != null && JSON.stringify(draft.data).includes(value);
};

// The visitor store's own last word: a write it kept, or a refusal it announced. Only the
// last one speaks for the values the run left behind.
function lastDraftWord(run) {
  const words = (run?.trace ?? []).filter((event) => event.kind === "draft-saved" || event.kind === "draft-store-failed");
  return words.length ? words[words.length - 1].kind : null;
}

// The element a target was left holding: an id, a field with a registry of its own, or --
// where the page's own editor owns the element and it has no id -- the selector the step
// reached it with.
function fieldFor(result, entry) {
  const fields = result?.fields ?? [];
  const targets = result?.targets ?? [];
  if (entry.via === "unsent") {
    return fields.find((field) => field.unsent === entry.target) ?? targets.find((field) => field.unsent === entry.target) ?? null;
  }
  return (
    fields.find((field) => field.id === entry.target && field.unsent === null) ??
    targets.find((field) => field.target === entry.target && field.unsent === null) ??
    null
  );
}

// A control that throws away what the person typed there, by design: the sheet it belongs
// to is named by the control's own class, and a click on it discards every value the
// person had put in that sheet before the click. What they closed away is not owed to
// them, and no save may be asked to carry it.
const DISCARD_CONTROLS = new Map([[".clay-seo-x", ".clay-seo"]]);

// A click on a sheet's own apply control writes what the sheet holds into the page, head
// and all. The value is then in the document itself, so it is not waiting for a save to
// take it anywhere -- as long as the page really carries it.
const APPLY_CONTROLS = new Map([[".clay-seo-apply", ".clay-seo"]]);

function committed(run, entry) {
  if (!carries(run.result?.documentHtml, entry.value)) return false;
  return (run.trace ?? []).some((event) => {
    if (event.kind !== "click" || event.seq < entry.seq) return false;
    const sheet = APPLY_CONTROLS.get(event.detail.target);
    return sheet !== undefined && String(entry.target).startsWith(sheet);
  });
}

function discarded(run, entry) {
  return (run.trace ?? []).some((event) => {
    if (event.kind !== "click") return false;
    const sheet = DISCARD_CONTROLS.get(event.detail.target);
    if (!sheet) return false;
    if (event.seq < entry.seq) return false;
    return String(entry.target).startsWith(sheet);
  });
}

// The accepted saves the host had already made at a given moment of the trace. An accepted
// write is answered by a `save-response` stamped with the etag the call records, so that
// event says when its bytes landed: a save answered after the moment was not there yet.
function acceptedBefore(run, seq) {
  const answered = new Map();
  for (const event of run.trace ?? []) {
    if (event.kind === "save-response" && event.detail.status === 200 && event.detail.etag) {
      answered.set(event.detail.etag, event.seq);
    }
  }
  return accepted(run).filter((call) => {
    const at = answered.get(call.etag);
    return at !== undefined && at < seq;
  });
}

function lastRefusal(run) {
  const refusals = (run?.trace ?? []).filter((event) => event.kind === "transition-refused");
  return refusals.length ? refusals[refusals.length - 1].detail : null;
}

// The value each target was left holding: a later edit to the same field is the value
// that has to survive, and the text it replaced is not owed to anyone. A `before` moment
// asks the same question as of that point in the trace, so an edit made afterwards is not
// yet standing there.
function standingAdmissions(run, before = null) {
  const standing = new Map();
  const events = (run?.trace ?? []).filter(
    (event) => event.kind === "input-admitted" && (before === null || event.seq < before),
  );
  for (const event of events) standing.set(`${event.detail.via ?? "input"}:${event.detail.target}`, { ...event.detail, seq: event.seq });
  return [...standing.values()];
}

function conservation(run, fail) {
  const admitted = standingAdmissions(run).filter((entry) => !discarded(run, entry));
  if (!admitted.length) return;

  // A draft page's save is a write into the visitor's own store and never a request to a
  // host, so a host save from one is the violation itself, and a value is conserved when
  // that store kept it.
  if (draftOf(run)) {
    const hostSaves = saves(run).length;
    if (hostSaves) {
      fail("conservation", `a draft page sent ${hostSaves} save request(s) to a host, and a visitor's work belongs in their own store`);
      return;
    }
    const lost = admitted.filter((entry) => !draftCarries(run, entry.value));
    if (!lost.length) return;
    if (lastDraftWord(run) === "draft-store-failed") return;
    fail("conservation", `"${lost[0].value}" is in no draft write and the draft store announced no failure`);
    return;
  }

  const last = accepted(run).at(-1) ?? null;
  const outstanding = admitted
    .filter((entry) => !last || !carries(last.body, entry.value))
    .filter((entry) => !committed(run, entry));
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

// The sources the page still holds when the run ends: the run's own final list where the
// driver recorded one, and otherwise the last pending report the trace carries.
function pendingAtEnd(run) {
  if (Array.isArray(run?.result?.pending)) return run.result.pending;
  const reports = (run?.trace ?? []).filter((event) => Array.isArray(event.detail?.pending));
  return reports.at(-1)?.detail.pending ?? [];
}

// O7, liveness: an exit with nothing left to do must commit. A `save-failed` refusal is
// the machinery giving up on a save, so it is only a person's own work being in the way
// when something is still owed: the host's last accepted save does not carry it, or the
// page's own answer says it is unsaved. Where every value the person left standing is
// already in that save and the refusal names no pending source, the exit is refused for
// work that does not exist. A refusal that names a source is judged the same way when
// the run ends on it: a source that never cleared held the exit forever.
function liveness(run, fail) {
  // Each refusal is judged as of its own moment: the saves the host had accepted by then
  // and the values standing at then. A save or an admission that arrives afterwards cannot
  // make a refusal that was wrong when it was made look owed.
  for (const event of run.trace ?? []) {
    if (event.kind !== "transition-refused" || event.detail.op !== "leave" || event.detail.code !== "save-failed") continue;
    const refusal = event.detail;
    const pending = Array.isArray(refusal.pending) ? refusal.pending : [];
    if (pending.length) continue;
    const admitted = standingAdmissions(run, event.seq).filter((entry) => !discarded(run, entry));
    const last = acceptedBefore(run, event.seq).at(-1) ?? null;
    const owed = admitted.filter((entry) => !last || !carries(last.body, entry.value)).filter((entry) => !committed(run, entry));
    if (owed.length) continue;
    fail(
      "liveness",
      `the exit was refused "${refusal.code}" with no pending source and nothing owed: the host's last accepted save carries every value the person left, and the page says unsaved=${run.result?.unsaved === true}`,
    );
  }

  // A refusal that names a source is judged the same way at the end of the run: an exit
  // still refused on a source still pending there has held the exit forever, and is
  // refused for work that does not exist, exactly as an unnamed one is. Only the end of
  // the run decides this, because a source the person went on to clear refused nothing.
  const refusals = (run.trace ?? []).filter((event) => event.kind === "transition-refused" && event.detail.op === "leave");
  const last = refusals.at(-1) ?? null;
  if (!last) return;
  const named = Array.isArray(last.detail.pending) ? last.detail.pending : [];
  if (!named.length) return;
  if (run.result?.mode !== "edit") return;
  const held = pendingAtEnd(run);
  if (!named.some((source) => held.includes(source))) return;
  const admitted = standingAdmissions(run, last.seq).filter((entry) => !discarded(run, entry));
  const landed = acceptedBefore(run, last.seq).at(-1) ?? null;
  const owed = admitted.filter((entry) => !landed || !carries(landed.body, entry.value)).filter((entry) => !committed(run, entry));
  if (owed.length) return;
  fail(
    "liveness",
    `the exit stayed refused "${last.detail.code}" on a pending ${JSON.stringify(named)} that was still pending at the end of the run, and the host's last accepted save carries every value the person left`,
  );
}

// O8, an entry the switch refuses. An entry is the person asking to edit, and a refused
// one is a page they can no longer edit: the case has to be about that refusal, so it says
// so in `expect.refuse` (the codes it expects) or the refusal fails the run.
function enterRefused(json, run, fail) {
  const expected = Array.isArray(json.expect?.refuse) ? json.expect.refuse : [];
  for (const event of run.trace ?? []) {
    if (event.kind !== "transition-refused" || event.detail.op !== "enter") continue;
    const code = event.detail.code ?? "unknown";
    if (expected.includes(code)) continue;
    fail("enter-refused", `the entry was refused "${code}" with pending ${JSON.stringify(event.detail.pending ?? null)} where the case expects no refusal`);
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

// A cycle that touched nothing must hand back the page it was given: the authored
// attributes and the frozen regions are the document's own bytes, and the oracle compares
// the article the run ended on with the one the fixture served, not a projection of it.
function canonicalAttributes(json, run, fail) {
  if (json.expect?.canonical !== true) return;
  const before = run?.result?.inputHtml;
  const after = run?.result?.pageHtml;
  if (typeof before !== "string" || typeof after !== "string") {
    fail("canonical-attributes", "the run left no page to compare with the one the fixture served");
    return;
  }
  if (before === after) return;
  let at = 0;
  while (at < before.length && at < after.length && before[at] === after[at]) at++;
  fail(
    "canonical-attributes",
    `the page the run ended on differs from the served article at byte ${at}: served ${JSON.stringify(before.slice(at, at + 40))}, left ${JSON.stringify(after.slice(at, at + 40))}`,
  );
}

// A save is a writer left behind only when it belongs to no live session. The last committed
// leave closes one, and a committed entry after it opens another: a save inside that later
// session is the session's own writer, not the leave's. What is left to judge is the stretch
// between the leave and that entry, which is the page in view.
function noWriterAfterView(run, fail) {
  const committed = (run.trace ?? []).filter(
    (event) => event.kind === "transition" && event.detail.op === "leave" && event.detail.ok === true,
  );
  if (!committed.length) return;
  const from = committed[committed.length - 1].seq;
  if (run.result?.mode === "view" && run.result?.canWrite !== false) {
    fail("no-writer-after-view", "the page is in view and canWrite() is still true");
  }
  const reopened = (run.trace ?? []).filter(
    (event) => event.kind === "transition" && event.detail.op === "enter" && event.detail.ok === true && event.seq > from,
  )[0] ?? null;
  const until = reopened ? reopened.seq : Infinity;
  const later = (run.trace ?? []).filter((event) => event.seq > from && event.seq < until && event.kind === "save-request-sent");
  if (later.length) {
    fail("no-writer-after-view", `${later.length} save request(s) were sent after the committed leave`);
  }
}

// The page's own answer about unsaved work, read against what the host holds. A committed
// exit whose last accepted save carries the page's bytes leaves nothing to write, so a page
// that still reports unsaved work is warning the person about bytes the host already has.
// The page may append the framework's own view-time chrome after its own bytes, so the save
// has to carry the page up to that point; anything else is not this property's question.
function unsavedAfterExit(run, fail) {
  const transitions = (run.trace ?? []).filter((event) => event.kind === "transition" && event.detail.ok === true);
  const leave = transitions.at(-1) ?? null;
  if (!leave || leave.detail.op !== "leave") return;
  if (run.result?.mode !== "view") return;
  if (run.result?.unsaved !== true) return;
  const last = accepted(run).at(-1) ?? null;
  if (!last) return;
  const saved = parseHtml(savedDocument(last.body)).body?.innerHTML ?? "";
  const page = String(run.result?.pageHtml ?? "");
  if (saved !== page && !(saved.length < page.length && page.startsWith(saved))) return;
  fail(
    "unsaved-after-exit",
    "the exit committed and its last accepted save carries the page's own bytes, yet the page reports unsaved work",
  );
}

// The document an accepted save carried. The transport records the request body as it went
// out, which is the save envelope around the document's bytes.
function savedDocument(body) {
  try {
    const parsed = JSON.parse(String(body ?? ""));
    return typeof parsed?.html === "string" ? parsed.html : String(body ?? "");
  } catch {
    return String(body ?? "");
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
  // An invalid run is not a verdict, but why it could not be run is still evidence: the
  // driver's own reasons travel with it.
  if (run.status === "invalid") {
    return {
      status: "invalid",
      failures: (run.result?.errors ?? []).map((error) => ({ property: "run", detail: `${error.path ?? "case"}: ${error.message ?? error.code ?? "the run did not match the case"}` })),
    };
  }

  const failures = [];
  const fail = (property, detail) => failures.push({ property, detail });

  for (const error of run.result?.errors ?? []) {
    fail("driver-expect", `${error.path ?? "case"}: ${error.message ?? error.code ?? "the run did not match the case"}`);
  }
  conservation(run, fail);
  liveness(run, fail);
  enterRefused(json, run, fail);
  zeroImplicitWrites(json, run, fail);
  positiveControl(json, run, control, fail);
  etagPairing(run, fail);
  noWriterAfterView(run, fail);
  unsavedAfterExit(run, fail);
  noGrowth(run, fail);
  canonicalAttributes(json, run, fail);

  return { status: failures.length ? "failed" : "passed", failures };
}

export { PROPERTIES };
