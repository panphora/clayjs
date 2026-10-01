// Generate src/ui/bevel.js: the slice of bevel/bevel.css that ClayJS injects into
// a host page, as literal `prop:value` declarations with every --bevel-* resolved.
//
//   node scripts/build-bevel-subset.mjs          (npm run build:bevel)
//   node scripts/build-bevel-subset.mjs --check  (npm run check:bevel)
//
// ClayJS writes this UI into somebody else's page as inline !important
// declarations, so a host rule like `* { --bevel-ink: red !important }` must not
// be able to recolour it: nothing here may still contain a var() by the time it
// ships. The CSS itself is read with postcss, never with regexes; a regex only
// ever finds a var() inside a value that postcss already handed us.
//
// A recipe only ever copies a rule whose whole ancestor chain is the layer (and,
// for a media recipe, the media) the manifest names. A conditional rule — inside
// @supports, @container, @starting-style, @scope, or an @media the recipe did not
// ask for — is not the rule the recipe means, so it does not match; merging it
// in would ship the unconditional declaration under a condition that is false.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import postcss from 'postcss'
import { FONT_SANS, FONT_MONO, FONT_SERIF, SHADOW, TOKEN_NAMES, RECIPES, SURFACE, MEDIA } from './bevel-manifest.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src/ui/bevel.js')
const OUT_LABEL = 'src/ui/bevel.js'
const DEFAULT_SOURCE = path.resolve(ROOT, '../bevel/bevel.css')
const HEADER = '// GENERATED from bevel/bevel.css by scripts/build-bevel-subset.mjs. Run `npm run build:bevel`.\n'
const SPECIAL = { 'font-sans': FONT_SANS, 'font-mono': FONT_MONO, 'font-serif': FONT_SERIF, shadow: SHADOW }
const USAGE = 'usage: node scripts/build-bevel-subset.mjs [--check] [--source <path>] [--module <path>]'
// Everything src/ui/bevel-controls.js reads out of src/ui/bevel.js. Inline styles
// are the only styling ClayJS can trust on a hostile page, so a module missing any
// of these must fail the check rather than render half a control at runtime.
const EXPORTS = ['RULES', 'MEDIA', 'FONT_SANS', 'FONT_MONO', 'TOKENS', 'SHADOW', 'SOURCE_SHA256']

export function collapse(value) {
  return value.replace(/\s+/g, ' ').trim()
}

// A rule matches only if every at-rule above it is the one the recipe permits:
// `layer` (null means the rule must not be layered) and `media` (null means it
// must not be inside a media block). A dotted layer path is compared whole, so
// `components` never matches `components.buttons`.
function matches(rule, layer, media) {
  const path = []
  let inMedia = null
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type === 'root') break
    if (node.type !== 'atrule') return false
    if (node.name === 'layer') {
      if (!node.params) return false
      path.unshift(node.params.trim())
      continue
    }
    if (node.name === 'media' && node.params) {
      if (inMedia !== null) return false
      inMedia = collapse(node.params)
      continue
    }
    return false
  }
  return (path.length > 0 ? path.join('.') : null) === layer && inMedia === media
}

// rule.selectors is postcss's splitter: it keeps a comma inside :where(:not(a, b))
// or [x="a,b"] as one selector, which a regex over the raw text would not.
function rulesFor(root, selector, layer, media, recipe) {
  const found = []
  root.walkRules(rule => {
    if (!matches(rule, layer, media)) return
    if (!rule.selectors.includes(selector)) return
    found.push(rule)
  })
  if (found.length === 0) throw new Error(`bevel: no rule for ${recipe} (${selector})`)
  return found
}

// The direct declarations of a matched rule, in source order. `walkDecls` would
// reach into CSS nesting, where the nested rule's declarations sit behind an
// ancestor condition this generator cannot carry, so nesting is refused outright.
function directDecls(rule, recipe) {
  const decls = []
  rule.each(node => {
    if (node.type === 'decl') decls.push(node)
    else if (node.type !== 'comment') throw new Error(`bevel: nested rule inside ${rule.selector} is not supported (${recipe})`)
  })
  return decls
}

// Every matched rule for one recipe, merged in source order: two rules for the
// same selector are a cascade, and a generator that emits one flat declaration
// list cannot express which of the two wins, so a disagreement is an error.
function collect(rules, selector, recipe, custom, cascade = false) {
  const entries = []
  const seen = new Map()
  for (const rule of rules) {
    for (const decl of directDecls(rule, recipe)) {
      if (decl.prop.startsWith('--') !== custom) continue
      const value = collapse(decl.value)
      const previous = seen.get(decl.prop)
      if (previous !== undefined && previous !== value) {
        if (!cascade) throw new Error(`bevel: conflicting declarations for ${decl.prop} in ${selector} (${recipe})`)
        entries.find(entry => entry.prop === decl.prop).value = value
      }
      seen.set(decl.prop, value)
      if (previous === undefined) entries.push({ prop: decl.prop, value })
    }
  }
  return entries
}

// The index of the `)` that closes the `(` just before `from`, counting nesting
// so `var(--x, color-mix(in srgb, a, b))` reads to its own end.
function closingParen(text, from) {
  let depth = 1
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

// Every var() in a value, replaced by its literal. `lookup` resolves a custom
// property name (override map first, then the page tokens, then the three
// non-colour constants). A fallback is only ever there for a name this build
// insists on resolving: if the name is unknown the fallback is a second, lighter
// value the recipe would silently degrade to, so it throws instead.
function substitute(value, recipe, lookup) {
  let out = collapse(value)
  for (let pass = 0; ; pass += 1) {
    const at = out.toLowerCase().indexOf('var(')
    if (at === -1) return out
    if (pass > 64) throw new Error(`bevel: unresolvable var() in ${recipe}`)
    const end = closingParen(out, at + 4)
    if (end === -1) throw new Error(`bevel: unbalanced var() in ${recipe}`)
    const inner = out.slice(at + 4, end)
    const comma = inner.indexOf(',')
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim()
    const literal = lookup(name)
    if (literal === undefined) {
      if (!name.startsWith('--bevel-')) throw new Error(`bevel: unsupported var(${name}) in ${recipe}`)
      throw new Error(`bevel: unknown token ${name} in ${recipe}`)
    }
    out = out.slice(0, at) + literal + out.slice(end + 1)
  }
}

export function lookupIn(tokens, overrides) {
  return name => {
    if (!name.startsWith('--bevel-')) return undefined
    const token = name.slice('--bevel-'.length)
    if (overrides && overrides.has(token)) return overrides.get(token)
    if (tokens.has(token)) return tokens.get(token)
    return SPECIAL[token]
  }
}

// A variant's own --bevel-* declarations. They are collected raw first, because
// one can define another (`.bevel-button--primary { --bevel-edge-hi: var(--bevel-face) }`):
// resolving them against the root palette instead would emboss the primary in
// cream rather than in ink. Resolution is recursive with a cycle guard.
function variantOverrides(rules, tokens, recipe, selector) {
  const raw = new Map(collect(rules, selector, recipe, true)
    .filter(entry => entry.prop.startsWith('--bevel-'))
    .map(entry => [entry.prop.slice('--bevel-'.length), entry.value]))
  const resolved = new Map()
  const stack = []
  const lookup = name => {
    if (!name.startsWith('--bevel-')) return undefined
    const token = name.slice('--bevel-'.length)
    if (raw.has(token)) return resolveToken(token)
    if (tokens.has(token)) return tokens.get(token)
    return SPECIAL[token]
  }
  function resolveToken(token) {
    if (resolved.has(token)) return resolved.get(token)
    const at = stack.indexOf(token)
    if (at !== -1) {
      const cycle = [...stack.slice(at), token].map(name => `--bevel-${name}`).join(' -> ')
      throw new Error(`bevel: token cycle in ${selector}: ${cycle}`)
    }
    stack.push(token)
    try {
      const out = substitute(raw.get(token), recipe, lookup)
      resolved.set(token, out)
      return out
    } finally {
      stack.pop()
    }
  }
  for (const token of raw.keys()) resolveToken(token)
  return resolved
}

function declarations(entries, tokens, overrides, recipe, options = {}) {
  const lookup = lookupIn(tokens, overrides)
  if (options.keep) {
    for (const prop of options.keep) {
      if (!entries.some(entry => entry.prop === prop)) throw new Error(`bevel: ${recipe} keeps ${prop}, which no rule declares`)
    }
  }
  const kept = []
  for (const entry of entries) {
    if (options.keep && !options.keep.includes(entry.prop)) continue
    const value = substitute(entry.value, recipe, lookup)
    if (/var\(/i.test(value)) throw new Error(`bevel: unresolved var() in ${recipe}`)
    kept.push(`${entry.prop}:${value}`)
  }
  return options.prepend ? [...options.prepend, ...kept] : kept
}

// The :root colour tokens, checked against the manifest so a rename in Bevel cannot
// quietly ship a subset with a stale token list.
export function readTokens(root) {
  const tokens = new Map()
  for (const rule of rulesFor(root, ':root', 'base', null, 'tokens')) {
    for (const decl of directDecls(rule, 'tokens')) {
      if (!decl.prop.startsWith('--bevel-')) continue
      if (!collapse(decl.value).startsWith('light-dark(')) continue
      tokens.set(decl.prop.slice('--bevel-'.length), collapse(decl.value))
    }
  }
  const names = [...tokens.keys()].filter(name => !name.startsWith('syn-'))
  const added = names.filter(name => !TOKEN_NAMES.includes(name)).map(name => `+${name}`)
  const removed = TOKEN_NAMES.filter(name => !names.includes(name)).map(name => `-${name}`)
  if (added.length > 0 || removed.length > 0) {
    throw new Error(`bevel: token set changed: ${[...added, ...removed].join(' ')}`)
  }
  return tokens
}

function renderRecipe(name, spec, root, tokens) {
  if (spec.variantOf) {
    const layer = spec.layer ?? 'components'
    const variant = rulesFor(root, spec.variantOf, layer, null, name)
    const overrides = variantOverrides(variant, tokens, name, spec.variantOf)
    const base = collect(rulesFor(root, RECIPES.button.selector, layer, null, name), RECIPES.button.selector, name, false)
    return declarations([...base, ...collect(variant, spec.variantOf, name, false)], tokens, overrides, name)
  }
  const layer = spec.layer ?? 'components'
  const overrides = spec.withOverridesOf
    ? variantOverrides(rulesFor(root, spec.withOverridesOf, layer, null, name), tokens, name, spec.withOverridesOf)
    : null
  const entries = collect(rulesFor(root, spec.selector, layer, null, name), spec.selector, name, false, spec.cascade === true)
  return declarations(entries, tokens, overrides, name, spec)
}

function literalArray(lines, name, values) {
  lines.push(`  ${JSON.stringify(name)}: [`)
  for (const value of values) lines.push(`    ${JSON.stringify(value)},`)
  lines.push('  ],')
}

export function generate(cssText) {
  const root = postcss.parse(cssText)
  const tokens = readTokens(root)
  const ordered = Object.fromEntries(TOKEN_NAMES.map(name => [name, tokens.get(name)]))

  const rules = Object.entries(RECIPES).map(([name, spec]) => [name, renderRecipe(name, spec, root, tokens)])
  rules.push(['surface', SURFACE(ordered)])
  const media = Object.entries(MEDIA).map(([name, spec]) => [
    name,
    rulesFor(root, spec.selector, null, collapse(spec.media), name)
      .flatMap(rule => declarations(collect([rule], spec.selector, name, false), tokens, null, name)),
  ])

  const sha = crypto.createHash('sha256').update(cssText).digest('hex')
  const lines = [HEADER.trimEnd()]
  lines.push(`export const SOURCE_SHA256 = ${JSON.stringify(sha)};`)
  lines.push(`export const FONT_SANS = ${JSON.stringify(FONT_SANS)};`)
  lines.push(`export const FONT_MONO = ${JSON.stringify(FONT_MONO)};`)
  lines.push(`export const SHADOW = ${JSON.stringify(SHADOW)};`)
  lines.push('export const TOKENS = {')
  for (const name of TOKEN_NAMES) lines.push(`  ${JSON.stringify(name)}: ${JSON.stringify(ordered[name])},`)
  lines.push('};')
  lines.push('export const RULES = {')
  for (const [name, values] of rules) literalArray(lines, name, values)
  lines.push('};')
  lines.push('export const MEDIA = {')
  for (const [name, values] of media) literalArray(lines, name, values)
  lines.push('};')
  return `${lines.join('\n')}\n`
}

// What the checked-in module has to be for the controls to use it: every export
// they import, every token a light-dark() pair, every rule a literal prop:value.
export function validateModule(module) {
  const problems = []
  if (!module) return ['module does not load']
  for (const name of EXPORTS) {
    if (module[name] === undefined) problems.push(`missing export ${name}`)
  }
  if (module.SOURCE_SHA256 !== undefined && (typeof module.SOURCE_SHA256 !== 'string' || !/^[0-9a-f]{64}$/.test(module.SOURCE_SHA256))) {
    problems.push('SOURCE_SHA256 is not a sha256 digest')
  }
  if (module.TOKENS !== undefined) {
    for (const [name, value] of Object.entries(module.TOKENS)) {
      if (typeof value !== 'string' || !/^light-dark\(#[0-9A-Fa-f]{6}, #[0-9A-Fa-f]{6}\)$/.test(value)) {
        problems.push(`TOKENS.${name} is not a light-dark() pair`)
      }
    }
    const names = Object.keys(module.TOKENS)
    for (const name of TOKEN_NAMES) if (!names.includes(name)) problems.push(`TOKENS.${name} is missing`)
  }
  for (const key of ['RULES', 'MEDIA']) {
    for (const [name, values] of Object.entries(module[key] ?? {})) {
      if (!Array.isArray(values)) {
        problems.push(`${key}.${name} is not an array`)
        continue
      }
      values.forEach((line, at) => {
        if (typeof line !== 'string' || !/^[a-zA-Z-]+:[^;]+$/.test(line)) problems.push(`${key}.${name}[${at}] is not a prop:value string`)
        else if (/var\(/i.test(line)) problems.push(`${key}.${name}[${at}] contains var()`)
      })
    }
  }
  for (const name of [...Object.keys(RECIPES), 'surface']) {
    if (!Array.isArray(module.RULES?.[name])) problems.push(`RULES.${name} is missing`)
  }
  for (const name of Object.keys(MEDIA)) {
    if (!Array.isArray(module.MEDIA?.[name])) problems.push(`MEDIA.${name} is missing`)
  }
  return problems
}

async function checkWithoutSource(modulePath = OUT) {
  const module = await import(pathToFileURL(modulePath).href).catch(() => null)
  const problems = validateModule(module)
  const label = modulePath === OUT ? OUT_LABEL : modulePath
  if (problems.length > 0) {
    console.error(`${label}: ${problems.join('; ')}`)
    process.exit(1)
  }
  console.log('source not available, checked-in src/ui/bevel.js used')
}

// A flag whose value is missing (or is the next flag) is a typo, not a request to
// read a file called "--check".
function optionValue(argv, flag) {
  const at = argv.indexOf(flag)
  if (at === -1) return null
  const value = argv[at + 1]
  if (value === undefined || value.startsWith('--')) {
    console.error(`${flag} needs a path\n${USAGE}`)
    process.exit(1)
  }
  return value
}

async function main() {
  const argv = process.argv.slice(2)
  const check = argv.includes('--check')
  const explicitSource = optionValue(argv, '--source')
  const modulePath = optionValue(argv, '--module')

  if (modulePath) {
    await checkWithoutSource(path.resolve(modulePath))
    return
  }

  const source = explicitSource === null ? DEFAULT_SOURCE : path.resolve(explicitSource)
  if (!fs.existsSync(source)) {
    if (explicitSource !== null) {
      console.error(`bevel/bevel.css not found at ${source}`)
      process.exit(1)
    }
    if (check) {
      await checkWithoutSource()
      return
    }
    console.log('bevel/bevel.css not found beside clayjs')
    process.exit(1)
  }

  const generated = generate(fs.readFileSync(source, 'utf8'))
  if (check) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null
    if (current === generated) {
      console.log(`In sync: ${OUT_LABEL}`)
      return
    }
    console.log(`Stale: ${OUT_LABEL} (run npm run build:bevel)`)
    process.exit(1)
  }

  if (fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === generated) {
    console.log(`Unchanged: ${OUT_LABEL}`)
    return
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, generated)
  console.log(`Updated: ${OUT_LABEL}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
