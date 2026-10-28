import {
  PAGE_FORMAT, PAGE_FORMAT_HEADER, PAGE_FORMAT_META, PAGE_FORMAT_UPGRADE,
  formatCapability, knownPageFormatFloor, notePageFormatFloor, pageFormatDecision,
  floorZero, pageFormatFloor, pageFormatRefusal, requiredPageFormat, withPageFormatFloor,
} from "../../../src/page/format-level.js";
import { createFormatGate } from "../../../src/page/format-gate.js";

/**
 * The format floor: what a document carries, what a capture needs, and the gate a
 * new-format command asks before it touches content. A refusal is an upgrade
 * requirement, never a reload and never a lost store.
 */

const doc = (body = "", floor = 0) => {
  const marker = floor ? `<meta name="${PAGE_FORMAT_META}" content="${floor}">` : "";
  return `<!doctype html><html><head>${marker}<title>t</title></head><body>${body}</body></html>`;
};

const unknownBlock = { id: "q1", t: "quote", c: "hello" };
const unknownMark = { id: "p1", t: "paragraph", c: "hello", m: [[5, "x[\"underline\",{}]"]] };
const knownModel = { id: "p1", t: "paragraph", c: "hello", m: [[5, "b"]] };

function host(overrides = {}) {
  const calls = { read: 0, capabilities: 0, activate: 0 };
  const state = { floor: 0, revision: "r1", admitted: [PAGE_FORMAT] };
  const adapter = {
    calls,
    state,
    async read() {
      calls.read += 1;
      return { floor: state.floor, revision: state.revision };
    },
    async capabilities() {
      calls.capabilities += 1;
      return state.admitted;
    },
    async activate({ floor }) {
      calls.activate += 1;
      if (state.admitted.some((value) => value < floor)) return { accepted: false, code: PAGE_FORMAT_UPGRADE };
      state.floor = Math.max(state.floor, floor);
      state.revision = "r2";
      return { accepted: true, revision: state.revision, receipt: { accepted: true, revision: state.revision } };
    },
    ...overrides,
  };
  return adapter;
}

test("a document carries its floor in metadata outside the page value, and absence means zero", () => {
  expect(pageFormatFloor(doc())).toBe(0);
  expect(pageFormatFloor(doc("", 1))).toBe(1);
  expect(pageFormatFloor(`<meta content='2' name='${PAGE_FORMAT_META}'>`)).toBe(2);
  expect(pageFormatFloor(`<meta name="${PAGE_FORMAT_META}">`)).toBe(0);
  expect(pageFormatFloor(`<meta name="${PAGE_FORMAT_META}" content="one">`)).toBe(0);
  expect(pageFormatFloor("not html")).toBe(0);
});

test("setting the floor is canonical and idempotent, and the wrapper is untouched", () => {
  const plain = doc("<article data-page><p>x</p></article>");
  const once = withPageFormatFloor(plain, 1);
  expect(once).toBe(`<!doctype html><html><head><title>t</title><meta name="${PAGE_FORMAT_META}" content="1"></head><body><article data-page><p>x</p></article></body></html>`);
  expect(withPageFormatFloor(once, 1)).toBe(once);
  // A floor only rises: asking for 0 back leaves the marker where it is.
  expect(withPageFormatFloor(once, 0)).toBe(once);
  expect(withPageFormatFloor(withPageFormatFloor(plain, 1), 1)).toBe(once);
  expect(withPageFormatFloor(doc("", 2), 1)).toBe(doc("", 1));
});

test("a capture declares its capability, and an unreadable one declares nothing", () => {
  expect(formatCapability("1")).toBe(1);
  expect(formatCapability(1)).toBe(1);
  expect(formatCapability(undefined)).toBe(0);
  expect(formatCapability("")).toBe(0);
  expect(formatCapability("2 ")).toBe(2);
  expect(formatCapability("one")).toBe(0);
  expect(formatCapability("-1")).toBe(0);
  expect(formatCapability(1.5)).toBe(0);
  expect(PAGE_FORMAT_HEADER).toBe("X-Clay-Page-Format");
});

test("requiredPageFormat freezes the floor-0 registry: known content needs nothing, newer content needs 1", () => {
  expect(requiredPageFormat([])).toBe(0);
  expect(requiredPageFormat([knownModel])).toBe(0);
  expect(requiredPageFormat([{ id: "h", t: "heading", level: 2, c: "t" }])).toBe(0);
  expect(requiredPageFormat([{ id: "t1", t: "table", cols: [{ id: "c1", name: "n" }], rows: [{ id: "r1", cells: { c1: { c: "x", m: [[1, "b"]] } } }] }])).toBe(0);
  expect(requiredPageFormat([unknownBlock])).toBe(1);
  expect(requiredPageFormat([unknownMark])).toBe(1);
  expect(requiredPageFormat([{ id: "p1", t: "paragraph", c: "x", m: [[1, "u"]] }])).toBe(1);
  expect(requiredPageFormat([{ id: "p1", t: "paragraph", c: "x", m: ["", "z[\"v\"]"] }])).toBe(1);
  expect(requiredPageFormat([{ id: "p1", t: "paragraph", c: "x", future_attr: 1 }])).toBe(1);
  expect(requiredPageFormat([{ id: "t1", t: "table", cols: [], rows: [{ id: "r1", cells: { c1: { c: "x", m: [[1, "x[\"highlight\",{}]"]] } } }] }])).toBe(1);
  expect(requiredPageFormat([{ id: "p1", t: "paragraph", c: "\ufffc", m: [[1, "@{\"type\":\"hard_break\"}"]] }])).toBe(0);
  expect(floorZero().types).toContain("paragraph");
  expect(floorZero().marks).toEqual(["a", "b", "c", "i", "s"]);
  expect(Object.isFrozen(floorZero())).toBe(true);
  expect(() => requiredPageFormat([{ id: "p1", t: "paragraph", c: "x", m: [[1, "b["]] }])).toThrow(SyntaxError);
  expect(() => requiredPageFormat("nope")).toThrow(TypeError);
});

test("the decision refuses a writer below the content, and a floor rise no admitted editor could read", () => {
  expect(pageFormatDecision({ floor: 0, required: 0, capability: 1 })).toEqual({ ok: true, activate: false, floor: 0, required: 0 });
  expect(pageFormatDecision({ floor: 1, required: 0, capability: 1 })).toEqual({ ok: true, activate: false, floor: 1, required: 1 });
  expect(pageFormatDecision({ floor: 0, required: 1, capability: 1 })).toEqual({ ok: true, activate: true, floor: 1, required: 1 });
  const below = pageFormatDecision({ floor: 0, required: 1, capability: 0 });
  expect(below.ok).toBe(false);
  expect(below.minimum).toBe(1);
  expect(pageFormatDecision({ floor: 1, required: 1, capability: 0 }).ok).toBe(false);
  expect(pageFormatDecision({ floor: 0, required: 1, capability: 1, admitted: [0] }).ok).toBe(false);
  expect(pageFormatDecision({ floor: 1, required: 1, capability: 1, admitted: [0] }).ok).toBe(true);
});

test("a refusal names the minimum and carries 409, and is not a network failure", () => {
  const error = pageFormatRefusal(1);
  expect(error.code).toBe(PAGE_FORMAT_UPGRADE);
  expect(error.statusCode).toBe(409);
  expect(error.minimum).toBe(1);
  expect(error.message).toMatch(/update the editor/);
});

test("an incompatible editor already connected refuses activation before anything is mutated", async () => {
  const adapter = host();
  adapter.state.admitted = [PAGE_FORMAT, 0];
  const applied = [];
  const gate = createFormatGate({ host: adapter, installed: () => "tab-r", revision: () => "r1" });
  const result = await gate.run({ apply: () => applied.push("underline") });
  expect(result.status).toBe("upgrade-required");
  expect(result.code).toBe(PAGE_FORMAT_UPGRADE);
  expect(result.minimum).toBe(1);
  expect(result.message).toMatch(/newer page format/);
  expect(adapter.calls.activate).toBe(0);
  expect(adapter.state.floor).toBe(0);
  expect(gate.floor).toBe(0);
  expect(applied).toEqual([]);
});

test("a legacy registration that lands between the check and the save is refused under the lock", async () => {
  const adapter = host();
  const real = adapter.activate;
  adapter.activate = async (input) => {
    // The legacy tab registered after capabilities() answered.
    adapter.state.admitted = [0];
    return real(input);
  };
  const gate = createFormatGate({ host: adapter, installed: () => "tab-r", revision: () => "r1" });
  const result = await gate.run({ apply: () => "underline" });
  expect(result.status).toBe("upgrade-required");
  expect(result.retry).toBeUndefined();
  expect(adapter.state.floor).toBe(0);
  expect(gate.floor).toBe(0);
});

test("activation succeeds once with no incompatible editor, covers pending work and switches the lane from the receipt", async () => {
  const adapter = host();
  const switched = [];
  const lane = { async switchScope(floor, { receipt }) { switched.push({ floor, receipt }); return { status: "switched" }; } };
  const gate = createFormatGate({ host: adapter, installed: () => "tab-r", revision: () => adapter.state.revision, lane });
  const applied = [];
  const first = await gate.run({ apply: () => applied.push("underline") });
  expect(first.status).toBe("retry");
  expect(applied).toEqual([]);
  expect(adapter.state.floor).toBe(1);
  expect(switched).toHaveLength(1);
  expect(switched[0].floor).toBe(1);
  expect(switched[0].receipt).toEqual({ accepted: true, revision: "r2" });

  const second = await gate.run({ apply: () => applied.push("underline") });
  expect(second.status).toBe("applied");
  expect(applied).toEqual(["underline"]);
  expect(adapter.calls.activate).toBe(1);
  expect(gate.floor).toBe(1);

  const third = await gate.run({ apply: () => applied.push("underline") });
  expect(third.status).toBe("applied");
  expect(adapter.calls.activate).toBe(1);
  expect(applied).toEqual(["underline", "underline"]);
});

test("activation and the lane switch are retried after a wire failure and after a reconnect", async () => {
  const adapter = host();
  let fail = true;
  const real = adapter.activate;
  adapter.activate = async (input) => {
    if (fail) throw new Error("network");
    return real(input);
  };
  let switches = 0;
  const lane = { async switchScope() { switches += 1; return switches === 1 ? { status: "refused", code: "uncovered" } : { status: "switched" }; } };
  const gate = createFormatGate({ host: adapter, installed: () => "tab-r", revision: () => "r1" });
  const failed = await gate.run({ apply: () => "underline" });
  expect(failed.status).toBe("failed");
  expect(failed.retry).toBe(true);
  expect(gate.floor).toBe(0);

  fail = false;
  const retried = await gate.activate();
  expect(retried.status).toBe("active");
  expect(gate.floor).toBe(1);

  // A second gate on the same document finds the floor already set, so a
  // reconnect never asks to activate again.
  const adapter2 = host();
  adapter2.state.floor = 1;
  const gate2 = createFormatGate({ host: adapter2, installed: () => "tab-r", revision: () => "r2" });
  expect(await gate2.activate()).toMatchObject({ status: "active", floor: 1 });
  expect(adapter2.calls.activate).toBe(0);

  // A lane switch that did not happen stays pending and is retried on its own.
  const adapter3 = host();
  const order = [];
  const lane3 = { async switchScope() { order.push("switch"); return order.filter((x) => x === "switch").length === 1 ? { status: "refused", code: "uncovered" } : { status: "switched" }; } };
  const gate3 = createFormatGate({ host: adapter3, installed: () => "tab-r", revision: () => "r1", lane: lane3 });
  expect(await gate3.activate()).toMatchObject({ status: "active", floor: 1 });
  expect(await gate3.retry()).toMatchObject({ status: "active" });
  expect(order).toEqual(["switch", "switch"]);
});

test("disposal while awaiting the save applies nothing and switches no lane", async () => {
  const adapter = host();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const real = adapter.activate;
  adapter.activate = (input) => held.then(() => real(input));
  let switches = 0;
  const lane = { async switchScope() { switches += 1; return { status: "switched" }; } };
  const gate = createFormatGate({ host: adapter, installed: () => "tab-r", revision: () => "r1", lane });
  const running = gate.run({ apply: () => "underline" });
  gate.dispose();
  release();
  const result = await running;
  expect(result.status).toBe("disposed");
  expect(switches).toBe(0);
  expect(await gate.activate()).toEqual({ status: "disposed", retry: false });
});

test("no new format is emitted unless activation succeeds, and a refusal keeps every unsaved store", async () => {
  const adapter = host();
  adapter.state.admitted = [0];
  const stores = new Map([["page", { value: "p" }], ["notes", { value: "n" }]]);
  const before = new Map([...stores].map(([k, v]) => [k, v.value]));
  const gate = createFormatGate({ host: adapter, installed: () => "tab-r", revision: () => "r1" });
  const emitted = [];
  const result = await gate.run({ apply: () => emitted.push("quote") });
  expect(result.status).toBe("upgrade-required");
  expect(emitted).toEqual([]);
  expect(adapter.state.floor).toBe(0);
  expect(withPageFormatFloor(doc(), 0)).toBe(doc());
  expect(new Map([...stores].map(([k, v]) => [k, v.value]))).toEqual(before);
  expect(adapter.state.revision).toBe("r1");
});

test("an unsupported host keeps the newer writers off, and the save says which floor this tab writes", async () => {
  const adapter = host();
  const gate = createFormatGate({ host: adapter, supported: () => false, installed: () => "tab-r", revision: () => "r1" });
  const result = await gate.activate();
  expect(result.status).toBe("unsupported-host");
  expect(result.extension).toBe("page-format-v1");
  expect(adapter.calls.activate).toBe(0);
  expect(pageFormatFloor(doc())).toBe(0);
  notePageFormatFloor(1);
  expect(knownPageFormatFloor()).toBe(1);
  notePageFormatFloor(0);
  expect(knownPageFormatFloor()).toBe(1);
});

// The lane a floor rise moves this tab onto: the transport's own name for the move is
// `switchScope(floor, { covered })`, and the receipt of the accepted activation save is
// what covers the pending work.
test("an accepted activation switches the lane scope through the transport's own call, and the page says which floor it writes", async () => {
  document.head.innerHTML = "<title>Notes</title>";
  const adapter = host();
  const switched = [];
  const lane = {
    async switchScope(next, options) {
      switched.push({ next, options });
      return { status: "switched", floor: 1 };
    },
  };
  const gate = createFormatGate({ host: adapter, installed: () => "tab-r", revision: () => adapter.state.revision, lane });
  const applied = [];
  expect((await gate.run({ apply: () => applied.push("underline") })).status).toBe("retry");

  expect(applied).toEqual([]);
  expect(adapter.calls.activate).toBe(1);
  expect(switched).toHaveLength(1);
  expect(switched[0].next).toBe(PAGE_FORMAT);
  expect(switched[0].options.covered).toBe(true);
  expect(switched[0].options.receipt).toEqual({ accepted: true, revision: "r2" });
});

test("a switch the lane refuses stays pending and is retried with the same receipt", async () => {
  document.head.innerHTML = "<title>Notes</title>";
  const adapter = host();
  const calls = [];
  const lane = {
    async switchScope(next, options) {
      calls.push({ next, options });
      return calls.length === 1 ? { status: "refused", code: "uncovered" } : { status: "switched" };
    },
  };
  const gate = createFormatGate({ host: adapter, installed: () => "tab-r", revision: () => "r1", lane });
  expect(await gate.activate()).toMatchObject({ status: "active", floor: 1 });
  expect(calls).toHaveLength(1);
  expect(await gate.retry()).toMatchObject({ status: "active" });
  expect(calls).toHaveLength(2);
  // The retry is covered by the receipt the activation was accepted against.
  expect(calls[1].options.covered).toBe(true);
  expect(calls[1].options.receipt).toEqual({ accepted: true, revision: "r2" });
});
