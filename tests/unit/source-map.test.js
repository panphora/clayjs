/**
 * source-map: the file goes back out as the file.
 *
 * The claim this module makes is byte identity: a save that changes nothing changes
 * nothing. So the first test is a round trip over every piece of real HTML in this
 * repository, and the second one deliberately corrupts the renderer and demands that
 * the same round trip FAILS. A byte-identity test that cannot fail is the failure
 * mode this project has already hit once, when a check compared a render's output
 * against patches derived from that same output and passed with every byte of copying
 * switched off.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { model, checkSource, locate, pair, render, verify } from "../../src/core/source-map.js";

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

const CORPUS = [
  ...htmlFilesUnder("tests/fixtures"),
  ...htmlFilesUnder("conformance/fixtures"),
  ...htmlFilesUnder("examples"),
  ...htmlFilesUnder("website"),
].sort();

/**
 * One no-edit round trip: model the bytes, parse them to a document, pair, render the
 * document unchanged, verify.
 *
 * Identity is the node itself here rather than snapshot provenance, because there is
 * no clone: nothing has been edited, so the document IS the save clone. That is the
 * mechanism on its own, with the save pipeline out of the way.
 */
function roundTrip(src, opts = {}) {
  const doc = new DOMParser().parseFromString(src, "text/html");
  const m = model(src);
  const { map, stats } = pair(doc.documentElement, m);
  const out = render(doc.documentElement, map, m, (n) => n, opts);
  const today = "<!DOCTYPE html>" + doc.documentElement.outerHTML;
  return { text: out.text, verify: verify(out.text, today, doc, doc.documentElement, m.parseErrors), stats, doc };
}

test("the corpus is real and non-empty", () => {
  // A sweep that enumerated nothing reads exactly like a clean sweep.
  expect(CORPUS.length).toBeGreaterThan(50);
  expect(CORPUS.some((f) => f.startsWith("website/"))).toBe(true);
});

describe("a no-edit save returns the file, byte for byte", () => {
  test.each(CORPUS)("%s", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    const { text, verify: v } = roundTrip(src);
    expect(v.ok).toBe(true);
    expect(text).toBe(src);
  });
});

describe("and the same round trip fails when the renderer is corrupted", () => {
  // Without this, "every file round trips" is a claim about a test that may be
  // measuring itself. `drop-first-text` deletes one character of the first
  // non-whitespace text node, which changes the tree, which is precisely what the
  // verifier exists to catch.
  const withText = CORPUS.filter((f) => /\S/.test(stripTags(readFileSync(join(ROOT, f), "utf8"))));

  test("the corpus of files with text is non-empty", () => {
    expect(withText.length).toBeGreaterThan(20);
  });

  test.each(withText)("%s", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    const { text, verify: v } = roundTrip(src, { corrupt: "drop-first-text" });
    expect(text).not.toBe(src);
    expect(v.ok).toBe(false);
    expect(typeof v.diff).toBe("string");
  });
});

describe("and every file still reloads as itself when the text is printed, not copied", () => {
  // The third sweep, and the one that found a real defect. A parser moves whitespace
  // that follows an end tag INTO the last text node before it, so such a node's text
  // runs past its own parent. Copied, that is handled by clamping the range. Printed,
  // which is what happens the moment somebody edits that node, the relocated
  // characters were written a second time by the ancestor that owns those bytes, and
  // the document came back with an extra newline. 38 nodes in this corpus are clamped
  // that way. `breakText` prints every text node, so this sweep exercises all of them.
  //
  // Byte identity is the wrong assertion here (printing re-escapes `&` and `<`, which
  // copying does not), so the claim is the one that matters: the file reloads as the
  // same document.
  test.each(CORPUS)("%s", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    expect(roundTrip(src, { breakText: true }).verify.ok).toBe(true);
  });
});

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, "");
}

describe("bytes the browser's serializer would not have given back", () => {
  const cases = {
    "single quotes stay single": `<!DOCTYPE html><html><body><p class='lead' id='x'>hi</p></body></html>`,
    "unquoted stays unquoted": `<!DOCTYPE html><html><body><p class=lead>hi</p></body></html>`,
    "attribute order is the author's": `<!DOCTYPE html><html><body><a href="/x" id="a" class="b">hi</a></body></html>`,
    "a bare ampersand is left alone": `<!DOCTYPE html><html><body><p>Tom & Jerry</p></body></html>`,
    "an uppercase doctype keeps its case": `<!DOCTYPE HTML>\n<html><body><p>hi</p></body></html>`,
    "a legacy doctype survives": `<!DOCTYPE html SYSTEM "about:legacy-compat">\n<html><body><p>hi</p></body></html>`,
    "comments before <html> survive": `<!DOCTYPE html>\n<!-- built by hand -->\n<html><body><p>hi</p></body></html>`,
    "implied html, head and body stay implied": `<!DOCTYPE html>\n<p>no tags here</p>\n`,
    "a <pre> keeps its leading newline": `<!DOCTYPE html><html><body><pre>\nfirst line\n</pre></body></html>`,
    "indentation is untouched": `<!DOCTYPE html>\n<html>\n  <body>\n    <div>\n      <p>deep</p>\n    </div>\n  </body>\n</html>\n`,
    "a rendered space between inline elements survives": `<!DOCTYPE html><html><body><p>by <a>Ana</a> <a>Bo</a></p></body></html>`,
    "a rendered newline between inline elements survives": `<!DOCTYPE html><html><body><p>by <a>Ana</a>\n  <a>Bo</a></p></body></html>`,
    "a script's text is not re-escaped": `<!DOCTYPE html><html><body><script>if (a < b && c > d) x()</script></body></html>`,
    "a self-closing void element keeps its slash": `<!DOCTYPE html><html><body><img src="a.png" /><br /></body></html>`,
    "a template's content round trips": `<!DOCTYPE html><html><body><template><li class='row'>x</li></template></body></html>`,
    "an svg keeps its case": `<!DOCTYPE html><html><body><svg viewBox="0 0 8 8"><linearGradient id="g"/></svg></body></html>`,
    // Chromium found this one. With nothing between the last element and `</body>`, the
    // whitespace the parser relocates gives body a last text node whose range BEGINS
    // after the end tag, and the copy of the gap up to it wrote `</body>` a second time.
    // Every hand-written fixture above happens to have a newline there, which is why it
    // took a served file to show it.
    "an end tag with nothing before it is written once": `<!DOCTYPE html>\n<html>\n<body>\n  <p>hi</p>\n<script src="/x.js"></script></body>\n</html>\n`,
    "and the same with no trailing newline": `<!DOCTYPE html>\n<html>\n<body>\n  <p>hi</p></body>\n</html>`,
    "and the same with no end tags at all": `<!DOCTYPE html>\n<html>\n<body>\n  <p>hi</p>`,
    // parse5 renames a foreign-content attribute in the tree (`xmlns:xlink` arrives as
    // name `xlink` with prefix `xmlns`) but keys its location map, as the DOM keys
    // `attr.name`, by the name as written. Looked up by the renamed one, the attribute
    // had no source range, its bytes were copied inside the surrounding run anyway, and
    // the live copy was appended as if it were new.
    "a namespaced attribute is written once": `<!DOCTYPE html><html><body><svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/></svg></body></html>`,
    // A <form> written straight inside a <table> is inserted and popped in the same
    // step, so nothing ever closes it and parse5 reports its end offset at its own `<`.
    // The parent's copy cursor then rewound behind the tag it had just emitted.
    "a form inside a table is written once": `<!DOCTYPE html><html><body><table><form action="/x"></form><tr><td>c</td></tr></table></body></html>`,
    // An unquoted attribute value ends at whitespace or `>`, never at `/`, so this value
    // is `x/`. Read as the tag's self-closing slash it was cut off the value and written
    // again before the `>`, giving `<a href=x//>`.
    "an unquoted value may end in a slash": `<!DOCTYPE html><html><body><a href=x/>link</a></body></html>`,
    "and a real self-closing slash still survives": `<!DOCTYPE html><html><body><svg><use href="#a"/></svg></body></html>`,
    // The parser rewrites CRLF to LF before a text node sees it, so on a CRLF file the
    // raw bytes and the node's value can never be compared directly.
    "a CRLF file keeps its CRLFs": `<!DOCTYPE html>\r\n<html>\r\n<body>\r\n<p>hi</p>\r\n</body>\r\n</html>\r\n`,
  };

  test.each(Object.entries(cases))("%s", (_name, src) => {
    const { text, verify: v } = roundTrip(src);
    expect(v.ok).toBe(true);
    expect(text).toBe(src);
  });
});

describe("saving the same document again and again changes nothing", () => {
  // The shape of the three worst defects this module has had was identical, and a
  // single round trip is the weaker way to state it: the render added bytes, the TREE
  // was unchanged, so the verifier passed and the file grew by the same amount on
  // every save until somebody opened it. Re-modelling from the previous output is what
  // a real page does after each accepted save, so five rounds is five real saves.
  const cases = {
    "a namespaced attribute": `<!DOCTYPE html><html><head></head><body><svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/></svg></body></html>`,
    "a form inside a table": `<!DOCTYPE html><html><head></head><body><table><form action="/x"></form><tr><td>c</td></tr></table></body></html>`,
    "an unquoted value ending in a slash": `<!DOCTYPE html><html><head></head><body><a href=x/>link</a></body></html>`,
    "a CRLF document": `<!DOCTYPE html>\r\n<html>\r\n<head></head>\r\n<body>\r\n<p>hi</p>\r\n</body>\r\n</html>\r\n`,
  };

  test.each(Object.entries(cases))("%s", (_name, src) => {
    let cur = src;
    for (let round = 1; round <= 5; round++) {
      const { text, verify: v } = roundTrip(cur);
      expect(v.ok).toBe(true);
      expect(`round ${round}: ${text}`).toBe(`round ${round}: ${src}`);
      cur = text;
    }
  });

  test("and the same holds when every text node is printed instead of copied", () => {
    // The CRLF half of it. A relocated whitespace tail is stripped before printing by
    // comparing the node's value against the source bytes, and on a CRLF file that
    // comparison never matched, so the tail printed on top of the bytes it came from.
    const crlf = `<!DOCTYPE html>\r\n<html>\r\n<head></head>\r\n<body>\r\n<p>hi</p>\r\n</body>\r\n</html>\r\n`;
    const printed = roundTrip(crlf, { breakText: true });
    expect(printed.verify.ok).toBe(true);
    expect(printed.text).not.toContain("\n\n\n");
  });
});

describe("an edit reprints the edit and nothing else", () => {
  const SRC = [
    "<!DOCTYPE html>",
    "<html>",
    "  <body class='page'>",
    "    <ul id=list>",
    "      <li data-id='a'>alpha</li>",
    "      <li data-id='b'>beta</li>",
    "    </ul>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");

  function editAndRender(edit) {
    const doc = new DOMParser().parseFromString(SRC, "text/html");
    const m = model(SRC);
    const { map } = pair(doc.documentElement, m);
    edit(doc);
    const out = render(doc.documentElement, map, m, (n) => n);
    const today = "<!DOCTYPE html>" + doc.documentElement.outerHTML;
    return { text: out.text, verify: verify(out.text, today, doc, doc.documentElement) };
  }

  const changedLines = (a, b) => {
    const x = a.split("\n"), y = b.split("\n");
    let n = 0;
    for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) n++;
    return n;
  };

  test("changing text touches one line", () => {
    const { text, verify: v } = editAndRender((doc) => {
      doc.querySelector("[data-id='b']").textContent = "BETA";
    });
    expect(v.ok).toBe(true);
    expect(changedLines(SRC, text)).toBe(1);
    expect(text).toContain("<li data-id='b'>BETA</li>");
    expect(text).toContain("<ul id=list>");
  });

  test("changing an attribute keeps the author's quoting and touches one line", () => {
    const { text, verify: v } = editAndRender((doc) => {
      doc.querySelector("[data-id='a']").setAttribute("data-id", "z");
    });
    expect(v.ok).toBe(true);
    expect(changedLines(SRC, text)).toBe(1);
    expect(text).toContain("<li data-id='z'>alpha</li>");
  });

  test("adding an attribute appends it and leaves the rest of the tag alone", () => {
    const { text, verify: v } = editAndRender((doc) => {
      doc.querySelector("#list").setAttribute("hidden", "");
    });
    expect(v.ok).toBe(true);
    expect(changedLines(SRC, text)).toBe(1);
    expect(text).toContain("<ul id=list hidden>");
  });

  test("removing an attribute takes its leading whitespace with it", () => {
    const { text, verify: v } = editAndRender((doc) => {
      doc.querySelector("body").removeAttribute("class");
    });
    expect(v.ok).toBe(true);
    expect(text).toContain("<body>");
    expect(changedLines(SRC, text)).toBe(1);
  });

  test("inserting a row prints the row and copies its siblings", () => {
    const { text, verify: v } = editAndRender((doc) => {
      const li = doc.createElement("li");
      li.setAttribute("data-id", "c");
      li.textContent = "gamma";
      doc.querySelector("#list").appendChild(li);
    });
    expect(v.ok).toBe(true);
    expect(text).toContain(`<li data-id='a'>alpha</li>`);
    expect(text).toContain(`<li data-id='b'>beta</li>`);
    expect(text).toContain(`<li data-id="c">gamma</li>`);
  });

  test("deleting a row leaves the others in their original bytes", () => {
    const { text, verify: v } = editAndRender((doc) => {
      doc.querySelector("[data-id='a']").remove();
    });
    expect(v.ok).toBe(true);
    expect(text).not.toContain("alpha");
    expect(text).toContain("<li data-id='b'>beta</li>");
    expect(text).toContain("<ul id=list>");
  });

  test("a region a boot script rebuilt by innerHTML still pairs, and still copies", () => {
    // The case that never converged under the old design, which paired by object
    // identity: a script that rewrites a list on every load produces brand new nodes,
    // so every load reprinted that region and every save wrote the reprint back,
    // forever. Pairing runs after boot, and the signature tiers key on content rather
    // than on object identity, so the rebuilt region pairs to its own source bytes.
    const doc = new DOMParser().parseFromString(SRC, "text/html");
    const list = doc.querySelector("#list");
    list.innerHTML = list.innerHTML;               // the boot script, before pairing
    const m = model(SRC);
    const { map } = pair(doc.documentElement, m);
    const out = render(doc.documentElement, map, m, (n) => n);
    expect(verify(out.text, "<!DOCTYPE html>" + doc.documentElement.outerHTML, doc, doc.documentElement).ok).toBe(true);
    expect(out.text).toBe(SRC);
  });

  test("a region rebuilt AFTER pairing reprints once, and re-pairing takes it back", () => {
    // Honest about the limit: the map is keyed by node identity, so nodes replaced
    // after it was built are unknown and get printed. That is one save's worth of
    // reprint, not a permanent state, because an accepted save re-models and re-pairs.
    const doc = new DOMParser().parseFromString(SRC, "text/html");
    const m = model(SRC);
    const first = pair(doc.documentElement, m);
    const list = doc.querySelector("#list");
    list.innerHTML = list.innerHTML;               // runtime churn, after pairing
    const reprinted = render(doc.documentElement, first.map, m, (n) => n).text;
    expect(reprinted).not.toBe(SRC);
    expect(reprinted).toContain('data-id="a"');    // printed, so the quoting is the DOM's

    // What adopt does after an accepted save: model the bytes that landed, pair again.
    const adopted = model(reprinted);
    const again = pair(doc.documentElement, adopted);
    const settled = render(doc.documentElement, again.map, adopted, (n) => n).text;
    expect(settled).toBe(reprinted);               // converged: the next save changes nothing
  });
});

describe("the verifier compares trees, not bytes", () => {
  const SRC = `<!DOCTYPE html><html><body><p class='a'>hello</p></body></html>`;

  test("a render that reprints every text node still verifies, because the tree is identical", () => {
    // Worth being precise about: this is the verifier being RIGHT, not blind. The
    // bytes changed and the document did not, and the document is what it checks.
    const { text, verify: v } = roundTrip(SRC, { breakText: true });
    expect(v.ok).toBe(true);
    expect(text).toBe(SRC);
  });

  test("a render that reprints every tag still verifies, for the same reason", () => {
    const { text, verify: v } = roundTrip(SRC, { breakTags: true });
    expect(v.ok).toBe(true);
    // Reprinted, so the author's single quotes are gone: the bytes are today's bytes.
    expect(text).toContain('class="a"');
  });

  test("a render that changes the tree does not verify", () => {
    const { verify: v } = roundTrip(SRC, { corrupt: "drop-first-text" });
    expect(v.ok).toBe(false);
    expect(v.diff).toMatch(/text/);
  });
});

describe("<noscript>, the one block the two parsers disagree about", () => {
  // A browser parsed the page with scripting ON, so the live tree holds this block's
  // markup as one text node. DOMParser parses with scripting OFF, so reading the
  // rendered bytes back turns it into elements. The verifier therefore compares the
  // block's content through one parser. These tests exist to prove that branch did not
  // simply stop looking inside: Chromium found this, where a document with one
  // <noscript> failed verification on EVERY save.
  const SRC = `<!DOCTYPE html><html><head></head><body><noscript><p class='n'>no js</p></noscript><p>after</p></body></html>`;
  const setup = () => {
    const doc = new DOMParser().parseFromString(SRC, "text/html");
    return { doc, today: "<!DOCTYPE html>" + doc.documentElement.outerHTML };
  };

  test("the same block written with different quoting still verifies", () => {
    const { doc, today } = setup();
    const reprinted = SRC.replace(`<p class='n'>`, '<p class="n">');
    expect(reprinted).not.toBe(SRC);
    expect(verify(reprinted, today, doc, doc.documentElement).ok).toBe(true);
  });

  test("changing the text inside the block does NOT verify", () => {
    const { doc, today } = setup();
    const corrupted = SRC.replace("no js", "YES js");
    expect(verify(corrupted, today, doc, doc.documentElement).ok).toBe(false);
  });

  test("changing an attribute inside the block does NOT verify", () => {
    const { doc, today } = setup();
    const corrupted = SRC.replace(`class='n'`, `class='WRONG'`);
    expect(verify(corrupted, today, doc, doc.documentElement).ok).toBe(false);
  });

  test("dropping an element from inside the block does NOT verify", () => {
    const { doc, today } = setup();
    const corrupted = SRC.replace(`<p class='n'>no js</p>`, "no js");
    expect(verify(corrupted, today, doc, doc.documentElement).ok).toBe(false);
  });
});

describe("the check the tree comparison cannot make", () => {
  // A parser DISCARDS a repeated attribute instead of representing it, so a render that
  // wrote one twice reparses to exactly the right tree and the comparison passes. That
  // is not a gap in the verifier, it is what a tree comparison IS, and it is how the
  // same `xmlns:xlink` was written into a file on every save with everything green.
  const SRC = `<!DOCTYPE html><html><head></head><body><svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/></svg></body></html>`;
  const DOUBLED = SRC.replace(`xmlns:xlink="http://www.w3.org/1999/xlink">`, `xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xlink="http://www.w3.org/1999/xlink">`);

  const doc = () => new DOMParser().parseFromString(SRC, "text/html");
  const today = () => "<!DOCTYPE html>" + doc().documentElement.outerHTML;

  test("the trees really are identical, which is why this needed its own check", () => {
    expect(DOUBLED).not.toBe(SRC);
    expect(verify(DOUBLED, today(), doc(), null).ok).toBe(true);
  });

  test("and the source's own error counts reject it", () => {
    const v = verify(DOUBLED, today(), doc(), null, model(SRC).parseErrors);
    expect(v.ok).toBe(false);
    expect(v.diff).toMatch(/duplicate-attribute 0 -> 1/);
  });

  test("a file that already parses with errors is not rejected for keeping them", () => {
    // Counting, not presence. 4 of the 198 real user documents in the Stage 1 sweep
    // already parse with errors, and a render that copies them back is correct.
    const messy = `<!DOCTYPE html><html><body><p id="a" id="b">hi</p></body></html>`;
    const m = model(messy);
    expect(m.parseErrors.get("duplicate-attribute")).toBe(1);
    const d = new DOMParser().parseFromString(messy, "text/html");
    expect(verify(messy, "<!DOCTYPE html>" + d.documentElement.outerHTML, d, null, m.parseErrors).ok).toBe(true);
  });
});

describe("a map and a model that were not paired together are not trusted", () => {
  // The only way a loc's byte offsets may be used is if they came from the model whose
  // bytes are about to be sliced. Pairing stamps both with one token and render checks
  // it. Before that token existed the guard compared the loc's live node instead, which
  // is true for BOTH pairings when they ran against the same document, so a crossed map
  // and model sliced one file's offsets out of another file's bytes: this exact fixture
  // produced `<li data-id='a'>alalphaa-id='b'>beta`.
  const A = `<!DOCTYPE html><html><body><ul id=list><li data-id='a'>alpha</li></ul></body></html>`;
  const B = `<!DOCTYPE html><html><body><ul id="list"><li data-id="a">AAAAAAAAAAAAAAAA</li></ul></body></html>`;

  test("the crossed render copies no source bytes, so it is a full reprint", () => {
    const doc = new DOMParser().parseFromString(A, "text/html");
    const root = doc.documentElement;
    const mA = model(A);
    const mB = model(B);
    pair(root, mA);
    const { map: mapB } = pair(root, mB);

    const crossed = render(root, mapB, mA, (n) => n).text;
    const today = "<!DOCTYPE html>" + root.outerHTML;
    expect(crossed).toBe(today);                       // printed, not copied
    expect(crossed).not.toContain("alalpha");          // the corruption it used to emit
    expect(verify(crossed, today, doc, root).ok).toBe(true);
  });

  test("and the model's own map still copies, so the check is not simply refusing everything", () => {
    const doc = new DOMParser().parseFromString(A, "text/html");
    const root = doc.documentElement;
    const mA = model(A);
    const { map: mapA } = pair(root, mA);
    expect(render(root, mapA, mA, (n) => n).text).toBe(A);
  });
});

describe("checkSource refuses anything that is not this document", () => {
  const live = () => new DOMParser().parseFromString(`<!DOCTYPE html><html><body><p>real</p></body></html>`, "text/html");

  test("the document's own bytes are accepted", () => {
    expect(checkSource(model(`<!DOCTYPE html><html><body><p>real</p></body></html>`), live())).toBeNull();
  });

  test("content the parser moved out of a table is refused", () => {
    // Foster parenting takes content written inside a <table> that cannot go there and
    // puts it BEFORE the table, so the tree order and the byte order disagree. Every
    // copy here walks the source forward, so those bytes came out at the new position
    // and again inside the table. Such a page already fell back on every save, because
    // the duplicate changes the tree and the verifier caught it; refusing says so once
    // instead, and does not pay a render and a reparse per save to find out.
    const fostered = `<!DOCTYPE html><html><body><table><div>x</div><tr><td>c</td></tr></table></body></html>`;
    expect(checkSource(model(fostered), new DOMParser().parseFromString(fostered, "text/html")))
      .toMatch(/moved content out of/);
  });

  test("stray text inside a table is refused for the same reason", () => {
    const stray = `<!DOCTYPE html><html><body><table>oops<tr><td>c</td></tr></table></body></html>`;
    expect(checkSource(model(stray), new DOMParser().parseFromString(stray, "text/html")))
      .toMatch(/moved content out of/);
  });

  test("whitespace inside a table is NOT refused, so the check is not simply refusing tables", () => {
    const ok = `<!DOCTYPE html><html><body><table>\n  <tr><td>c</td></tr>\n</table></body></html>`;
    expect(checkSource(model(ok), new DOMParser().parseFromString(ok, "text/html"))).toBeNull();
  });

  test("a document with nothing inside <html> is refused", () => {
    // render brackets its whole output with the root's byte range, and a document with
    // no elements, text or comments at all gives the root no range to bracket with.
    // Unguarded, the trailing `keep(-1, src.length)` read as slice(-1), which is the
    // LAST BYTE of the source: `<!DOCTYPE html>` rendered as `>`.
    for (const src of [`<!DOCTYPE html>`, `<!DOCTYPE html>\n<!-- nothing -->\n`]) {
      expect(checkSource(model(src), new DOMParser().parseFromString(src, "text/html")))
        .toBe("source has no content inside <html>");
    }
  });

  test("a different doctype is refused", () => {
    expect(checkSource(model(`<!DOCTYPE html SYSTEM "about:legacy-compat"><html><body><p>real</p></body></html>`), live()))
      .toMatch(/outside <html>/);
  });

  test("a missing doctype is refused", () => {
    // The quirks-mode hole: without this, a source with no doctype renders a file
    // with no doctype, and the tree comparison, which starts at documentElement,
    // never looks.
    expect(checkSource(model(`<html><body><p>real</p></body></html>`), live())).toMatch(/outside <html>/);
  });

  test("an extra comment before <html> is refused", () => {
    expect(checkSource(model(`<!DOCTYPE html><!-- hi --><html><body><p>real</p></body></html>`), live()))
      .toMatch(/outside <html>/);
  });

  test("an error page with the same doctype is caught by the tree comparison instead", () => {
    // checkSource only guards what no tree comparison can see. A wrong document with
    // the right prologue gets past it, and then fails verify, which is the layer that
    // is supposed to catch it.
    const doc = live();
    const src = `<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1></body></html>`;
    const m = model(src);
    expect(checkSource(m, doc)).toBeNull();
    const { map } = pair(doc.documentElement, m);
    const out = render(doc.documentElement, map, m, (n) => n);
    const today = "<!DOCTYPE html>" + doc.documentElement.outerHTML;
    expect(verify(out.text, today, doc, doc.documentElement).ok).toBe(true);
    // ...and what it renders is the live document, not the fetched page: the bytes
    // that could not be paired are printed from the page rather than copied.
    expect(out.text).toContain("real");
    expect(out.text).not.toContain("502");
  });
});

describe("alignment does not blow up on a long list", () => {
  test("4,000 identical siblings pair in well under a second", () => {
    const rows = Array.from({ length: 4000 }, () => "    <li class='row'>item</li>").join("\n");
    const src = `<!DOCTYPE html>\n<html>\n  <body>\n  <ul>\n${rows}\n  </ul>\n  </body>\n</html>\n`;
    const started = Date.now();
    const { text, verify: v, stats } = roundTrip(src);
    const ms = Date.now() - started;
    expect(v.ok).toBe(true);
    expect(text).toBe(src);
    expect(stats.unmatchedLive).toHaveLength(0);
    // The exact-DP version this replaced took 84 seconds here and allocated a 256 MB
    // table. A lower bound is the only honest assertion about timing, so this is a
    // wide ceiling that only a return to quadratic behaviour can cross.
    expect(ms).toBeLessThan(5000);
  });
});


/**
 * locate(): the other half of the agent editing loop.
 *
 * A save that preserves the file is only half of what an agent needs; the other half is being able
 * to point at an element in the live page and get its range in those same bytes, so an edit can be
 * expressed as a source range instead of as a DOM mutation.
 *
 * Two things are worth more than the happy path here. The first is the UNITS: these are UTF-16 code
 * units into the string the model was built from, and on any document with non-ASCII content they
 * differ from byte offsets. An agent that hands them to a byte-oriented tool edits the wrong place,
 * silently, on some documents only. The last test in this block is the one that pins that.
 *
 * The second is that a wrong range is worse than no range. There is no verifier between locate() and
 * whatever the agent writes next, so every case this function cannot answer has to be null.
 */
describe("locate: where a live element is in the file", () => {
  const SRC = [
    "<!DOCTYPE html>",
    "<html>",
    "  <body>",
    '    <div class="card">',
    '      <p id="target">here</p>',
    "    </div>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");

  function mapped(src) {
    const doc = new DOMParser().parseFromString(src, "text/html");
    const m = model(src);
    const { map } = pair(doc.documentElement, m);
    return { doc, m, map, at: (node) => locate(node, map, m) };
  }

  test("the range slices out of the source as exactly that element, tags included", () => {
    const { doc, m, at } = mapped(SRC);
    expect(m.src.slice(at(doc.getElementById("target")).from, at(doc.getElementById("target")).to))
      .toBe('<p id="target">here</p>');
    const div = at(doc.querySelector(".card"));
    expect(m.src.slice(div.from, div.to)).toBe('<div class="card">\n      <p id="target">here</p>\n    </div>');
  });

  test("line and column are 1-based and land on the element's own `<`", () => {
    const { doc, m, at } = mapped(SRC);
    const loc = at(doc.getElementById("target"));
    expect(loc.line).toBe(5);
    expect(loc.column).toBe(7);
    // Tied back to the text independently of the arithmetic that produced them: the wrong line or
    // the wrong column both survive an assertion on the numbers alone.
    expect(m.src.split("\n")[loc.line - 1].slice(loc.column - 1)).toBe('<p id="target">here</p>');
  });

  test("a node the page created after boot is not in the file, and says so", () => {
    const { doc, at } = mapped(SRC);
    const fresh = doc.createElement("p");
    doc.getElementById("target").after(fresh);
    expect(at(fresh)).toBeNull();
  });

  test("an implied tag with nothing inside it has no bytes to point at", () => {
    const { doc, at } = mapped(SRC);
    expect(doc.head.childNodes).toHaveLength(0);
    expect(at(doc.head)).toBeNull();
    expect(at(doc.body)).not.toBeNull();
  });

  test("an implied tag WITH content locates to the bytes it occupies, which are its children's", () => {
    // Worth stating rather than hiding: the range is always the bytes this element occupies, and an
    // element the author never wrote occupies no tag bytes. Replacing the range still replaces the
    // whole element in both cases, which is the property a caller actually depends on.
    const src = "<!DOCTYPE html><html><title>t</title><p>hi</p></html>";
    const { doc, m, at } = mapped(src);
    const head = at(doc.head);
    const body = at(doc.body);
    expect(m.src.slice(head.from, head.to)).toBe("<title>t</title>");
    expect(m.src.slice(body.from, body.to)).toBe("<p>hi</p>");
  });

  test("a map and a model that were not paired together answer null, not a range into the wrong file", () => {
    const doc = new DOMParser().parseFromString(SRC, "text/html");
    const mA = model(SRC);
    const mB = model(SRC.replace("here", "AAAAAAAAAAAAAAAAAAAA"));
    const { map: mapA } = pair(doc.documentElement, mA);
    const { map: mapB } = pair(doc.documentElement, mB);
    const p = doc.getElementById("target");
    expect(locate(p, mapB, mA)).toBeNull();
    expect(locate(p, mapA, mA)).not.toBeNull();
  });

  test("and bytes that are no longer this element are null too, even when the generation matches", () => {
    const { doc, m, map } = mapped(SRC);
    const p = doc.getElementById("target");
    expect(locate(p, map, m)).not.toBeNull();
    // The generation stamp is the real guard, so reaching the backstop takes a model that claims to
    // be the one this map was paired against and holds different bytes. Same prefix, so the offsets
    // still land inside the string and the answer would be a plausible looking range for a <span>.
    const other = model(SRC.replace('<p id="target">here</p>', "<span>x</span>"));
    other.gen = m.gen;
    expect(locate(p, map, other)).toBeNull();
  });

  test("the offsets and the column are UTF-16 code units, not bytes and not code points", () => {
    const src = '<!DOCTYPE html>\n<html>\n<body>\n<p>caf\u00e9 \ud83c\udf89 na\u00efve</p><p id="target">here</p>\n</body>\n</html>\n';
    const { doc, m, at } = mapped(src);
    const loc = at(doc.getElementById("target"));
    expect(m.src.slice(loc.from, loc.to)).toBe('<p id="target">here</p>');
    const line = m.src.split("\n")[loc.line - 1];
    expect(line.slice(loc.column - 1)).toBe('<p id="target">here</p>');
    // Three different counts of the same prefix, and the API returns the middle one. A caller that
    // seeks this many BYTES into the file lands early, and one that counts code points lands late.
    const prefix = line.slice(0, loc.column - 1);
    expect(Buffer.byteLength(prefix, "utf8")).toBeGreaterThan(prefix.length);
    expect([...prefix]).not.toHaveLength(prefix.length);
  });
});
