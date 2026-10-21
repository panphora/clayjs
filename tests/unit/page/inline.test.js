import { schema } from "../../../src/page/schema.js";
import { ATOM, CODES, flatten, markKey, marksOf, packMarks, runsOf, unflatten, unitsOf, unpackMarks } from "../../../src/page/inline.js";
import { model } from "../../../src/vendor/prosemirror.vendor.js";

/**
 * Inline content as flat text plus one mark key per UTF-16 unit, and back.
 * Every case round-trips: content -> { c, m } -> content, the same nodes.
 */

const { strong, em, link, code } = schema.marks;
const t = (text, ...marks) => schema.text(text, marks);
const br = (...marks) => schema.nodes.hard_break.create(null, null, marks);
const para = (...nodes) => schema.nodes.paragraph.create({ id: "p" }, nodes);
const keys = (text, key) => new Array(text.length).fill(key);
const roundTrip = (node) => {
  const flat = flatten(node.content);
  const back = model.Fragment.from(unflatten(schema, flat.c, flat.m, node.type));
  return { flat, same: back.eq(node.content) };
};

test("text, marks, a link and a hard break", () => {
  const node = para(t("We "), t("fixed", strong.create()), t(" it, "), t("see", link.create({ href: "https://example.com" })), br(), t("next"));
  const { flat, same } = roundTrip(node);
  expect(flat.c).toBe("We fixed it, see" + ATOM + "next");
  expect(flat.m).toEqual([...keys("We ", ""), ...keys("fixed", "b"), ...keys(" it, ", ""), ...keys("see", 'a["https://example.com"]'), '@{"type":"hard_break"}', ...keys("next", "")]);
  expect(same).toBe(true);
});

test("emoji: one key per UTF-16 unit, and a pair never splits", () => {
  const node = para(t("I "), t("😀", strong.create()), t(" 🎉 you"));
  const { flat, same } = roundTrip(node);
  expect(flat.c.length).toBe(flat.m.length);
  expect(flat.m.slice(2, 4)).toEqual(["b", "b"]);
  expect(same).toBe(true);
  // A merge can leave the two halves of a pair with different keys: the pair
  // stays whole, with its first half's marks.
  const nodes = unflatten(schema, "a😀b", ["", "b", "", ""]);
  expect(nodes.map((n) => n.text)).toEqual(["a", "😀", "b"]);
  expect(nodes[1].marks.map((mk) => mk.type.name)).toEqual(["strong"]);
});

test("CJK and combining text", () => {
  const node = para(t("日本"), t("語", em.create()), t(" é"));
  const { flat, same } = roundTrip(node);
  expect(flat.c).toBe("日本語 é");
  expect(flat.m).toEqual(["", "", "i", "", "", ""]);
  expect(same).toBe(true);
});

test("hard breaks: consecutive, marked, and a U+FFFC typed as text", () => {
  const node = para(t("a"), br(), br(strong.create()), t(ATOM + "b"), t(ATOM, strong.create()));
  const { flat, same } = roundTrip(node);
  expect(flat.c).toBe("a" + ATOM + ATOM + ATOM + "b" + ATOM);
  expect(flat.m[1]).toBe('@{"type":"hard_break"}');
  expect(flat.m[2]).toBe('@{"type":"hard_break","marks":[{"type":"strong"}]}');
  expect(flat.m.slice(3)).toEqual(["", "", "b"]);
  expect(same).toBe(true);
  const back = unflatten(schema, flat.c, flat.m);
  expect(back.map((n) => n.type.name)).toEqual(["text", "hard_break", "hard_break", "text", "text"]);
});

test("adjacent identical marks are one run; adjacent links with different hrefs stay two", () => {
  const two = model.Fragment.fromArray([t("ab", strong.create()), t("cd", strong.create())]);
  expect(two.childCount).toBe(1);
  const links = para(t("one", link.create({ href: "https://a.test" })), t("two", link.create({ href: "https://b.test" })));
  const { flat, same } = roundTrip(links);
  expect(new Set(flat.m)).toEqual(new Set(['a["https://a.test"]', 'a["https://b.test"]']));
  expect(same).toBe(true);
  expect(unflatten(schema, flat.c, flat.m)).toHaveLength(2);
});

test("an href with quotes, brackets and backslashes round-trips", () => {
  const href = 'https://x.test/?q="a]b"&p=\\[1]';
  const key = markKey([strong.create(), link.create({ href })]);
  expect(key).toBe("b" + JSON.stringify([href]).replace(/^/, "a"));
  expect(marksOf(schema, key).map((mk) => [mk.type.name, mk.attrs.href ?? null])).toEqual([["strong", null], ["link", href]]);
});

test("every mark in the schema has a key code, and code blocks drop marks", () => {
  for (const name of Object.keys(schema.marks)) expect(CODES[name]).toMatch(/^[a-z]$/);
  expect(new Set(Object.values(CODES)).size).toBe(Object.keys(CODES).length);
  const nodes = unflatten(schema, "x()", ["c", "c", "c"], schema.nodes.code_block);
  expect(nodes[0].marks).toEqual([]);
  expect(unflatten(schema, "x", ["c"])[0].marks.map((mk) => mk.type)).toEqual([code]);
});

test("the record keeps marks as runs: neighbours merged, counts adding up to the text, and back", () => {
  const m = [...keys("The ", ""), ...keys("quick", "b"), ...keys(" ", ""), ...keys("link", 'a["https://x.test"]'), ...keys(" tail", "")];
  const runs = runsOf(m);
  expect(runs).toEqual([[4, ""], [5, "b"], [1, ""], [4, 'a["https://x.test"]'], [5, ""]]);
  expect(unitsOf(runs, m.length)).toEqual(m);
  expect(unitsOf([[2, "b"], [3, ""]], 5)).toEqual(["b", "b", "", "", ""]);
  expect(unitsOf(m, m.length)).toBe(m);
  expect(unitsOf(undefined, 3)).toBeUndefined();
  for (const bad of [[[0, "b"]], [[1.5, "b"]], [[2, 3]], [[6, "b"]], [[3, "b"], "x"], [[2, "b"]], [[2, "b"], [4, ""]]]) expect(unitsOf(bad, 5)).toBeNull();
});

test("a block and a write pack m and each splice's removed marks as runs, and unpack to the same value", () => {
  const X = { t: "paragraph", pos: "M", c: "ab cd", m: ["b", "b", "", "", ""], w: { a: "t", e: "e1", k: 3, s: [[2, 4, "xy", 4, ["i", "i"]], [0, 0, "", 5]] } };
  const packed = packMarks(X);
  expect(packed.m).toEqual([[2, "b"], [3, ""]]);
  expect(packed.w.s[0]).toEqual([2, 4, "xy", 4, [[2, "i"]]]);
  expect(packed.w.s[1]).toBe(X.w.s[1]);
  expect(X.m).toEqual(["b", "b", "", "", ""]);
  expect(unpackMarks(packed)).toEqual(X);
  const legacy = { t: "paragraph", pos: "M", c: "ab", m: ["b", ""] };
  expect(unpackMarks(legacy)).toBe(legacy);
  expect(unpackMarks({ t: "paragraph", pos: "M", c: "ab", m: [[9, "b"]] })).toEqual({ t: "paragraph", pos: "M", c: "ab", m: [] });
  expect(unpackMarks({ t: "paragraph", pos: "M", c: "ab", m: [[1, "b"]] })).toEqual({ t: "paragraph", pos: "M", c: "ab", m: [] });
  const blank = { t: "paragraph", pos: "M", c: "ab", m: ["", ""] };
  expect(packMarks(blank).m).toEqual([[2, ""]]);
  expect(unpackMarks(packMarks(blank))).toEqual(blank);
});
