import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { generate, validateModule } from "../../scripts/build-bevel-subset.mjs";
import { FONT_SANS, TOKEN_NAMES, RECIPES } from "../../scripts/bevel-manifest.mjs";

/**
 * src/ui/bevel.js is the slice of Bevel that ClayJS injects into somebody else's
 * page as inline !important declarations. Two things have to hold for that to
 * look like the design kit on a hostile page: every var(--bevel-*) is already a
 * literal by the time it is written down (a page rule setting --bevel-ink cannot
 * reach it), and the recipe list is closed — a rename or a deleted rule in
 * bevel/bevel.css must break the build rather than ship half a subset.
 *
 * The generator's output is real ESM, so the tests run it: written to a temp
 * .mjs and imported, never picked apart with regexes.
 */

const ROOT = new URL("../../", import.meta.url).pathname;
const FIXTURE = readFileSync(join(ROOT, "tests/fixtures/bevel-excerpt.css"), "utf8");

let counter = 0;
async function load(text) {
  const file = join(tmpdir(), `bevel-subset-${process.pid}-${counter++}.mjs`);
  writeFileSync(file, text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(file, { force: true });
  }
}

const OPEN_LAYER = "@layer components {\n  .x, .bevel-button:hover { color: red; }\n";
const HOVER = "  .bevel-button:hover { background: color-mix(in srgb, var(--bevel-face), var(--bevel-edge-hi) 45%); }\n";

let subset;
let split;

beforeAll(async () => {
  subset = await load(generate(FIXTURE));
  split = await load(generate(FIXTURE.replace("@layer components {", OPEN_LAYER)));
});

test("tokens: the manifest list, every one a light-dark() pair", () => {
  expect(Object.keys(subset.TOKENS).sort()).toEqual([...TOKEN_NAMES].sort());
  expect(Object.keys(subset.TOKENS)).toHaveLength(28);
  for (const value of Object.values(subset.TOKENS)) {
    expect(value).toMatch(/^light-dark\(#[0-9A-Fa-f]{6}, #[0-9A-Fa-f]{6}\)$/);
  }
});

test("no leaks: nothing is left for the page to resolve or download", () => {
  for (const text of [generate(FIXTURE), readFileSync(join(ROOT, "src/ui/bevel.js"), "utf8")]) {
    for (const needle of ["var(", "IBM Plex", "Newsreader", "@import", "url("]) {
      expect(text).not.toContain(needle);
    }
  }
});

test("pressed edges: the bevel swaps its corners", () => {
  const hi = subset.TOKENS["edge-hi"];
  const lo = subset.TOKENS["edge-lo"];
  expect(subset.RULES.button).toContain(`border-color:${hi} ${lo} ${lo} ${hi}`);
  expect(subset.RULES.buttonActive).toContain(`border-color:${lo} ${hi} ${hi} ${lo}`);
});

test("primary: ink acts, with the bevel mixed off the ink", () => {
  const primary = subset.RULES.buttonPrimary;
  expect(primary).toContain(`background:${subset.TOKENS.ink}`);
  expect(primary).toContain(`color:${subset.TOKENS.ground}`);
  const border = primary.find((decl) => decl.startsWith("border-color:"));
  expect(border).toContain(`color-mix(in srgb, ${subset.TOKENS.ink}, white 24%)`);
  expect(border).toContain(`color-mix(in srgb, ${subset.TOKENS.ink}, black 32%)`);
});

test("recess: a pressed toolbar icon is a body, not a lip", () => {
  const edge = subset.TOKENS["edge-in"];
  const edgeHi = subset.TOKENS["edge-in-hi"];
  expect(subset.RULES.recess).toEqual([
    "border:2px solid",
    `border-color:${edge} ${edgeHi} ${edgeHi} ${edge}`,
    `background:${subset.TOKENS["face-in"]}`,
  ]);
});

test("fonts: the system stack, not Bevel's webfonts", () => {
  expect(FONT_SANS).toBe('system-ui,-apple-system,"Segoe UI",sans-serif');
  expect(subset.RULES.button).toContain(`font-family:${FONT_SANS}`);
});

test("selector split: a comma inside :where(:not(a, b)) is not a rule boundary", () => {
  expect(split.RULES.buttonHover).toHaveLength(2);
  expect(split.RULES.buttonHover).toContain("color:red");
  expect(split.RULES.buttonHover).toContain(subset.RULES.buttonHover[0]);
  const hi = subset.TOKENS["edge-hi"];
  const lo = subset.TOKENS["edge-lo"];
  expect(split.RULES.buttonActive).toEqual([`border-color:${lo} ${hi} ${hi} ${lo}`]);
});

test("a renamed token upstream throws instead of shipping a stale value", () => {
  expect(() => generate(FIXTURE.replace("--bevel-teal-soft", "--bevel-teal-mist"))).toThrow(/teal-soft/);
});

test("a deleted rule upstream throws instead of shipping a partial recipe", () => {
  const withoutHover = FIXTURE.replace(HOVER, "");
  expect(withoutHover).not.toBe(FIXTURE);
  expect(() => generate(withoutHover)).toThrow(/buttonHover/);
});

test("deterministic, and the checked-in module is the shape the injector expects", async () => {
  expect(generate(FIXTURE)).toBe(generate(FIXTURE));
  const checked = await load(readFileSync(join(ROOT, "src/ui/bevel.js"), "utf8"));
  expect(checked.SOURCE_SHA256).toMatch(/^[0-9a-f]{64}$/);
  expect(typeof checked.FONT_SANS).toBe("string");
  expect(typeof checked.FONT_MONO).toBe("string");
  expect(typeof checked.SHADOW).toBe("string");
  expect(Object.keys(checked.TOKENS)).toEqual([...Object.keys(subset.TOKENS)]);
  expect(Object.keys(checked.RULES)).toEqual([...Object.keys(RECIPES), "surface"]);
  expect(Object.keys(checked.MEDIA)).toEqual(["reducedMotion", "forcedColors"]);
});

/**
 * The states a variant button is drawn in are recipes of their own: a danger
 * button hovering off the default cream edges, or a primary pressing into the
 * card, has no contrast at all. The rules below are the ones bevel/bevel.css
 * writes for those states, read with the variant's own --bevel-* overrides.
 */

test("variant states: a danger hover mixes the ox face, not the default cream", () => {
  const face = subset.TOKENS["ox-face"];
  const edge = subset.TOKENS["ox-edge-hi"];
  expect(subset.RULES.buttonDangerHover).toEqual([`background:color-mix(in srgb, ${face}, ${edge} 45%)`]);
  expect(subset.RULES.buttonDangerHover.join(" ")).not.toContain(subset.TOKENS.face);
  expect(subset.RULES.buttonPrimaryHoverBase).toEqual([
    `background:color-mix(in srgb, ${subset.TOKENS.ink}, color-mix(in srgb, ${subset.TOKENS.ink}, white 24%) 45%)`,
  ]);
});

test("variant states: the primary and the danger press into their own edges", () => {
  const ink = subset.TOKENS.ink;
  const primaryEdge = `color-mix(in srgb, ${ink}, white 24%)`;
  const primaryFloor = `color-mix(in srgb, ${ink}, black 32%)`;
  expect(subset.RULES.buttonPrimaryActive).toEqual([
    `border-color:${primaryFloor} ${primaryEdge} ${primaryEdge} ${primaryFloor}`,
  ]);
  expect(subset.RULES.buttonPrimaryActive[0]).toContain(`color-mix(in srgb, light-dark(#2B241B, #ECEAF2)`);
  expect(subset.RULES.buttonDangerActive).toEqual([
    `border-color:${subset.TOKENS["ox-edge-lo"]} ${subset.TOKENS["ox-edge-hi"]} ${subset.TOKENS["ox-edge-hi"]} ${subset.TOKENS["ox-edge-lo"]}`,
  ]);
});

test("variant states: quiet presses to a transparent border", () => {
  expect(subset.RULES.buttonQuietActive).toEqual(["border-color:transparent"]);
});

/**
 * var() is read by hand: a value may be written `var(--x, fallback)`, `var( --x )`
 * or with a function in the fallback, and none of those may reach the module. A
 * name this build cannot resolve is an error, never a silent pass-through and never
 * the fallback: the fallback is the value the recipe would quietly degrade to.
 */

const SMALL = "font-size: 14px; padding: 3px 11px;";

test("var forms: whitespace and a fallback resolve to the token, not the fallback", async () => {
  const forms = await load(generate(FIXTURE.replace(SMALL, "font-size: var( --bevel-face ); padding: var(--bevel-brass, #c90);")));
  expect(forms.RULES.buttonSmall).toContain(`font-size:${subset.TOKENS.face}`);
  expect(forms.RULES.buttonSmall).toContain(`padding:${subset.TOKENS.brass}`);
  expect(forms.RULES.buttonSmall.join(" ")).not.toContain("#c90");
});

test("var forms: a name that cannot be resolved throws with the name in it", () => {
  expect(() => generate(FIXTURE.replace(SMALL, "font-size: var(--bevel-nope, red);"))).toThrow(/nope/);
  expect(() => generate(FIXTURE.replace(SMALL, "font-size: var(--other);"))).toThrow(/--other/);
});

/**
 * A recipe is an unconditional declaration list. A rule behind @supports, @container
 * or an @media the recipe did not ask for is conditional, so it is not that recipe;
 * a second rule for the same selector, or CSS nesting, cannot be expressed in a flat
 * list at all and has to throw rather than pick a winner.
 */

const insideComponents = (block) => FIXTURE.replace("@layer components {\n", `@layer components {\n${block}\n`);

test("context: a rule behind @supports, @container or a dotted layer is not the recipe", async () => {
  const supports = await load(generate(insideComponents('  @supports (display:grid) { .bevel-button { opacity:0; } }')));
  const container = await load(generate(insideComponents('  @container bevel-button (min-width: 1px) { .bevel-button { opacity:0; } }')));
  const dotted = await load(generate(insideComponents('  @layer buttons { .bevel-button { opacity:0; } }')));
  expect(supports.RULES.button).toEqual(subset.RULES.button);
  expect(container.RULES.button).toEqual(subset.RULES.button);
  expect(dotted.RULES.button).toEqual(subset.RULES.button);
});

test("context: nesting and a second rule for one selector are refused", async () => {
  const nested = FIXTURE.replace("  .bevel-button {\n    display: inline-flex;", "  .bevel-button {\n    @media (min-width:1px) { opacity:0; }\n    display: inline-flex;");
  expect(nested).not.toBe(FIXTURE);
  expect(() => generate(nested)).toThrow(/nested rule inside \.bevel-button is not supported \(button\)/);

  const conflicting = insideComponents("  .bevel-button { background: red; }");
  expect(() => generate(conflicting)).toThrow(/conflicting declarations for background in \.bevel-button \(button\)/);

  const added = await load(generate(insideComponents("  .bevel-button { opacity: .9; }")));
  expect(added.RULES.button).toContain("opacity:.9");
  expect(added.RULES.button).toContain(subset.RULES.button[0]);
});

test("split variant: a variant's declarations may arrive in two rules", async () => {
  const color = "    color: var(--bevel-ground);\n  }\n  .bevel-button--primary:hover";
  expect(FIXTURE).toContain(color);
  const splitPrimary = FIXTURE.replace(color, "  }\n  .bevel-button--primary { color: var(--bevel-ground); }\n  .bevel-button--primary:hover");
  const mod = await load(generate(splitPrimary));
  expect(mod.RULES.buttonPrimary).toEqual(subset.RULES.buttonPrimary);
});

/**
 * A variant's overrides can name each other. Resolved against the root palette they
 * would resolve to the wrong material, and a pair that names each other would never
 * terminate, so the recursion is explicit and the cycle is an error.
 */

test("override references: a variant's token resolves among its own overrides", async () => {
  const hi = "    --bevel-edge-hi: color-mix(in srgb, var(--bevel-ink), white 24%);";
  const chained = await load(generate(FIXTURE.replace(hi, "    --bevel-edge-hi: var(--bevel-face);")));
  const ink = chained.TOKENS.ink;
  const floor = `color-mix(in srgb, ${ink}, black 32%)`;
  expect(chained.RULES.buttonPrimary).toContain(`border-color:${ink} ${floor} ${floor} ${ink}`);
  expect(chained.RULES.buttonPrimary.join(" ")).not.toContain(chained.TOKENS.face);
});

test("override references: a two-token cycle throws with the recipe named", () => {
  const pair = "    --bevel-face: var(--bevel-ink);\n    --bevel-edge-hi: color-mix(in srgb, var(--bevel-ink), white 24%);";
  const cyclic = FIXTURE.replace(pair, "    --bevel-face: var(--bevel-edge-hi);\n    --bevel-edge-hi: var(--bevel-face);");
  expect(cyclic).not.toBe(FIXTURE);
  expect(() => generate(cyclic)).toThrow(/token cycle in \.bevel-button--primary: --bevel-face -> --bevel-edge-hi -> --bevel-face/);
});

/**
 * Check mode. An explicit source that is not there is a typo, not a request to
 * validate the checked-in module; and with no source at all the module itself is
 * validated, every export the controls import by name.
 */

const SCRIPT = join(ROOT, "scripts/build-bevel-subset.mjs");
const runScript = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

test("check mode: an explicit mistyped source fails, and --source without a value is usage", () => {
  const missing = runScript(["--check", "--source", "/nonexistent-bevel-dir/bevel.css"]);
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain("bevel/bevel.css not found at /nonexistent-bevel-dir/bevel.css");
  const bare = runScript(["--check", "--source"]);
  expect(bare.status).toBe(1);
  expect(bare.stderr).toContain("usage:");
});

test("check mode: the checked-in module passes its own validation", () => {
  const run = runScript(["--check", "--module", join(ROOT, "src/ui/bevel.js")]);
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  expect(run.stdout).toContain("checked-in src/ui/bevel.js used");
});

test("check mode: a module missing an export the controls import is named", async () => {
  const scratch = join(tmpdir(), `bevel-subset-missing-${process.pid}.mjs`);
  const text = readFileSync(join(ROOT, "src/ui/bevel.js"), "utf8").replace(/^export const FONT_SANS = .*$/m, "");
  expect(text).not.toContain(FONT_SANS);
  writeFileSync(scratch, text);
  try {
    const module = await import(pathToFileURL(scratch).href);
    expect(validateModule(module)).toEqual([expect.stringContaining("FONT_SANS")]);
    const run = runScript(["--check", "--module", scratch]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("FONT_SANS");
  } finally {
    rmSync(scratch, { force: true });
  }
});

test("check mode: a leaked var() or a token that is not a light-dark() pair is named", async () => {
  const checked = await load(readFileSync(join(ROOT, "src/ui/bevel.js"), "utf8"));
  expect(validateModule(checked)).toEqual([]);
  const leaked = { ...checked, RULES: { ...checked.RULES, button: ["width:var(--bevel-face)"] } };
  expect(validateModule(leaked)).toEqual([expect.stringMatching(/RULES\.button\[0\] contains var\(\)/)]);
  const bad = { ...checked, TOKENS: { ...checked.TOKENS, face: "red" } };
  expect(validateModule(bad).join(" ")).toMatch(/TOKENS\.face is not a light-dark\(\) pair/);
  const short = { ...checked, RULES: { ...checked.RULES, buttonSmall: ["font-size"] } };
  expect(validateModule(short).join(" ")).toMatch(/RULES\.buttonSmall\[0\] is not a prop:value/);
});

test("input: a field is a surface with a line, focus draws brass on the edge", () => {
  const t = subset.TOKENS;
  expect(subset.RULES.input).toEqual(expect.arrayContaining([
    `font-family:${FONT_SANS}`,
    `color:${t.ink}`,
    `background:${t.surface}`,
    `border:1px solid ${t["line-2"]}`,
    "border-radius:0",
  ]));
  expect(subset.RULES.inputHover).toEqual([`border-color:${t.faint}`]);
  expect(subset.RULES.inputFocus).toEqual([
    `outline:2px solid ${t.brass}`,
    "outline-offset:1px",
    `border-color:${t.brass}`,
  ]);
});
