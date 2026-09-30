// Generate src/ui/skins/<name>.js: a vendor's UI raised above the host page.
//
//   node scripts/build-vendor-skins.mjs          (npm run build:skins)
//   node scripts/build-vendor-skins.mjs --check  (npm run check:skins)
//
// A vendor (quickcrop, richclay, hypercms) draws its own UI with its own classes and a
// stylesheet of plain rules, so a host page's `button { all: unset !important }` wins.
// ClayJS never edits a vendor. Instead each skin is one `@layer clay-skin { ... }`
// block, installed as the first stylesheet in <head> (src/ui/vendor-skin.js), where
// every declaration is !important: important declarations in the earliest layer beat
// a page's unlayered !important and every later layer. Inside it, in this order:
//
//   1. pins: the vendor's custom properties set to Bevel's literal values on the
//      vendor's roots and every descendant, so `* { --qc-text: red !important }`
//      cannot recolour it;
//   2. Bevel's integration rules, rescoped from Bevel's own markers to the vendor's
//      root classes at equal specificity;
//   3. the vendor's own chrome rules, re-emitted. They come last because the vendor
//      appends its stylesheet after the page's, so it wins specificity ties there too;
//   4. a `[hidden]` companion for every rule that sets `display`, so a vendor that
//      hides with the attribute still can.
//
// Edited prose is never in a skin. Properties a vendor writes as inline styles are
// dropped from the rules that can match that element: an !important stylesheet
// declaration beats a plain inline style and would freeze it.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import postcss from 'postcss'
import { collapse, lookupIn, readTokens } from './build-bevel-subset.mjs'
import { LAYER, SKINS } from './skin-manifest.mjs'
import { FONT_MONO, FONT_SANS } from '../src/ui/bevel.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BEVEL = path.resolve(ROOT, '../bevel')
const OUT_DIR = path.join(ROOT, 'src/ui/skins')
const EXPORTS = ['CSS', 'ROOTS', 'SOURCE_SHA256']

// The CSS template literal a bundle ships, found by the text it opens with.
export function extractTemplate(text, marker, label) {
  const at = text.indexOf(marker)
  if (at === -1) throw new Error(`skins: ${label}: marker not found`)
  if (text.indexOf(marker, at + 1) !== -1) throw new Error(`skins: ${label}: marker is not unique`)
  if (text[at - 1] !== '`') throw new Error(`skins: ${label}: marker does not open a template literal`)
  let out = ''
  for (let i = at; i < text.length; i += 1) {
    const c = text[i]
    if (c === '`') return out
    if (c === '$' && text[i + 1] === '{') throw new Error(`skins: ${label}: template literal interpolates`)
    if (c !== '\\') { out += c; continue }
    const n = text[i + 1]
    i += 1
    if (n === 'u' && text[i + 1] === '{') {
      const end = text.indexOf('}', i)
      out += String.fromCodePoint(parseInt(text.slice(i + 2, end), 16))
      i = end
    } else if (n === 'u') {
      out += String.fromCharCode(parseInt(text.slice(i + 1, i + 5), 16))
      i += 4
    } else if (n === 'x') {
      out += String.fromCharCode(parseInt(text.slice(i + 1, i + 3), 16))
      i += 2
    } else if (n === '`' || n === '\\' || n === '$') {
      out += n
    } else if (n === 'n') {
      out += '\n'
    } else if (n !== '\n') {
      throw new Error(`skins: ${label}: unsupported escape \\${n}`)
    }
  }
  throw new Error(`skins: ${label}: unterminated template literal`)
}

// A selector split at its top-level combinators; parentheses and brackets hold theirs.
function compounds(selector) {
  const parts = []
  let depth = 0
  let current = ''
  for (const c of selector) {
    if (c === '(' || c === '[') depth += 1
    if (c === ')' || c === ']') depth -= 1
    if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) {
      if (current) parts.push(current)
      current = ''
      continue
    }
    current += c
  }
  if (current) parts.push(current)
  return parts
}

function hasToken(compound, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = token.startsWith('.') ? new RegExp(`${escaped}(?![\\w-])`) : new RegExp(`^${escaped}(?![\\w-])`)
  return re.test(compound)
}

// The element a selector styles: its last compound. A pseudo-element subject is not
// the element, so an inline style on the element cannot collide with it.
export function subjectMatches(selector, { subject, within }) {
  const parts = compounds(selector)
  const last = parts[parts.length - 1]
  if (last.includes('::')) return false
  if (!hasToken(last, subject)) return false
  return !within || parts.slice(0, -1).some(part => hasToken(part, within))
}

// :has() and :not() arguments are conditions on the element, not the element, so a
// toolbar that is followed by the editor is still the toolbar.
function withoutConditions(compound) {
  let out = compound
  for (const fn of [':has(', ':not(']) {
    for (let at = out.indexOf(fn); at !== -1; at = out.indexOf(fn)) {
      const end = closingParen(out, at + fn.length)
      out = out.slice(0, at) + out.slice(end + 1)
    }
  }
  return out
}

// Any compound naming a prose root: the subject itself, or an ancestor on the way to
// it, so `.richclay-editor p` is prose as surely as `.richclay-editor` is. Conditions
// inside :has()/:not() do not make the element prose.
function touchesProse(selector, prose) {
  return compounds(selector).some(part => {
    const bare = withoutConditions(part)
    return prose.some(token => bare.includes(token))
  })
}

export function withHidden(selector) {
  let depth = 0
  for (let i = 0; i < selector.length - 1; i += 1) {
    const c = selector[i]
    if (c === '(' || c === '[') depth += 1
    if (c === ')' || c === ']') depth -= 1
    if (depth === 0 && c === ':' && selector[i + 1] === ':') return `${selector.slice(0, i)}[hidden]${selector.slice(i)}`
  }
  return `${selector}[hidden]`
}

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

// Every var(--bevel-*) replaced by its literal. A var() naming the vendor's own token
// stays: it resolves at runtime against the pins, and against a vendor rule that
// re-declares it locally (the richclay rail shrinks --richclay-control-size).
function resolve(value, lookup, prefix, label) {
  let out = collapse(value)
  let from = 0
  for (let pass = 0; ; pass += 1) {
    const at = out.toLowerCase().indexOf('var(', from)
    if (at === -1) return out
    if (pass > 64) throw new Error(`skins: unresolvable var() in ${label}`)
    const end = closingParen(out, at + 4)
    if (end === -1) throw new Error(`skins: unbalanced var() in ${label}`)
    const inner = out.slice(at + 4, end)
    const comma = inner.indexOf(',')
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim()
    if (prefix && name.startsWith(prefix)) { from = end + 1; continue }
    if (!name.startsWith('--bevel-')) throw new Error(`skins: unsupported var(${name}) in ${label}`)
    const literal = lookup(name)
    if (literal === undefined) throw new Error(`skins: unknown token ${name} in ${label}`)
    out = out.slice(0, at) + literal + out.slice(end + 1)
    from = 0
  }
}

function applyRescope(selector, rescope) {
  let out = selector
  for (const [from, to] of rescope) out = out.split(from).join(to)
  return out
}

// Where a rule sits. Integration rules may sit in Bevel's `components` layer, which
// the skin flattens into its own; any rule may sit in an @media the manifest names.
function context(rule, spec, label, allowLayer) {
  let media = null
  for (let node = rule.parent; node && node.type !== 'root'; node = node.parent) {
    if (node.type !== 'atrule') throw new Error(`skins: nested rule under ${node.selector} in ${label}`)
    if (node.name === 'keyframes') return { keyframes: node.params }
    if (node.name === 'layer' && allowLayer && node.params.trim() === 'components') continue
    if (node.name === 'media' && media === null) {
      media = collapse(node.params)
      if (spec.skipMedia && spec.skipMedia[media]) return { skip: true }
      if (!spec.media.includes(media)) throw new Error(`skins: unlisted @media ${media} in ${label}`)
      continue
    }
    throw new Error(`skins: unsupported @${node.name} ${node.params} in ${label}`)
  }
  return { media }
}

function directDecls(rule, label) {
  const decls = []
  rule.each(node => {
    if (node.type === 'decl') decls.push(node)
    else if (node.type !== 'comment') throw new Error(`skins: nested rule inside ${rule.selector} in ${label}`)
  })
  return decls
}

function selectorsOf(rule) {
  return rule.selectors.map(collapse)
}

// One output rule per run of selectors that drop the same inline properties.
function emit(entries, media, selectors, decls, spec) {
  const groups = []
  for (const selector of selectors) {
    const dropped = new Set(spec.inline.filter(entry => subjectMatches(selector, entry)).flatMap(entry => entry.props))
    const key = [...dropped].sort().join(',')
    const group = groups.find(g => g.key === key)
    if (group) group.selectors.push(selector)
    else groups.push({ key, dropped, selectors: [selector] })
  }
  for (const group of groups) {
    const kept = decls.filter(decl => !group.dropped.has(decl.prop))
    if (kept.length) entries.push({ media, selectors: group.selectors, decls: kept })
  }
}

function makeTracker(spec, lists) {
  const used = new Set()
  return {
    use(name) { used.add(name) },
    stale() {
      const stale = []
      for (const list of lists) for (const name of list) if (!used.has(name)) stale.push(name)
      return stale
    },
  }
}

function vendorTokens(root, spec, label) {
  const names = new Set()
  root.walkDecls(decl => {
    if (decl.prop.startsWith(spec.prefix)) names.add(decl.prop)
  })
  if (names.size === 0) throw new Error(`skins: ${label}: no ${spec.prefix}* tokens found`)
  return names
}

function checkPins(pins, tokens, spec, label) {
  const runtime = spec.runtime ?? []
  for (const name of runtime) {
    if (!tokens.has(name)) throw new Error(`skins: ${label}: runtime token ${name} is not declared`)
    if (pins.has(name)) throw new Error(`skins: ${label}: runtime token ${name} must not be pinned`)
  }
  for (const name of tokens) {
    if (runtime.includes(name)) continue
    if (!pins.has(name)) throw new Error(`skins: ${label}: token ${name} has no pin`)
  }
  for (const name of pins.keys()) {
    if (!tokens.has(name)) throw new Error(`skins: ${label}: pin ${name} is not a vendor token`)
  }
}

function armorVendor(root, spec, lookup, entries, label) {
  const tracker = makeTracker(spec, [spec.armor, Object.keys(spec.skip).filter(s => !s.includes('bevel'))])
  root.walkAtRules('keyframes', rule => {
    if (!spec.keyframes.includes(rule.params)) throw new Error(`skins: unlisted @keyframes ${rule.params} in ${label}`)
  })
  root.walkRules(rule => {
    const where = context(rule, spec, label, false)
    if (where.keyframes) return
    const kept = []
    for (const selector of selectorsOf(rule)) {
      if (selector === ':root') {
        for (const decl of directDecls(rule, label)) {
          if (!decl.prop.startsWith(spec.prefix)) throw new Error(`skins: ${label}: :root declares ${decl.prop}`)
        }
        continue
      }
      if (where.skip) continue
      if (spec.skip[selector]) { tracker.use(selector); continue }
      if (!spec.armor.includes(selector)) throw new Error(`skins: ${label}: unlisted selector ${selector}`)
      if (touchesProse(selector, spec.prose)) throw new Error(`skins: ${label}: ${selector} styles prose`)
      tracker.use(selector)
      kept.push(selector)
    }
    if (!kept.length) return
    const decls = directDecls(rule, label).map(decl => ({ prop: decl.prop, value: resolve(decl.value, lookup, spec.prefix, label) }))
    emit(entries, where.media, kept, decls, spec)
  })
  return tracker
}

function integrate(root, spec, lookup, pins, entries, label) {
  const tracker = makeTracker(spec, [spec.integrationKeep, Object.keys(spec.skip).filter(s => s.includes('bevel'))])
  const scope = `:is(${spec.roots.join(', ')})`
  root.walkRules(rule => {
    const where = context(rule, spec, label, true)
    if (where.keyframes) throw new Error(`skins: ${label}: integration @keyframes`)
    const kept = []
    for (const selector of selectorsOf(rule)) {
      if (where.skip) continue
      if (selector === spec.tokenBlock.selector && where.media === null) {
        tracker.use(selector)
        const decls = []
        for (const decl of directDecls(rule, label)) {
          if (decl.prop.startsWith('--')) {
            if (!decl.prop.startsWith(spec.prefix)) throw new Error(`skins: ${label}: token block declares ${decl.prop}`)
            pins.set(decl.prop, resolve(decl.value, lookup, null, label))
          } else if (spec.tokenBlock.keep.includes(decl.prop)) {
            decls.push({ prop: decl.prop, value: resolve(decl.value, lookup, spec.prefix, label) })
          }
        }
        if (decls.length) emit(entries, null, [scope], decls, spec)
        continue
      }
      if (selector === spec.tokenBlock.selector) continue
      if (spec.skip[selector]) { tracker.use(selector); continue }
      if (!spec.integrationKeep.includes(selector)) throw new Error(`skins: ${label}: unlisted selector ${selector}`)
      tracker.use(selector)
      const rescoped = applyRescope(selector, spec.rescope)
      if (/bevel/.test(rescoped)) throw new Error(`skins: ${label}: ${selector} still names Bevel after rescoping`)
      if (touchesProse(rescoped, spec.prose)) throw new Error(`skins: ${label}: ${selector} styles prose`)
      kept.push(rescoped)
    }
    if (!kept.length) return
    const decls = directDecls(rule, label).map(decl => ({ prop: decl.prop, value: resolve(decl.value, lookup, spec.prefix, label) }))
    emit(entries, where.media, kept, decls, spec)
  })
  return tracker
}

function localRules(root, spec, pins, entries, label) {
  const tracker = makeTracker(spec, [spec.local])
  root.walkRules(rule => {
    for (let node = rule.parent; node && node.type !== 'root'; node = node.parent) {
      if (node.type === 'atrule' && node.name === 'keyframes') return
    }
    const decls = directDecls(rule, label).filter(decl => pins.has(decl.prop))
    if (!decls.length) return
    for (const selector of selectorsOf(rule)) {
      if (compounds(selector).length === 1) continue
      if (!spec.local.includes(selector)) throw new Error(`skins: ${label}: ${selector} re-declares a pinned token`)
      tracker.use(selector)
      entries.push({ media: null, selectors: [selector], decls: decls.map(decl => ({ prop: decl.prop, value: collapse(decl.value) })) })
    }
  })
  return tracker
}

// A skin that swaps the vendor's face states it once, on the roots. Every other
// font-family the vendor declares has to inherit, or the swap would miss it.
function fontEntry(root, spec, label) {
  if (!spec.font) return []
  const value = { mono: FONT_MONO, sans: FONT_SANS }[spec.font]
  if (!value) throw new Error(`skins: ${label}: unknown font ${spec.font}`)
  root.walkDecls('font-family', decl => {
    if (decl.parent.type === 'atrule' && decl.parent.name === 'font-face') return
    if (collapse(decl.value) === 'inherit') return
    for (const selector of selectorsOf(decl.parent)) {
      if (!spec.roots.includes(selector)) throw new Error(`skins: ${label}: ${selector} sets its own font-family`)
    }
  })
  return [{ media: null, selectors: [`:is(${spec.roots.join(', ')})`], decls: [{ prop: 'font-family', value }] }]
}

function companions(entries) {
  const seen = new Set()
  const out = []
  for (const entry of entries) {
    const display = entry.decls.find(decl => decl.prop === 'display')
    if (!display || display.value === 'none') continue
    for (const selector of entry.selectors) {
      const hidden = withHidden(selector)
      const key = `${entry.media}\n${hidden}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ media: entry.media, selectors: [hidden], decls: [{ prop: 'display', value: 'none' }] })
    }
  }
  return out
}

function render(entries) {
  const lines = []
  let open = null
  for (const entry of entries) {
    if (entry.media !== open) {
      if (open !== null) lines.push('}')
      if (entry.media !== null) lines.push(`@media ${entry.media}{`)
      open = entry.media
    }
    const body = entry.decls.map(decl => `${decl.prop}:${decl.value} !important`).join(';')
    lines.push(`${entry.selectors.join(',')}{${body}}`)
  }
  if (open !== null) lines.push('}')
  return `@layer ${LAYER}{\n${lines.join('\n')}\n}`
}

// sources: { vendorText, integrationCss, bevelCss }
export function generateSkin(name, sources) {
  const spec = SKINS[name]
  if (!spec) throw new Error(`skins: no skin named ${name}`)
  const label = name
  const tokens = readTokens(postcss.parse(sources.bevelCss))
  const lookup = lookupIn(tokens)
  const vendorCss = extractTemplate(sources.vendorText, spec.vendor.marker, label)
  const vendorRoot = postcss.parse(vendorCss)
  const vendorNames = vendorTokens(vendorRoot, spec, label)

  const pins = new Map()
  const integration = []
  const armor = []
  const trackers = []
  if (spec.integration) {
    trackers.push(integrate(postcss.parse(sources.integrationCss), spec, lookup, pins, integration, label))
  }
  for (const [prop, value] of Object.entries(spec.pins)) {
    if (pins.has(prop)) throw new Error(`skins: ${label}: ${prop} is pinned twice`)
    pins.set(prop, resolve(value, lookup, null, label))
  }
  checkPins(pins, vendorNames, spec, label)

  const local = []
  if (spec.integration) trackers.push(armorVendor(vendorRoot, spec, lookup, armor, label))
  else trackers.push(localRules(vendorRoot, spec, pins, local, label))

  for (const tracker of trackers) {
    const stale = tracker.stale()
    if (stale.length) throw new Error(`skins: ${label}: manifest names selectors the sources no longer have: ${stale.join(' | ')}`)
  }

  const scope = `:is(${spec.roots.join(', ')})`
  const pinScope = spec.themeHatch ? `${scope}:not([data-theme])` : scope
  const pinEntry = { media: null, selectors: [pinScope, `${pinScope} *`], decls: [...pins].map(([prop, value]) => ({ prop, value })) }
  const body = [pinEntry, ...fontEntry(vendorRoot, spec, label), ...local, ...integration, ...armor]
  const entries = [...body, ...companions(body)]
  const css = render(entries)
  if (/var\(\s*--bevel-/i.test(css)) throw new Error(`skins: ${label}: a var(--bevel-*) survived`)

  const sha = crypto.createHash('sha256')
    .update(vendorCss).update('\0').update(sources.integrationCss ?? '').update('\0').update(sources.bevelCss)
    .digest('hex')
  const header = `// GENERATED from ${spec.vendor.file}${spec.integration ? ` and bevel/${spec.integration}` : ''} by scripts/build-vendor-skins.mjs. Run \`npm run build:skins\`.`
  return [
    header,
    `export const SOURCE_SHA256 = ${JSON.stringify(sha)};`,
    `export const ROOTS = ${JSON.stringify(spec.roots)};`,
    `export const CSS = ${JSON.stringify(css)};`,
    '',
  ].join('\n')
}

// What a checked-in skin module has to be when the sources are not here to rebuild it.
export function validateSkinModule(module) {
  const problems = []
  if (!module) return ['module does not load']
  for (const name of EXPORTS) if (module[name] === undefined) problems.push(`missing export ${name}`)
  if (typeof module.CSS !== 'string') return problems
  let root
  try {
    root = postcss.parse(module.CSS)
  } catch (error) {
    return [...problems, `CSS does not parse: ${error.message}`]
  }
  const top = root.nodes.filter(node => node.type !== 'comment')
  if (top.length !== 1 || top[0].type !== 'atrule' || top[0].name !== 'layer' || top[0].params !== LAYER) {
    problems.push(`CSS is not one @layer ${LAYER} block`)
  }
  let count = 0
  root.walkDecls(decl => {
    count += 1
    if (!decl.important) problems.push(`${decl.parent.selector} ${decl.prop} is not !important`)
    if (/var\(\s*--bevel-/i.test(decl.value)) problems.push(`${decl.parent.selector} ${decl.prop} contains var(--bevel-*)`)
  })
  if (count === 0) problems.push('CSS declares nothing')
  return problems
}

function sourcesFor(name) {
  const spec = SKINS[name]
  return {
    vendorText: fs.readFileSync(path.join(ROOT, spec.vendor.file), 'utf8'),
    integrationCss: spec.integration ? fs.readFileSync(path.join(BEVEL, spec.integration), 'utf8') : null,
    bevelCss: fs.readFileSync(path.join(BEVEL, 'bevel.css'), 'utf8'),
  }
}

async function main() {
  const check = process.argv.includes('--check')
  const names = Object.keys(SKINS)
  if (!fs.existsSync(path.join(BEVEL, 'bevel.css'))) {
    if (!check) {
      console.log('bevel/bevel.css not found beside clayjs')
      process.exit(1)
    }
    let failed = false
    for (const name of names) {
      const file = path.join(OUT_DIR, `${name}.js`)
      const module = await import(pathToFileURL(file).href).catch(() => null)
      const problems = validateSkinModule(module)
      if (problems.length) {
        failed = true
        console.error(`src/ui/skins/${name}.js: ${problems.join('; ')}`)
      }
    }
    if (failed) process.exit(1)
    console.log('source not available, checked-in src/ui/skins used')
    return
  }
  let stale = false
  for (const name of names) {
    const file = path.join(OUT_DIR, `${name}.js`)
    const label = `src/ui/skins/${name}.js`
    const generated = generateSkin(name, sourcesFor(name))
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
    if (check) {
      if (current === generated) console.log(`In sync: ${label}`)
      else {
        stale = true
        console.log(`Stale: ${label} (run npm run build:skins)`)
      }
      continue
    }
    if (current === generated) {
      console.log(`Unchanged: ${label}`)
      continue
    }
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(file, generated)
    console.log(`Updated: ${label}`)
  }
  if (stale) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
