import { readFileSync } from "node:fs";
import {
  parsePath, cloneJson, validateOp, checkOp, applyOp, applyOps, coalesce, overlaps, assignDeep, serializeLive,
} from "../../src/live/ops.js";

const cases = JSON.parse(readFileSync(new URL("../fixtures/live-ops.json", import.meta.url), "utf8"));
const fresh = (v) => JSON.parse(JSON.stringify(v));

describe("the shared op fixture table", () => {
  for (const c of cases) {
    test(c.name, () => {
      const ops = c.ops.map(validateOp);
      if (c.throws) {
        expect(() => applyOps(fresh(c.before), ops)).toThrow();
        try { applyOps(fresh(c.before), ops); } catch (err) { expect(err.constructor.name).toBe(c.throws); }
      } else {
        expect(JSON.stringify(applyOps(fresh(c.before), ops))).toBe(JSON.stringify(c.after));
      }
    });
  }

  test("__proto__ never reaches the prototype", () => {
    const out = applyOps({}, [validateOp({ op: "set", path: ["__proto__"], value: { polluted: true } })]);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect({}.polluted).toBeUndefined();
  });
});

describe("paths", () => {
  test("a dotted string splits, with canonical integers as indexes", () => {
    expect(parsePath("players.alice.x")).toEqual(["players", "alice", "x"]);
    expect(parsePath("grid.0.12")).toEqual(["grid", 0, 12]);
    expect(parsePath("a.01")).toEqual(["a", "01"]);
    expect(parsePath("")).toEqual([]);
  });

  test("an array path is copied and checked", () => {
    const p = ["a", 1];
    expect(parsePath(p)).toEqual(["a", 1]);
    expect(parsePath(p)).not.toBe(p);
    expect(() => parsePath(["a", -1])).toThrow(TypeError);
    expect(() => parsePath(["a", 1.5])).toThrow(TypeError);
    expect(() => parsePath(42)).toThrow(TypeError);
  });

  test("overlaps is a prefix test", () => {
    expect(overlaps(["a"], ["a", "b"])).toBe(true);
    expect(overlaps(["a", "b"], ["a"])).toBe(true);
    expect(overlaps(["a", "b"], ["a", "c"])).toBe(false);
    expect(overlaps([], ["x"])).toBe(true);
    expect(overlaps(["l", 0], ["l", "0"])).toBe(true);
  });
});

describe("values", () => {
  test("cloneJson copies deeply", () => {
    const v = { a: [1, { b: 2 }] };
    const c = cloneJson(v);
    expect(c).toEqual(v);
    expect(c.a).not.toBe(v.a);
  });

  test("cloneJson refuses what JSON cannot hold", () => {
    const cyc = {};
    cyc.self = cyc;
    expect(() => cloneJson(cyc)).toThrow(/cycle/);
    expect(() => cloneJson({ f() {} })).toThrow(TypeError);
    expect(() => cloneJson(NaN)).toThrow(/finite/);
    expect(() => cloneJson(Infinity)).toThrow(/finite/);
    expect(() => cloneJson(new Date())).toThrow(/plain/);
    expect(() => cloneJson(10n)).toThrow(TypeError);
    expect(() => cloneJson([1, , 3])).toThrow(/sparse/);
    expect(() => cloneJson(undefined)).toThrow(TypeError);
  });

  test("cloneJson allows a shared reference that is not a cycle", () => {
    const shared = { x: 1 };
    expect(cloneJson({ a: shared, b: shared })).toEqual({ a: { x: 1 }, b: { x: 1 } });
  });

  test("serializeLive escapes <", () => {
    const text = serializeLive({ a: "</script><b>" });
    expect(text).toBe('{"a":"\\u003c/script>\\u003cb>"}');
    expect(JSON.parse(text).a).toBe("</script><b>");
  });
});

describe("validateOp", () => {
  test("normalizes the path and clones the value", () => {
    const value = { x: 1 };
    const op = validateOp({ op: "set", path: "p.a", value });
    expect(op).toEqual({ op: "set", path: ["p", "a"], value: { x: 1 } });
    expect(op.value).not.toBe(value);
  });

  test("refuses bad shapes", () => {
    expect(() => validateOp({ op: "move", path: ["a"] })).toThrow(TypeError);
    expect(() => validateOp({ op: "set", path: ["a"] })).toThrow(/delete/);
    expect(() => validateOp({ op: "set", path: [], value: 3 })).toThrow(/object or an array/);
    expect(() => validateOp({ op: "del", path: [] })).toThrow(TypeError);
    expect(() => validateOp({ op: "add", path: ["s"], n: NaN })).toThrow(/finite/);
    expect(() => validateOp({ op: "add", path: ["s"] })).toThrow(/finite/);
  });
});

describe("checkOp and applyOp", () => {
  test("checkOp throws before anything changes", () => {
    const root = { l: [1] };
    const before = JSON.stringify(root);
    expect(() => checkOp(root, validateOp({ op: "set", path: ["l", 5], value: 0 }))).toThrow(RangeError);
    expect(JSON.stringify(root)).toBe(before);
  });

  test("applyOp returns the new root for a whole-value set", () => {
    const root = { a: 1 };
    const out = applyOp(root, validateOp({ op: "set", path: [], value: [1, 2] }));
    expect(out).toEqual([1, 2]);
  });

  test("a set value is copied in, not aliased", () => {
    const value = { x: 1 };
    const out = applyOp({}, { op: "set", path: ["p"], value });
    value.x = 2;
    expect(out.p.x).toBe(1);
  });
});

describe("coalesce", () => {
  const P = ["s"];
  test("merges neighbours on one path without changing the result", () => {
    const sequences = [
      [{ op: "set", path: P, value: 1 }, { op: "set", path: P, value: 2 }],
      [{ op: "add", path: P, n: 1 }, { op: "add", path: P, n: 2 }],
      [{ op: "set", path: P, value: 4 }, { op: "add", path: P, n: 3 }],
      [{ op: "set", path: P, value: "x" }, { op: "add", path: P, n: 3 }],
      [{ op: "set", path: P, value: 1 }, { op: "del", path: P }],
      [{ op: "add", path: P, n: 1 }, { op: "del", path: P }],
    ];
    for (const ops of sequences) {
      const merged = coalesce(ops);
      expect(merged.length).toBe(1);
      expect(JSON.stringify(applyOps({ s: 10, t: 0 }, merged))).toBe(JSON.stringify(applyOps({ s: 10, t: 0 }, ops)));
    }
  });

  test("never merges across a del, or across different paths", () => {
    const delSet = [{ op: "del", path: P }, { op: "set", path: P, value: 1 }];
    expect(coalesce(delSet)).toHaveLength(2);
    const listDels = [{ op: "del", path: ["l", 0] }, { op: "del", path: ["l", 0] }];
    expect(coalesce(listDels)).toHaveLength(2);
    expect(JSON.stringify(applyOps({ l: [1, 2, 3] }, coalesce(listDels)))).toBe('{"l":[3]}');
    const mixed = [{ op: "set", path: ["a"], value: 1 }, { op: "set", path: ["b"], value: 2 }, { op: "set", path: ["a"], value: 3 }];
    expect(coalesce(mixed)).toHaveLength(3);
  });

  test("does not mutate its input", () => {
    const ops = [{ op: "add", path: P, n: 1 }, { op: "add", path: P, n: 2 }];
    coalesce(ops);
    expect(ops[0].n).toBe(1);
  });
});

describe("assignDeep", () => {
  test("keeps the identity of nested containers that survive", () => {
    const target = { players: { alice: { x: 1 } }, list: [{ a: 1 }] };
    const alice = target.players.alice;
    const item = target.list[0];
    assignDeep(target, { players: { alice: { x: 2 }, bob: { x: 0 } }, list: [{ a: 5 }, { a: 6 }] });
    expect(target.players.alice).toBe(alice);
    expect(alice.x).toBe(2);
    expect(target.list[0]).toBe(item);
    expect(target).toEqual({ players: { alice: { x: 2 }, bob: { x: 0 } }, list: [{ a: 5 }, { a: 6 }] });
  });

  test("ends with next's key order and drops removed keys", () => {
    const target = { a: 1, b: 2, c: 3 };
    assignDeep(target, { c: 3, a: 1 });
    expect(JSON.stringify(target)).toBe('{"c":3,"a":1}');
  });

  test("replaces a container whose type changed", () => {
    const target = { v: { x: 1 } };
    const old = target.v;
    assignDeep(target, { v: [1] });
    expect(target.v).toEqual([1]);
    expect(target.v).not.toBe(old);
  });

  test("shortens and lengthens lists", () => {
    const target = { l: [1, 2, 3] };
    const list = target.l;
    assignDeep(target, { l: [9] });
    expect(target.l).toBe(list);
    expect(list).toEqual([9]);
  });
});
