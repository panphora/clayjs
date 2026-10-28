globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, seedFrom, walk, docOf } from "../../../../src/page/ybind/index.js";

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
