import { chunksOf, CHUNK_CHARS } from "../../../../src/page/ybind/writer.js";

const c = (ch) => ({ k: "c", ch, mk: "", ma: {} });

test("chunks hold at most 2000 tokens", () => {
  expect(CHUNK_CHARS).toBe(2000);
  const toks = Array.from({ length: 5000 }, () => c("a"));
  expect(chunksOf(toks).map((x) => x.length)).toEqual([2000, 2000, 1000]);
});

test("a chunk never ends on a high surrogate", () => {
  const toks = [...Array.from({ length: 1999 }, () => c("a")), c("\ud83d"), c("\ude00"), c("b")];
  const out = chunksOf(toks);
  expect(out[0].length).toBe(2001);
  expect(out[0][out[0].length - 1].ch).toBe("\ude00");
  expect(out[1].map((t) => t.ch)).toEqual(["b"]);
});
