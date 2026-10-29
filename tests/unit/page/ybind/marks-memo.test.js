import { jest } from "@jest/globals";

globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

// The codec is counted as it is reached: marks.js imports it by name, so the module it
// gets has to be the one this file wraps.
const codec = await import("../../../../src/page/format-codec.js");
let codecRuns = 0;
await jest.unstable_mockModule("../../../../src/page/format-codec.js", () => ({
  ...codec,
  entriesOfYjs: (fields) => { codecRuns += 1; return codec.entriesOfYjs(fields); },
}));

const Y = await import("../../../../src/vendor/yjs.vendor.js");
const { createPageDoc, seedFrom, walk, docOf } = await import("../../../../src/page/ybind/index.js");
const { marksFromAttributes } = await import("../../../../src/page/ybind/marks.js");

const marksOf = (doc) => {
  const out = [];
  doc.forEach((b) => {
    const runs = [];
    b.forEach((n) => { if (n.isText) runs.push(`${n.text}:${n.marks.map((m) => m.type.name).join("+") || "-"}`); });
    out.push(`${b.attrs.id}/${b.type.name}[${runs.join(" ")}]`);
  });
  return out;
};

function build(blocks, format) {
  const pd = createPageDoc(new Y.Doc());
  seedFrom(pd, blocks);
  pd.ydoc.transact(() => format(pd));
  return marksOf(docOf(pd, walk(pd)));
}

test("bold across paragraph, code block, paragraph", () => {
  const got = build(
    [{ id: "p", text: "AAA" }, { id: "c", t: "code_block", text: "CCC" }, { id: "q", text: "QQQ" }],
    (pd) => pd.flow.format(0, pd.flow.length, { strong: true }),
  );
  expect(got[0]).toBe("p/paragraph[AAA:strong]");
  expect(got[1]).toBe("c/code_block[CCC:-]");
  expect(got[2]).toBe("q/paragraph[QQQ:strong]");
});

test("bold that starts in a code block and runs into the next paragraph", () => {
  const got = build(
    [{ id: "c", t: "code_block", text: "CCC" }, { id: "q", text: "QQQ" }, { id: "r", text: "RRR" }],
    (pd) => pd.flow.format(2, 6, { strong: true }),
  );
  expect(got[0]).toBe("c/code_block[CCC:-]");
  expect(got[1]).toMatch(/strong/);
  expect(got[2]).toBe("r/paragraph[RRR:-]");
});

// The walk asks this of every text run on every keystroke, so the new-format codec runs
// only for a run that really carries a mark from a newer version.
test("a run with no unknown mark never runs the new-format codec", () => {
  codecRuns = 0;
  const known = marksFromAttributes({ strong: true }, "paragraph");
  expect(known.map((mark) => mark.type.name)).toEqual(["strong"]);
  expect(codecRuns).toBe(0);

  const unknown = marksFromAttributes({ future: { level: 2 } }, "paragraph");
  expect(unknown.map((mark) => mark.type.name)).toEqual(["opaque_marks"]);
  expect(codecRuns).toBe(1);
});
