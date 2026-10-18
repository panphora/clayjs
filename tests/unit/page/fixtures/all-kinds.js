// One record with every block kind, as the store keeps it: marks as runs,
// defaults left out, a w on a text block, a tombstone.
const L = "a[\"https://example.test/?a=1&b=<2>\"]";
function marked(id, pos, parts) {
  const c = parts.map(([t]) => t).join("");
  return { t: "paragraph", pos, c, m: parts.map(([t, k]) => [t.length, k]), w: { a: "tab-1", s: [] } };
}
export const RECORD = {
  blocks: {
    h: { t: "heading", pos: "1", level: 1, c: "Relay launch review" },
    p1: marked("p1", "2", [["Activation recovered to 62%. ", ""], ["Bold", "b"], [", ", ""], ["both", "bi"], [", a ", ""], ["link", L], [" and ", ""], ["bold link", "b" + L], [", ", ""], ["code", "c"], [" & <tags>.", ""]]),
    p2: { ...marked("p2", "3", [["Line one", ""], ["\uFFFC", '@{"type":"hard_break"}'], ["line two  with  double spaces ", ""]]), w: undefined },
    h2: { t: "heading", pos: "4", c: "What changed" },
    l1: { t: "list_item", pos: "5", c: "First bullet" },
    l2: { t: "list_item", pos: "6", indent: 1, kind: "ordered", c: "Nested ordered one" },
    l3: { t: "list_item", pos: "7", indent: 1, kind: "ordered", c: "Nested ordered two" },
    l4: { t: "list_item", pos: "8", indent: 2, c: "Deeper bullet" },
    l5: { t: "list_item", pos: "9", c: "Second bullet" },
    l6: { t: "list_item", pos: "A", kind: "ordered", c: "Ordered after bullet" },
    c1: { t: "list_item", pos: "B", kind: "check", checked: true, owner: "Maya", due: "2026-10-26", c: "Mobile empty state checked" },
    c2: { t: "list_item", pos: "C", kind: "check", c: "Invite copy" },
    co: { t: "callout", pos: "D", c: "Decision: launch.", m: [[9, "b"], [8, ""]] },
    tg: { t: "toggle", pos: "E", open: true, c: "Interview notes" },
    tb1: { t: "paragraph", pos: "F", parent: "tg", c: "Inside the toggle" },
    tb2: { t: "list_item", pos: "G", parent: "tg", c: "List in toggle" },
    tg2: { t: "toggle", pos: "H", parent: "tg", c: "Nested toggle" },
    tb3: { t: "paragraph", pos: "I", parent: "tg2", c: "Two deep" },
    after: { t: "paragraph", pos: "J", c: "Back at the top" },
    code: { t: "code_block", pos: "K", lang: "js", c: "\nconst a = 1 < 2 && 3;\n\n  indented\n" },
    hr: { t: "divider", pos: "L" },
    img: { t: "image", pos: "M", src: "/uploads/dip.png", alt: "Activation dip", caption: "Sep 28 dip", width: 480 },
    tbl: {
      t: "table", pos: "N",
      cols: { c1: { pos: "1", name: "Week", kind: "date" }, c2: { pos: "2", name: "Activation %", kind: "number" }, c3: { pos: "3", name: "Note" } },
      rows: { r1: { pos: "1", cells: { c1: "Sep 21", c2: "58", c3: "" } }, r2: { pos: "2", cells: { c1: "Sep 28", c2: "41", c3: "invite <first>" } } },
    },
    ch: { t: "chart", pos: "O", source: "tbl", x: "c1", series: ["c2"], title: "Activation by week", highlight: "r2" },
    bd: {
      t: "board", pos: "P",
      columns: { k1: { pos: "1", name: "To do" }, k2: { pos: "2", name: "Done" } },
      cards: { a: { pos: "1", col: "k1", title: "Sample inbox", owner: "Sam", due: "2026-10-20" }, b: { pos: "2", col: "k2", title: "Invite flow" }, c: { pos: "0", col: "k1", title: "First card" } },
    },
    tool: { t: "tool", pos: "Q", artifact: { title: "Countdown", html: "<b>x</b>", css: "", javascript: "", fallbackHtml: "<p>Launch in 9 days</p>", summary: "" }, rev: "r1", state: { n: 1 } },
    pre: { t: "preserved", pos: "R", html: "<blockquote><p>Quoted <u>thing</u></p></blockquote>" },
    gone: { t: "paragraph", pos: "S", c: "Deleted block" },
    empty: { t: "paragraph", pos: "T", c: "" },
  },
  deleted: { gone: true },
};
