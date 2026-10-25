/**
 * source-map: a save that verified has already parsed itself.
 *
 * The verifier parses the rendered bytes to count the errors the render introduced, and
 * that parse was thrown away: an accepted save parsed the accepted bytes a second time to
 * model them. `verifyForSave` keeps that tree as the model of exactly the bytes it
 * verified, and `pairCaptured` pairs the capture that produced those bytes against it by
 * walking the two trees together instead of searching with signatures.
 *
 * The claim is not "fewer parses". It is that the candidate model describes the same file
 * as a model parsed from scratch would: the same ranges for every live node, and the same
 * next save's bytes. So every case here compares the candidate against an independently
 * parsed model of the accepted bytes. And because a fast path is only safe if it refuses,
 * every kind of structural difference is checked to return null rather than a partial map.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  checkSource,
  locate,
  model,
  pair,
  pairCaptured,
  pairingCounts,
  render,
  resetPairingCounts,
  verify,
  verifyForSave,
} from "../../src/core/source-map.js";

const ROOT = new URL("../../", import.meta.url).pathname;

function htmlFilesUnder(dir, out = []) {
  let entries;
  try { entries = readdirSync(join(ROOT, dir), { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) htmlFilesUnder(rel, out);
    else if (entry.name.endsWith(".html") && statSync(join(ROOT, rel)).size > 0) out.push(rel);
  }
  return out;
}

// A document whose <noscript> holds markup cannot be direct-paired here, and refusing is
// the designed answer rather than a defect: this sweep's live tree is a DOMParser parse,
// which reads <noscript> with scripting OFF, while the model's parse5 reads it with
// scripting ON, so the block's children differ by construction (the <noscript> case below
// pins that refusal). tests/fixtures/load/journal-hyperclay.html is one: the Journal's own
// saved copy carries a head <noscript> with a <style> in it.
const noscriptHoldsMarkup = (src) => (src.match(/<noscript\b[\s\S]*?<\/noscript\s*>/gi) || [])
  .some((block) => block.slice(block.indexOf(">") + 1).includes("<"));

const CORPUS = [
  ...htmlFilesUnder("tests/fixtures"),
  ...htmlFilesUnder("conformance/fixtures"),
  ...htmlFilesUnder("examples"),
  ...htmlFilesUnder("website"),
].sort().filter((file) => !noscriptHoldsMarkup(readFileSync(join(ROOT, file), "utf8")));

function parse(src) {
  return new DOMParser().parseFromString(src, "text/html");
}

function kidsOf(el) {
  return Array.from(el.nodeType === 1 && el.tagName === "TEMPLATE" && el.content ? el.content.childNodes : el.childNodes);
}

function walk(root, visit) {
  visit(root);
  if (root.nodeType !== 1) return;
  for (const child of kidsOf(root)) walk(child, visit);
}

/** clone node -> the live node it was cloned from, as snapshot provenance does it. */
function provenanceFor(clone, live) {
  const origin = new WeakMap();
  pairWalk(live, clone);
  return (node) => origin.get(node) || null;

  function pairWalk(a, b) {
    origin.set(b, a);
    if (a.nodeType !== 1) return;
    const ak = kidsOf(a), bk = kidsOf(b);
    for (let i = 0; i < ak.length && i < bk.length; i++) pairWalk(ak[i], bk[i]);
  }
}

/**
 * One save: edit the page, capture a clone, render it through the model, verify.
 *
 * The pairing used to render is the ordinary one when the edit changed structure or text,
 * because that is what the renderer is handed in the save path: a page that differs from
 * the model. The candidate pairing is checked afterwards, on the capture the bytes came
 * from, which is the structurally identical case this step exists for.
 */
function saveEdited(doc, m, edit) {
  const live = doc.documentElement;
  edit(live);
  const clone = live.cloneNode(true);
  const provenance = provenanceFor(clone, live);
  const direct = pairCaptured(clone, m, provenance);
  const { map } = direct || pair(clone, m, provenance);
  const out = render(clone, map, m, provenance);
  const today = "<!DOCTYPE html>" + live.outerHTML;
  const v = verifyForSave(out.text, today, doc, clone, m.parseErrors);
  return { text: out.text, v, direct, clone, provenance, live: doc };
}

/**
 * The claim, in one place: the candidate is the same file as a fresh parse of the bytes.
 *
 * Same range for every node on the page, and the same bytes on the next save. Anything
 * less means the fast path quietly disagrees with the model it replaces, and a location
 * an agent acts on would be wrong.
 */
function expectCandidateMatchesAcceptedBytes(round) {
  const candidate = round.v.model;
  expect(candidate).toBeTruthy();
  expect(candidate.src).toBe(round.text);

  const fresh = model(round.text);
  const { map: freshMap } = pair(round.clone, fresh, round.provenance);
  const captured = pairCaptured(round.clone, candidate, round.provenance);
  expect(captured).not.toBeNull();

  const lives = [];
  walk(round.clone, (n) => {
    if (n.nodeType === 1 || n.nodeType === 3 || n.nodeType === 8) lives.push(round.provenance(n));
  });
  expect(lives.length).toBeGreaterThan(0);
  for (const liveNode of lives) {
    expect(locate(liveNode, captured.map, candidate)).toEqual(locate(liveNode, freshMap, fresh));
  }

  const nextFromCandidate = render(round.clone, captured.map, candidate, round.provenance).text;
  const nextFromFresh = render(round.clone, freshMap, fresh, round.provenance).text;
  expect(nextFromCandidate).toBe(nextFromFresh);
  return { captured, fresh, freshMap };
}

const JOURNAL = [
  "<!DOCTYPE html>",
  "<html>",
  "  <head>",
  "    <title>Journal</title>",
  "  </head>",
  '  <body class=journal data-page=\'today\'>',
  "    <header id=masthead>",
  "      <h1>Journal</h1>",
  "    </header>",
  "    <main id=entries>",
  "      <article class=entry data-id='1'>",
  "        <h2>First</h2>",
  "        <p class=body>alpha</p>",
  "      </article>",
  "      <article class=entry data-id='2'>",
  "        <h2>Second</h2>",
  "        <p class=body>beta</p>",
  "      </article>",
  "    </main>",
  "    <template id=entry-template>",
  "      <article class=entry><h2></h2><p class=body></p></article>",
  "    </template>",
  "  </body>",
  "</html>",
].join("\n");

describe("the corpus is real and non-empty", () => {
  test("a sweep that found nothing would read exactly like a clean sweep", () => {
    expect(CORPUS.length).toBeGreaterThan(50);
    expect(CORPUS.some((f) => f.startsWith("website/"))).toBe(true);
  });
});

describe("a verified save hands back the model of the bytes it verified", () => {
  test.each(CORPUS)("%s", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    const doc = parse(src);
    const root = doc.documentElement;
    const m = model(src);
    const { map } = pair(root, m);
    const out = render(root, map, m, (n) => n);
    expect(out.text).toBe(src);

    const v = verifyForSave(out.text, "<!DOCTYPE html>" + root.outerHTML, doc, root, m.parseErrors);
    expect(v.ok).toBe(true);
    expectCandidateMatchesAcceptedBytes({ text: out.text, v, clone: root, provenance: (n) => n, live: doc });
  });
});

describe("three save rounds after length-changing Unicode edits", () => {
  const bodyOf = (root, id) => root.querySelector(`[data-id="${id}"] .body`);

  test("every round keeps its ranges and its next save's bytes", () => {
    const doc = parse(JOURNAL);
    let m = model(JOURNAL);
    const edits = [
      (root) => { bodyOf(root, "1").textContent = "Café 🎉 naïve"; },
      (root) => { bodyOf(root, "2").textContent = "e\u0301e\u0301e\u0301 𝔘𝔫𝔦𝔠𝔬𝔡𝔢"; },
      (root) => { bodyOf(root, "1").firstChild.data = "🎉🎉🎉🎉"; },
    ];
    for (const edit of edits) {
      const round = saveEdited(doc, m, edit);
      expect(round.v.ok).toBe(true);
      expect(round.v.model).toBeTruthy();
      expectCandidateMatchesAcceptedBytes(round);
      expect(round.text).toContain(round.live.documentElement.querySelector("[data-id='1'] .body").textContent);
      m = round.v.model;
    }
  });

  test("no signature tree and no alignment is built for the direct pairing", () => {
    const doc = parse(JOURNAL);
    const root = doc.documentElement;
    const m = model(JOURNAL);
    const v = verifyForSave(JOURNAL, "<!DOCTYPE html>" + root.outerHTML, doc, root, m.parseErrors);
    expect(v.ok).toBe(true);

    resetPairingCounts();
    const captured = pairCaptured(root, v.model, (n) => n);
    expect(captured).not.toBeNull();
    expect(captured.stats.paired).toBeGreaterThan(10);
    expect(pairingCounts.align).toBe(0);
    expect(pairingCounts.hashKey).toBe(0);

    // The counters can see the ordinary path, so zero above is not a counter that never fires.
    pair(root, v.model, (n) => n);
    expect(pairingCounts.align).toBeGreaterThan(0);
    expect(pairingCounts.hashKey).toBeGreaterThan(0);
  });
});

describe("the bytes the author wrote survive a verified save", () => {
  test("exact author quoting is copied, not reprinted", () => {
    const src = [
      "<!DOCTYPE html>",
      "<html>",
      "<body>",
      "<p class='lead' data-x=keep title=\"t\" id=a>one</p>",
      "<p class='lead' data-x=keep>two &amp; three</p>",
      "</body>",
      "</html>",
    ].join("\n");
    const doc = parse(src);
    const round = saveEdited(doc, model(src), (root) => { root.querySelector("#a").textContent = "ONE"; });
    expect(round.v.ok).toBe(true);
    expect(round.text).toContain("<p class='lead' data-x=keep title=\"t\" id=a>ONE</p>");
    expect(round.text).toContain("<p class='lead' data-x=keep>two &amp; three</p>");
    expectCandidateMatchesAcceptedBytes(round);
  });

  test("a moved node is printed at its new place and locates there", () => {
    // No whitespace between the siblings: a move leaves no adjacent text nodes behind,
    // and a DOM keeps two of those where a reparse has one.
    const src = '<!DOCTYPE html><html><body><div id=a>A</div><div id=b>B</div><div id=c>C</div></body></html>';
    const doc = parse(src);
    const round = saveEdited(doc, model(src), (root) => {
      const c = root.querySelector("#c");
      c.remove();
      root.querySelector("#a").before(c);
    });
    expect(round.v.ok).toBe(true);
    expect(round.text.indexOf('<div id=c>C</div>')).toBeLessThan(round.text.indexOf('<div id=a>A</div>'));
    const { captured } = expectCandidateMatchesAcceptedBytes(round);
    const liveC = round.live.querySelector("#c");
    const range = locate(liveC, captured.map, round.v.model);
    expect(round.text.slice(range.from, range.to)).toBe('<div id=c>C</div>');

    // A second save over the accepted bytes is byte identical: the moved node is copied now.
    const again = saveEdited(round.live, round.v.model, () => {});
    expect(again.text).toBe(round.text);
    expectCandidateMatchesAcceptedBytes(again);
  });

  test("duplicate sibling content pairs by position, not by content", () => {
    const src = [
      "<!DOCTYPE html>",
      "<html>",
      "<body>",
      "<ul id=list>",
      "<li>same</li>",
      "<li>same</li>",
      "</ul>",
      "</body>",
      "</html>",
    ].join("\n");
    const doc = parse(src);
    const round = saveEdited(doc, model(src), (root) => {
      root.querySelectorAll("#list li")[0].textContent = "same!";
    });
    expect(round.v.ok).toBe(true);
    const { captured } = expectCandidateMatchesAcceptedBytes(round);
    const [first, second] = round.live.querySelectorAll("#list li");
    const r1 = locate(first, captured.map, round.v.model);
    const r2 = locate(second, captured.map, round.v.model);
    expect(round.text.slice(r1.from, r1.to)).toBe("<li>same!</li>");
    expect(round.text.slice(r2.from, r2.to)).toBe("<li>same</li>");
  });

  test("insertion and deletion leave the new node with an accepted location", () => {
    const src = '<!DOCTYPE html><html><body><div id=a>A</div><div id=b>B</div></body></html>';
    const doc = parse(src);
    const round = saveEdited(doc, model(src), (root) => {
      const d = root.ownerDocument.createElement("div");
      d.id = "d";
      d.textContent = "D";
      root.querySelector("#b").before(d);
      root.querySelector("#a").remove();
    });
    expect(round.v.ok).toBe(true);
    expect(round.text).not.toContain('<div id=a>A</div>');
    const { captured } = expectCandidateMatchesAcceptedBytes(round);
    const liveD = round.live.querySelector("#d");
    const range = locate(liveD, captured.map, round.v.model);
    expect(round.text.slice(range.from, range.to)).toBe("<div id=d>D</div>");
    expect(locate(round.live.querySelector("#a"), captured.map, round.v.model)).toBeNull();
  });

  test("template contents are found, paired and edited in place", () => {
    const src = [
      "<!DOCTYPE html>",
      "<html>",
      "<body>",
      '<template id=tpl><li class=row>one</li><li class=row>two</li></template>',
      "</body>",
      "</html>",
    ].join("\n");
    const doc = parse(src);
    const round = saveEdited(doc, model(src), (root) => {
      root.querySelector("#tpl").content.querySelector(".row").textContent = "ONE";
    });
    expect(round.v.ok).toBe(true);
    expect(round.text).toContain("<li class=row>ONE</li>");
    expect(round.text).toContain("<li class=row>two</li>");
    const { captured } = expectCandidateMatchesAcceptedBytes(round);
    const inner = round.live.querySelector("#tpl").content.querySelector(".row");
    const range = locate(inner, captured.map, round.v.model);
    expect(round.text.slice(range.from, range.to)).toBe("<li class=row>ONE</li>");
  });

  test("omitted tags keep their implied shape and still locate their bytes", () => {
    const src = "<!DOCTYPE html><html><body><p>first<p>second<ul><li>a<li>b</ul></body></html>";
    const doc = parse(src);
    const round = saveEdited(doc, model(src), (root) => {
      root.querySelectorAll("p")[1].textContent = "SECOND";
    });
    expect(round.v.ok).toBe(true);
    expect(round.text).toBe(src.replace("second", "SECOND"));
    const { captured } = expectCandidateMatchesAcceptedBytes(round);
    const liveSecond = round.live.querySelectorAll("p")[1];
    const range = locate(liveSecond, captured.map, round.v.model);
    expect(round.text.slice(range.from, range.to)).toBe("<p>SECOND");
  });

  test("CRLF line endings stay CRLF everywhere the edit did not reach", () => {
    const src = "<!DOCTYPE html>\r\n<html>\r\n<body>\r\n<p id=a>one</p>\r\n<p id=b>two</p>\r\n</body>\r\n</html>\r\n";
    const doc = parse(src);
    const round = saveEdited(doc, model(src), (root) => { root.querySelector("#b").textContent = "TWO"; });
    expect(round.v.ok).toBe(true);
    expect(round.text).toContain("<p id=a>one</p>\r\n");
    expect(round.text).toContain("<p id=b>TWO</p>");
    expect(round.text.replace(/\r\n/g, "")).not.toContain("\n");
    expectCandidateMatchesAcceptedBytes(round);
  });

  test("a leading newline inside <pre> survives, which today's serializer drops", () => {
    const src = "<!DOCTYPE html><html><body><pre id=p>\nfirst line\nsecond</pre><p id=x>x</p></body></html>";
    const doc = parse(src);
    const round = saveEdited(doc, model(src), (root) => { root.querySelector("#x").textContent = "X"; });
    expect(round.v.ok).toBe(true);
    expect(round.text).toContain("<pre id=p>\nfirst line\nsecond</pre>");
    expectCandidateMatchesAcceptedBytes(round);
  });

  test("SVG namespaces pair, and the authored namespace attribute is not duplicated", () => {
    const src = [
      "<!DOCTYPE html>",
      "<html>",
      "<body>",
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1">',
      "<text id=label>hi</text>",
      '<use xlink:href="#a"/>',
      "</svg>",
      "</body>",
      "</html>",
    ].join("\n");
    const doc = parse(src);
    const round = saveEdited(doc, model(src), (root) => {
      root.querySelector("#label").textContent = "HI";
    });
    expect(round.v.ok).toBe(true);
    expect(round.text.match(/xmlns:xlink=/g)).toHaveLength(1);
    expect(round.text).toContain('<use xlink:href="#a"/>');
    const { captured } = expectCandidateMatchesAcceptedBytes(round);
    const label = round.live.querySelector("#label");
    const range = locate(label, captured.map, round.v.model);
    expect(round.text.slice(range.from, range.to)).toBe("<text id=label>HI</text>");
  });

  test("<noscript> is a structural difference for these parsers, so direct pairing refuses", () => {
    const src = "<!DOCTYPE html><html><head></head><body><noscript><p class='n'>no js</p></noscript><p id=x>x</p></body></html>";
    const doc = parse(src);
    const m = model(src);
    const root = doc.documentElement;

    // jsdom's DOMParser parses with scripting off, so the block holds elements; parse5
    // parses with it on, so the same block holds one text node. The trees differ here and
    // the direct path must say so rather than pair across the difference.
    expect(pairCaptured(root, m)).toBeNull();

    const round = saveEdited(doc, m, (live) => { live.querySelector("#x").textContent = "X"; });
    expect(round.v.ok).toBe(true);
    expect(round.v.model).toBeTruthy();
    expect(round.text).toContain('<noscript><p class="n">no js</p></noscript>');
    expect(pairCaptured(round.clone, round.v.model, round.provenance)).toBeNull();
  });
});

describe("verification that fails offers no candidate", () => {
  const SRC = [
    "<!DOCTYPE html>",
    "<html>",
    "<body>",
    "<p class='a'>hello</p>",
    "<p class='b'>world</p>",
    "</body>",
    "</html>",
  ].join("\n");

  test("a corrupted render is refused and keeps no model", () => {
    const doc = parse(SRC);
    const root = doc.documentElement;
    const corrupted = SRC.replace("hello", "HELLO");
    const v = verifyForSave(corrupted, "<!DOCTYPE html>" + root.outerHTML, doc, root, model(SRC).parseErrors);
    expect(v.ok).toBe(false);
    expect(v.diff).toMatch(/text/);
    expect(v.model).toBeUndefined();
  });

  test("a render that adds a duplicate attribute is refused and keeps no model", () => {
    const src = '<!DOCTYPE html><html><body><svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/></svg></body></html>';
    const doubled = src.replace(
      'xmlns:xlink="http://www.w3.org/1999/xlink">',
      'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xlink="http://www.w3.org/1999/xlink">'
    );
    const doc = parse(src);
    const root = doc.documentElement;
    // The tree comparison alone cannot see this one: the parser keeps the first attribute.
    expect(verify(doubled, "<!DOCTYPE html>" + root.outerHTML, doc, null).ok).toBe(true);
    const v = verifyForSave(doubled, "<!DOCTYPE html>" + root.outerHTML, doc, root, model(src).parseErrors);
    expect(v.ok).toBe(false);
    expect(v.diff).toMatch(/duplicate-attribute 0 -> 1/);
    expect(v.model).toBeUndefined();
  });

  test("a model that is not this document is not offered as a candidate", () => {
    const doc = parse('<!DOCTYPE html><html><body><p>real</p></body></html>');
    const root = doc.documentElement;
    const fostered = '<!DOCTYPE html><html><body><table><form><input name=a></form></table></body></html>';
    const m = model(fostered);
    expect(checkSource(m, doc)).not.toBeNull();
    const v = verifyForSave(fostered, "<!DOCTYPE html>" + root.outerHTML, doc, null, m.parseErrors);
    expect(v.model).toBeUndefined();
  });
});

describe("direct pairing refuses every structural difference", () => {
  const SRC = [
    "<!DOCTYPE html>",
    "<html>",
    "<body>",
    '<div id=a class=x>text</div>',
    "<!-- note -->",
    "<template id=t><li>row</li></template>",
    "</body>",
    "</html>",
  ].join("\n");

  const mutate = (fn) => {
    const doc = parse(SRC);
    fn(doc);
    return pairCaptured(doc.documentElement, model(SRC));
  };

  test("the fixture itself pairs directly, so these are refusals and not a broken fixture", () => {
    expect(pairCaptured(parse(SRC).documentElement, model(SRC))).not.toBeNull();
  });

  test("an attribute the model does not have", () => {
    expect(mutate((doc) => doc.querySelector("#a").setAttribute("data-new", "1"))).toBeNull();
  });

  test("an attribute value the model does not have", () => {
    expect(mutate((doc) => doc.querySelector("#a").setAttribute("class", "y"))).toBeNull();
  });

  test("different text", () => {
    expect(mutate((doc) => { doc.querySelector("#a").textContent = "other"; })).toBeNull();
  });

  test("a different element namespace", () => {
    expect(mutate((doc) => {
      const el = doc.querySelector("#a");
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "div");
      svg.setAttribute("class", "x");
      svg.textContent = "text";
      el.replaceWith(svg);
    })).toBeNull();
  });

  test("a different element tag", () => {
    expect(mutate((doc) => {
      const el = doc.querySelector("#a");
      const span = doc.createElement("span");
      span.setAttribute("class", "x");
      span.textContent = "text";
      el.replaceWith(span);
    })).toBeNull();
  });

  test("one child too few", () => {
    expect(mutate((doc) => doc.querySelector("#a").firstChild.remove())).toBeNull();
  });

  test("one child too many", () => {
    expect(mutate((doc) => doc.body.appendChild(doc.createElement("p")))).toBeNull();
  });

  test("a different comment", () => {
    expect(mutate((doc) => {
      const note = Array.from(doc.body.childNodes).find((n) => n.nodeType === 8);
      note.data = "other";
    })).toBeNull();
  });

  test("different template contents", () => {
    expect(mutate((doc) => { doc.querySelector("#t").content.querySelector("li").textContent = "other"; })).toBeNull();
  });

  test("a model with no root", () => {
    expect(pairCaptured(parse(SRC).documentElement, model(""))).toBeNull();
  });

  test("a clone node with no live original is left unpaired, exactly as pair leaves it", () => {
    const doc = parse(SRC);
    const root = doc.documentElement;
    const added = doc.createElement("p");
    added.textContent = "new";
    root.querySelector("#a").after(added);
    const accepted = model("<!DOCTYPE html>" + root.outerHTML);
    const captured = pairCaptured(root, accepted, (n) => (n === added ? null : n));
    expect(captured).not.toBeNull();
    expect(captured.stats.unresolved).toBe(1);
    expect(captured.map.get(added)).toBeUndefined();
    expect(captured.map.get(root.querySelector("#a"))).toBeTruthy();
  });

  test("a refusal leaves no partial map behind, and the ordinary path still pairs", () => {
    const doc = parse(SRC);
    doc.querySelector("#a").textContent = "other";
    expect(pairCaptured(doc.documentElement, model(SRC))).toBeNull();
    const { map, stats } = pair(doc.documentElement, model(SRC));
    expect(map.get(doc.querySelector("#a"))).toBeTruthy();
    expect(stats.paired).toBeGreaterThan(0);
  });
});

describe("the fast path is narrower than arbitrary HTML, and says so", () => {
  test("direct pairing covers the journal and falls back where the trees differ", () => {
    const noscript = "<!DOCTYPE html><html><head></head><body><noscript><p>no js</p></noscript></body></html>";
    const foster = '<!DOCTYPE html><html><body><table><form><input name=a></form></table></body></html>';
    const cases = [
      [JOURNAL, "direct"],
      [noscript, "fallback"],
      [foster, "fallback"],
    ];
    let direct = 0, fallback = 0;
    resetPairingCounts();
    for (const [src, expected] of cases) {
      const doc = parse(src);
      const root = doc.documentElement;
      const m = model(src);
      const paired = checkSource(m, doc) ? null : pairCaptured(root, m);
      if (paired) direct++;
      else fallback++;
      expect(paired ? "direct" : "fallback").toBe(expected);
    }
    expect(direct).toBeGreaterThan(0);
    expect(fallback).toBeGreaterThan(0);
    expect(pairingCounts.align).toBe(0);
    expect(pairingCounts.hashKey).toBe(0);
  });
});

describe("a map and a model from different captures are not used together", () => {
  test("every range from the other capture is refused", () => {
    const A = "<!DOCTYPE html><html><body><ul id=list><li data-id='a'>alpha</li><li data-id='b'>beta</li></ul></body></html>";
    const B = '<!DOCTYPE html><html><body><ul id="list"><li data-id="a">alpha</li><li data-id="b">beta</li></ul></body></html>';
    const doc = parse(A);
    const root = doc.documentElement;
    const mA = model(A);
    const mB = model(B);
    const capturedB = pairCaptured(root, mB);
    expect(capturedB).not.toBeNull();

    const lives = [];
    walk(root, (n) => { if (n.nodeType === 1 || n.nodeType === 3 || n.nodeType === 8) lives.push(n); });
    for (const liveNode of lives) expect(locate(liveNode, capturedB.map, mA)).toBeNull();

    const crossed = render(root, capturedB.map, mA, (n) => n).text;
    expect(crossed).not.toContain("alalpha");
    expect(verify(crossed, "<!DOCTYPE html>" + root.outerHTML, doc, root).ok).toBe(true);
  });
});
