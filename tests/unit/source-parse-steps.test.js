/**
 * @jest-environment node
 */

/**
 * source-parse-steps: a paused parse is the same parse.
 *
 * The save verifier is going to stop holding the main thread for a whole document's
 * parse, which is only safe if slicing changes nothing. So this sweep compares the
 * sliced forms against the one-shot parse the library ships with today, on every
 * piece of real HTML in the repository and on the boundaries where a parser carries
 * state across a chunk: a character reference split from its semicolon, a CRLF split
 * between its two characters, half of a surrogate pair, a duplicate attribute the
 * parser has already discarded, foster-parented text, misnested formatting, nested
 * templates, an unfinished comment. Same tree, same every source offset, same
 * ordered parse errors.
 *
 * It also pins what slicing is for: a timer still gets to run in the middle of a large
 * parse, and an abort hands back nothing adoptable. Resetting the parser between
 * chunks — the mistake this module exists to avoid — fails here.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { jest } from "@jest/globals";
import { parse } from "../../src/vendor/parse5.vendor.js";
import { parseAll, parseInSteps } from "../../src/source/parse-steps.js";

jest.setTimeout(60000);

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

// The same corpus source-map.test.js sweeps: every file the library can be asked to save.
const CORPUS = [
  ...htmlFilesUnder("tests/fixtures"),
  ...htmlFilesUnder("conformance/fixtures"),
  ...htmlFilesUnder("examples"),
  ...htmlFilesUnder("website"),
].sort();

// Both option sets src/core/source-map.js parses with: `model` keeps locations and
// counts errors by code, and `vParseErrors` asks for the count alone on the cheap path.
const MODEL_OPTIONS = () => ({ sourceCodeLocationInfo: true });
const VERIFY_OPTIONS = () => ({});

const CHUNKS = [1, 2, 7, 16, 4096];

let comparedNodes = 0;
let comparedErrors = 0;

/**
 * The tree and every source location, as text. `parentNode` is the only cycle, and
 * dropping it keeps `sourceCodeLocation` — including `startTag`/`endTag` — in the
 * comparison. Skips are forbidden: a replacer that silently dropped anything else
 * would hide exactly the difference this file is looking for.
 */
const shape = (doc) => JSON.stringify(doc, (key, value) => (key === "parentNode" ? undefined : value));

function countNodes(node) {
  let n = 1;
  for (const kid of node.childNodes || []) n += countNodes(kid);
  const content = node.content;
  return content ? n + countNodes(content) : n;
}

const counting = (errors) => errors.reduce((m, e) => m.set(e.code, (m.get(e.code) || 0) + 1), new Map());

/** One-shot parse with this file's error option shape, keeping the errors in order. */
function oneShot(html, options) {
  const errors = [];
  const doc = parse(html, { ...options, onParseError: (e) => errors.push(e) });
  return { shape: shape(doc), nodes: countNodes(doc), errors, counts: counting(errors) };
}

/**
 * `errors` is the ordered list the caller's own onParseError saw; `counts` is the Map
 * the sliced form returns, which is the shape `model` and `vParseErrors` keep.
 */
function same(actual, expected, label) {
  expect(actual.errors).toEqual(expected.errors);
  expect(actual.counts).toEqual(expected.counts);
  expect(actual.shape).toBe(expected.shape);
  expect(actual.nodes).toBe(expected.nodes);
  comparedNodes += actual.nodes;
  comparedErrors += actual.errors.length;
}

const seen = (options) => {
  const errors = [];
  return { errors, options: { ...options, onParseError: (e) => errors.push(e) } };
};

test("the corpus is real and non-empty", () => {
  expect(CORPUS.length).toBeGreaterThan(50);
  expect(CORPUS.some((f) => f.startsWith("website/"))).toBe(true);
});

describe("the whole source corpus, one-shot and sliced", () => {
  test.each(CORPUS)("%s", async (file) => {
    const html = readFileSync(join(ROOT, file), "utf8");
    for (const makeOptions of [MODEL_OPTIONS, VERIFY_OPTIONS]) {
      const expected = oneShot(html, makeOptions());
      const whole = seen(makeOptions());
      const all = parseAll(html, whole.options);
      same({ shape: shape(all.document), nodes: countNodes(all.document), errors: whole.errors, counts: all.errors }, expected, file);
      for (const chunk of CHUNKS) {
        const sliced = seen(makeOptions());
        const stepped = await parseInSteps(html, sliced.options, { chunk });
        expect(stepped.aborted).toBeUndefined();
        same({ shape: shape(stepped.document), nodes: countNodes(stepped.document), errors: sliced.errors, counts: stepped.errors }, expected, `${file} chunk ${chunk}`);
      }
    }
  });

  test("the sweep compared real documents and real parse errors", () => {
    expect(comparedNodes).toBeGreaterThan(10000);
    expect(comparedErrors).toBeGreaterThan(0);
  });
});

// The boundaries a parser carries state across. Every one of these has a place where a
// slice edge lands inside a token, a character reference, a line ending or a surrogate
// pair, which is where a parser that was reset between chunks would come apart.
const BOUNDARIES = [
  ["entities", "<!doctype html><p>&amp; &nbsp; &notit; &#x1F389; &unknown; &amp</p>"],
  ["crlf", "<!doctype html><pre>\r\na\r\nb\r</pre><p>x\r\ny</p>"],
  ["split surrogate pair", "<!doctype html><p>\u{1F389}\u{1F600}x\u2603</p>"],
  ["lone surrogate", "<!doctype html><p>a\uD800b</p>"],
  ["nul", "<!doctype html><p>a\u0000b</p>"],
  ["duplicate attributes", "<!doctype html><p a=\"1\" a=\"2\" class=x class=y>x</p>"],
  ["foster parenting", "<!doctype html><table>text<div>x</div><tr><td>cell</table>"],
  ["misnested formatting", "<!doctype html><p><b>one<i>two</b>three</i></p>"],
  ["nested templates", "<!doctype html><template><template><p>x</template></template>"],
  ["svg", "<!doctype html><svg xmlns:xlink=\"u\" xmlns:xlink=\"v\"><use xlink:href=\"#x\"/><foreignObject><p>x</p></foreignObject></svg>"],
  ["raw text", "<!doctype html><script>const s=\"<not-tag>\";</script><style>a{}</style><textarea>\n&amp;</textarea>"],
  ["noscript", "<!doctype html><noscript><p>fallback</p></noscript><noscript>plain</noscript>"],
  ["unfinished comment", "<!doctype html><!-- broken--!><p a=\"unterminated"],
  ["empty input", ""],
];

describe("the boundaries the seats list", () => {
  test.each(BOUNDARIES)("%s", async (name, html) => {
    for (const makeOptions of [MODEL_OPTIONS, VERIFY_OPTIONS]) {
      const expected = oneShot(html, makeOptions());
      const whole = seen(makeOptions());
      const all = parseAll(html, whole.options);
      same({ shape: shape(all.document), nodes: countNodes(all.document), errors: whole.errors, counts: all.errors }, expected, name);
      for (const chunk of CHUNKS) {
        const sliced = seen(makeOptions());
        const stepped = await parseInSteps(html, sliced.options, { chunk });
        same({ shape: shape(stepped.document), nodes: countNodes(stepped.document), errors: sliced.errors, counts: stepped.errors }, expected, `${name} chunk ${chunk}`);
      }
    }
  });

  test("empty input still ends the document stream", async () => {
    const stepped = await parseInSteps("", MODEL_OPTIONS(), { chunk: 4096 });
    expect(stepped.document).toBeTruthy();
    expect([...stepped.errors]).toEqual([["missing-doctype", 1]]);
    expect(shape(stepped.document)).toBe(shape(parse("", MODEL_OPTIONS())));
  });
});

// A document big enough that a whole parse would hold the thread for a while: the
// point of slicing is that timers, input and rendering keep running inside it.
function bigDocument(entries = 2800) {
  const parts = ["<!doctype html><html><head><title>big</title></head><body><main>"];
  for (let i = 0; i < entries; i++) {
    parts.push(`<article id="e${i}" data-n="${i}"><h2>Entry ${i}</h2><pre><code>${"lorem ipsum dolor sit amet ".repeat(25)}${i}</code></pre></article>`);
  }
  parts.push("</main></body></html>");
  return parts.join("");
}

describe("a large parse stays interruptible", () => {
  test("a timer fires while the parse is running", async () => {
    const html = bigDocument();
    expect(html.length).toBeGreaterThan(2_000_000);
    const expected = oneShot(html, MODEL_OPTIONS());
    let beats = 0;
    const heartbeat = setInterval(() => { beats++; }, 5);
    const sliced = seen(MODEL_OPTIONS());
    let stepped;
    try {
      stepped = await parseInSteps(html, sliced.options);
    } finally {
      clearInterval(heartbeat);
    }
    expect(beats).toBeGreaterThan(0);
    same({ shape: shape(stepped.document), nodes: countNodes(stepped.document), errors: sliced.errors, counts: stepped.errors }, expected, "big document");
  });

  test("the same document survives the smallest chunks", async () => {
    const html = bigDocument(20);
    const expected = oneShot(html, MODEL_OPTIONS());
    for (const chunk of [1, 7, 4096]) {
      const sliced = seen(MODEL_OPTIONS());
      const stepped = await parseInSteps(html, sliced.options, { chunk, budgetMs: 1 });
      same({ shape: shape(stepped.document), nodes: countNodes(stepped.document), errors: sliced.errors, counts: stepped.errors }, expected, `big document chunk ${chunk}`);
    }
  });

  test("an abort mid-parse returns nothing adoptable", async () => {
    const html = bigDocument();
    const controller = new AbortController();
    const yields = [];
    const stepped = await parseInSteps(html, MODEL_OPTIONS(), {
      chunk: 4096,
      signal: controller.signal,
      yieldTask: async () => {
        yields.push(1);
        if (yields.length === 3) controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    });
    expect(yields.length).toBeGreaterThanOrEqual(3);
    expect(stepped).toEqual({ aborted: true });
    expect(stepped.document).toBeUndefined();
    expect(stepped.errors).toBeUndefined();
  });
});
