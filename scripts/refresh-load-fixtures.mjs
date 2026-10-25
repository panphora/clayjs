#!/usr/bin/env node

// The Kanban and the Journal load fixtures are the shipped templates byte for byte:
// a budget over a stub would pass while the real file loads anything. Copy them from
// a starter-templates checkout, at a ref when one is named.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const value = flag => {
  const at = args.indexOf(flag)
  return at > -1 ? args[at + 1] : null
}
const from = path.resolve(value('--from') ?? process.env.STARTER_TEMPLATES ?? path.join(path.dirname(repo), 'starter-templates'))
const ref = value('--ref')
const check = args.includes('--check')

const COPIES = [
  { source: 'templates/01-kanban/kanban.html', destination: 'tests/fixtures/load/kanban.html' },
  { source: 'templates/00-journal/journal.html', destination: 'tests/fixtures/load/journal.html' },
]

let stale = false
for (const { source, destination } of COPIES) {
  const expected = ref
    ? execFileSync('git', ['-C', from, 'show', `${ref}:${source}`], { maxBuffer: 64 * 1024 * 1024 })
    : fs.readFileSync(path.join(from, source))
  const target = path.join(repo, destination)
  if (check) {
    const actual = fs.existsSync(target) ? fs.readFileSync(target) : null
    if (!actual || !actual.equals(expected)) {
      console.error(`Stale or missing: ${destination}`)
      stale = true
    } else {
      console.log(`In sync: ${destination}`)
    }
    continue
  }
  fs.writeFileSync(target, expected)
  console.log(`Updated: ${destination}`)
}
if (stale) process.exitCode = 1
