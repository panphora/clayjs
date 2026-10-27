// The M13 format cases, one at a time: the record an older writer stored, and the blocks a
// neighbouring edit must leave exactly as they were. Every case is one of the formats the
// M13 matrix writes with floor 1, so the R half of a cohort row has real content to keep:
// the neighbour edit is the same paragraph in each case, and the case itself says which
// records a writer that does not know the format has to carry through untouched.
//
// A row is read through `caseOf(name)`, so a cohort test names its case instead of reaching
// into another case's records.
export const NEIGHBOUR = { id: "z", pos: "00000009", c: "Neighbour line", add: " edited" };

const neighbour = () => ({ t: "paragraph", pos: NEIGHBOUR.pos, c: NEIGHBOUR.c });

export const M13_CASES = [
  {
    name: "a person mention",
    // The label is ordinary text and the mention is a named mark over it, so a writer with
    // no mention type still writes the name and keeps the id beside it.
    keeps: ["a"],
    blocks: {
      a: { t: "paragraph", pos: "00000001", c: "Ada Lovelace wrote this", m: [[12, 'x["mention",{"id":"p-ada"}]'], [11, ""]] },
      z: neighbour(),
    },
  },
  {
    name: "a table of contents block",
    // A block type R has no schema for: its record rides in the article's inert envelope
    // and its readable fallback is all a reader that cannot draw it shows. R stores the
    // text field its own projection writes for a block it cannot draw.
    keeps: ["t"],
    blocks: {
      t: { t: "toc", pos: "00000002", maxLevel: 3 },
      z: neighbour(),
    },
  },
  {
    name: "a title heading's icon and cover",
    // A known block with attributes from a newer format: the heading stays a heading and
    // the attributes it does not know ride beside it.
    keeps: ["h"],
    blocks: {
      h: { t: "heading", pos: "00000000", level: 1, c: "Notes", pageIcon: "\ud83d\udcd8", pageCoverSrc: "/cover.jpg", pageCoverAlt: "A door", pageCoverX: 0.5, pageCoverY: 0.25 },
      z: neighbour(),
    },
  },
];

export function caseOf(name) {
  const found = M13_CASES.find((entry) => entry.name === name);
  if (!found) throw new RangeError(`page: no M13 format case ${JSON.stringify(name)}`);
  return found;
}
