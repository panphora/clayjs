import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import postcss from "postcss";
import { generateSkin, validateSkinModule, extractTemplate } from "../../scripts/build-vendor-skins.mjs";
import { SKINS, LAYER } from "../../scripts/skin-manifest.mjs";
import * as quickcrop from "../../src/ui/skins/quickcrop.js";
import * as richclay from "../../src/ui/skins/richclay.js";
import * as cms from "../../src/ui/skins/cms.js";
import { FONT_MONO } from "../../src/ui/bevel.js";

/**
 * A vendor skin raises a vendor's own UI above the host page: one early cascade
 * layer, every declaration !important, the vendor's custom properties pinned to
 * Bevel's literal values. jsdom has no cascade, so these tests hold the text to that
 * contract; whether it wins on a real hostile page is the browser pass's question.
 */

const ROOT = new URL("../../", import.meta.url).pathname;
const BEVEL = readFileSync(join(ROOT, "tests/fixtures/bevel-excerpt.css"), "utf8");
const INTEGRATION = {
  quickcrop: readFileSync(join(ROOT, "tests/fixtures/bevel-integrations/quickcrop.css"), "utf8"),
  richclay: readFileSync(join(ROOT, "tests/fixtures/bevel-integrations/richclay.css"), "utf8"),
  cms: null,
};
const MODULES = { quickcrop, richclay, cms };
const NAMES = Object.keys(MODULES);
const vendorText = (name) => readFileSync(join(ROOT, SKINS[name].vendor.file), "utf8");
const sources = (name, patch = {}) => ({ vendorText: vendorText(name), integrationCss: INTEGRATION[name], bevelCss: BEVEL, ...patch });

// Parenthesised groups hold their own spaces and commas, so they are folded away
// before a selector is split into compounds.
function lastCompound(selector) {
  let flat = selector;
  while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, "_");
  return flat.split(/\s*[\s>+~]\s*/).filter(Boolean).pop();
}

function rules(css) {
  const out = [];
  postcss.parse(css).walkRules((rule) => {
    const media = rule.parent.type === "atrule" && rule.parent.name === "media" ? rule.parent.params : null;
    const decls = rule.nodes.filter((n) => n.type === "decl");
    out.push({ selectors: rule.selectors, media, decls });
  });
  return out;
}

function withoutSha(text) {
  return text.replace(/^export const SOURCE_SHA256 = .*$/m, "");
}

let counter = 0;
async function importText(text) {
  const file = join(tmpdir(), `vendor-skin-${process.pid}-${counter++}.mjs`);
  writeFileSync(file, text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(file, { force: true });
  }
}

describe.each(NAMES)("the %s skin", (name) => {
  const module = MODULES[name];

  test("is what the generator makes from the vendored bundle and Bevel", () => {
    expect(withoutSha(generateSkin(name, sources(name)))).toBe(
      withoutSha(readFileSync(join(ROOT, `src/ui/skins/${name}.js`), "utf8")));
  });

  test("is one @layer block whose every declaration is !important and resolved", () => {
    const root = postcss.parse(module.CSS);
    const top = root.nodes.filter((n) => n.type !== "comment");
    expect(top).toHaveLength(1);
    expect([top[0].type, top[0].name, top[0].params]).toEqual(["atrule", "layer", LAYER]);
    let count = 0;
    root.walkDecls((decl) => {
      count += 1;
      expect([decl.parent.selector, decl.prop, decl.important]).toEqual([decl.parent.selector, decl.prop, true]);
      expect(decl.value).not.toMatch(/var\(\s*--bevel-/i);
    });
    expect(count).toBeGreaterThan(30);
    expect(validateSkinModule(module)).toEqual([]);
  });

  test("names no Bevel marker class or attribute", () => {
    for (const rule of rules(module.CSS)) {
      for (const selector of rule.selectors) expect(selector).not.toMatch(/bevel/);
    }
  });

  test("pins every vendor token except the ones set at runtime", () => {
    const spec = SKINS[name];
    const vendorTokens = new Set();
    postcss.parse(extractTemplate(vendorText(name), spec.vendor.marker, name)).walkDecls((decl) => {
      if (decl.prop.startsWith(spec.prefix)) vendorTokens.add(decl.prop);
    });
    expect(vendorTokens.size).toBeGreaterThan(4);
    const base = `:is(${spec.roots.join(", ")})`;
    const scope = spec.themeHatch ? `${base}:not([data-theme])` : base;
    const pin = rules(module.CSS).find((rule) => rule.selectors.includes(scope) && rule.selectors.includes(`${scope} *`));
    expect(pin).toBeDefined();
    const pinned = new Set(pin.decls.map((decl) => decl.prop));
    for (const token of vendorTokens) {
      if ((spec.runtime ?? []).includes(token)) expect(pinned.has(token)).toBe(false);
      else expect([token, pinned.has(token)]).toEqual([token, true]);
    }
    for (const decl of pin.decls) expect(decl.value).not.toMatch(/var\(/);
  });

  test("every vendor var() it still reads is one it declares", () => {
    const prefix = SKINS[name].prefix;
    const declared = new Set();
    for (const rule of rules(module.CSS)) for (const decl of rule.decls) if (decl.prop.startsWith("--")) declared.add(decl.prop);
    const read = [...module.CSS.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]);
    for (const token of read) {
      expect(token.startsWith(prefix)).toBe(true);
      expect([token, declared.has(token)]).toEqual([token, true]);
    }
  });

  test("keeps a vendor's hidden attribute working wherever it sets display", () => {
    const all = rules(module.CSS);
    const hidden = new Set(all
      .filter((rule) => rule.decls.length === 1 && rule.decls[0].prop === "display" && rule.decls[0].value === "none")
      .flatMap((rule) => rule.selectors.map((selector) => `${rule.media}\n${selector}`)));
    let checked = 0;
    for (const rule of all) {
      const display = rule.decls.find((decl) => decl.prop === "display");
      if (!display || display.value === "none") continue;
      for (const selector of rule.selectors) {
        checked += 1;
        const at = selector.indexOf("::");
        const companion = at === -1 ? `${selector}[hidden]` : `${selector.slice(0, at)}[hidden]${selector.slice(at)}`;
        expect([selector, hidden.has(`${rule.media}\n${companion}`)]).toEqual([selector, true]);
      }
    }
    if (name !== "cms") expect(checked).toBeGreaterThan(2);
  });
});

describe("what a skin leaves alone", () => {
  test("no richclay rule styles edited prose", () => {
    let checked = 0;
    for (const rule of rules(richclay.CSS)) {
      for (const selector of rule.selectors) {
        checked += 1;
        const subject = lastCompound(selector);
        expect([selector, /richclay-(editor|inline)\b/.test(subject)]).toEqual([selector, false]);
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  test("the Block style button keeps the normal button width, and hover is Bevel's", () => {
    expect(richclay.CSS).not.toContain("118px");
    const hover = ":is(.richclay-toolbar, .richclay-float, .richclay-dialog) .richclay-button:hover:not([aria-pressed=\"true\"], [aria-expanded=\"true\"], :disabled)";
    expect(richclay.CSS).toContain(`${hover}{border-color:light-dark(#FFF9ED, #3C4260)`);
    expect(richclay.CSS).toContain(
      `${hover}{border-color:light-dark(#FFF9ED, #3C4260) light-dark(#D6C3A5, #1B2033) light-dark(#D6C3A5, #1B2033) light-dark(#FFF9ED, #3C4260) !important;background:color-mix(in srgb, light-dark(#F1E7D4, #22273E), light-dark(#FFF9ED, #3C4260) 45%) !important}`
    );
    expect(richclay.CSS).toContain(`${hover} .richclay-cut{stroke:color-mix(`);
  });

  test("the CMS skin is pins and a system face: it never pins a slider's runtime value and re-raises the chip's local tokens", () => {
    expect(cms.CSS).not.toMatch(/--mirk-value/);
    expect(cms.CSS).not.toMatch(/Departure Mono/);
    const all = rules(cms.CSS);
    expect(all).toHaveLength(3);
    const face = all.find((rule) => rule.decls.some((decl) => decl.prop === "font-family"));
    expect(face.selectors).toEqual([":is(.hcms-shell)"]);
    expect(face.decls.map((decl) => [decl.prop, decl.value])).toEqual([["font-family", FONT_MONO]]);
    const local = all.find((rule) => rule.selectors.includes(".hcms-shell .mirk-chip__actions .mirk-chip__action--primary"));
    expect(local.decls.map((decl) => decl.prop)).toEqual([
      "--mirk-bevel-bg", "--mirk-bevel-fg", "--mirk-bevel-tl", "--mirk-bevel-br", "--mirk-bevel-hover-bg",
    ]);
    for (const rule of all) {
      if (rule === face) continue;
      for (const decl of rule.decls) expect(decl.prop.startsWith("--mirk-")).toBe(true);
    }
  });

  test("the CMS names its webfont in its @font-face, on the shell and on the toggle, and nowhere else", () => {
    const named = [...vendorText("cms").matchAll(/font-family:\s*'Departure Mono'/g)];
    expect(named).toHaveLength(3);
    expect(vendorText("cms")).toMatch(/createElement\("hypercms-toggle"\);\w+\.className="hcms-shell /);
  });

  // A plain inline style loses to a page's !important rule, and a skin declaring the
  // property would freeze it, so inside a skin a vendor writes inline styles
  // !important (tests/unit/vendor-inline-important.test.js). The plain writes left
  // are each on an element no skin selector reaches, and the manifest names exactly
  // those.
  const PLAIN_WRITE = [/\.style\.([a-zA-Z]+)\s*=(?!=)/g, /style\.setProperty\(\s*["']([a-z-]+)["'][^)]*\)/g];
  const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

  test.each(["quickcrop", "richclay"])("%s: every plain inline style the vendor writes lands outside the skin", (name) => {
    const written = new Set();
    for (const re of PLAIN_WRITE) {
      for (const m of vendorText(name).matchAll(re)) if (!/important/.test(m[0])) written.add(kebab(m[1]));
    }
    expect([...written].sort()).toEqual(Object.keys(SKINS[name].inlineOutOfScope).sort());
  });

  test.each(["quickcrop", "richclay"])("%s: no skin rule declares an inline-written property on that element", (name) => {
    const spec = SKINS[name];
    const css = MODULES[name].CSS;
    let checked = 0;
    for (const entry of spec.inline) {
      for (const rule of rules(css)) {
        for (const selector of rule.selectors) {
          const subject = lastCompound(selector);
          if (subject.includes("::")) continue;
          const hit = entry.subject.startsWith(".") ? subject.includes(entry.subject) : subject.startsWith(entry.subject);
          if (!hit || (entry.within && !selector.includes(entry.within))) continue;
          checked += 1;
          for (const decl of rule.decls) expect([selector, entry.props.includes(decl.prop), decl.prop]).toEqual([selector, false, decl.prop]);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("an inline-written property is dropped from an armoured rule that would freeze it", () => {
    const text = vendorText("quickcrop").replace(".qc-mount{line-height:0;}", ".qc-mount{line-height:0;}.qc-box{left:5px;color:red;}");
    const module = generateSkin("quickcrop", sources("quickcrop", { vendorText: text }));
    expect(module).toMatch(/\.qc-box\{color:red !important\}/);
    expect(module).not.toMatch(/left:5px/);
  });

  test("the CMS pins stand back on a themed shell, so [data-theme] and full-volume still apply", () => {
    const pin = rules(cms.CSS).find((rule) => rule.decls.some((decl) => decl.prop === "--mirk-bg"));
    expect(pin.selectors).toEqual([":is(.hcms-shell):not([data-theme])", ":is(.hcms-shell):not([data-theme]) *"]);
  });
});

describe("drift fails the build", () => {
  test("a vendor rule nobody has classified", () => {
    const text = vendorText("quickcrop").replace(".qc-mount{line-height:0;}", ".qc-mount{line-height:0;}.qc-new{color:red;}");
    expect(() => generateSkin("quickcrop", sources("quickcrop", { vendorText: text }))).toThrow(/unlisted selector \.qc-new/);
  });

  test("a vendor token with no pin", () => {
    const css = INTEGRATION.richclay.replace(/\s*--richclay-danger: var\(--bevel-ox\);/, "");
    expect(() => generateSkin("richclay", sources("richclay", { integrationCss: css }))).toThrow(/--richclay-danger has no pin/);
  });

  test("a manifest entry the sources no longer have", () => {
    const text = vendorText("quickcrop").replace(".qc-mount{line-height:0;}", "");
    expect(() => generateSkin("quickcrop", sources("quickcrop", { vendorText: text }))).toThrow(/no longer have: \.qc-mount/);
  });

  test("a CMS rule that re-declares a pinned token on a descendant", () => {
    const text = vendorText("cms").replace("@layer base, components;", "@layer base, components;\n.hcms-shell .mirk-new { --mirk-bg: red; }");
    expect(() => generateSkin("cms", sources("cms", { vendorText: text }))).toThrow(/\.hcms-shell \.mirk-new re-declares a pinned token/);
  });

  test("a CMS descendant that sets its own face", () => {
    const text = vendorText("cms").replace("@layer base, components;", "@layer base, components;\n.hcms-shell .mirk-new { font-family: serif; }");
    expect(() => generateSkin("cms", sources("cms", { vendorText: text }))).toThrow(/\.hcms-shell \.mirk-new sets its own font-family/);
  });

  test("a checked-in module that lost its !important", async () => {
    const doctored = readFileSync(join(ROOT, "src/ui/skins/quickcrop.js"), "utf8").replace(".qc-mount{line-height:0 !important}", ".qc-mount{line-height:0}");
    expect(validateSkinModule(await importText(doctored)).join("\n")).toMatch(/\.qc-mount line-height is not !important/);
  });

  test("a richclay rule that styles inside edited prose, not only the prose root itself", () => {
    const manifest = SKINS.richclay;
    const skipped = Object.keys(manifest.skip ?? {}).find((selector) => /\.richclay-editor\s+\S/.test(selector));
    expect(skipped).toBeDefined();
    const reason = manifest.skip[skipped];
    delete manifest.skip[skipped];
    manifest.armor.push(skipped);
    try {
      expect(() => generateSkin("richclay", sources("richclay"))).toThrow(/styles prose/);
    } finally {
      manifest.skip[skipped] = reason;
      manifest.armor.splice(manifest.armor.indexOf(skipped), 1);
    }
  });
});
