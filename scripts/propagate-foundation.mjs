#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspace = path.dirname(repo)
const sources = ['region-capabilities.js', 'content-dom.js']
const consumers = ['hyper-html-api', 'hyper-morph', 'richclay', 'hyper-undo', 'hypercms']
const check = process.argv.includes('--check')
const header = file => `// GENERATED from clayjs/src/lib/${file}. Edit ClayJS and run \`npm run propagate:foundation\`.\n\n`

const destinations = consumers.flatMap(consumer => sources.map(file => ({
  source: path.join(repo, 'src/lib', file),
  destination: path.join(workspace, consumer, 'src/lib', file),
  label: `${consumer}/src/lib/${file}`,
  file,
})))

let failed = false
for (const item of destinations) {
  if (!fs.existsSync(path.dirname(item.destination))) {
    console.error(`Missing expected destination directory: ${path.dirname(item.destination)}`)
    failed = true
    continue
  }
  const expected = header(item.file) + fs.readFileSync(item.source, 'utf8')
  if (check) {
    const actual = fs.existsSync(item.destination) ? fs.readFileSync(item.destination, 'utf8') : null
    if (actual !== expected) {
      console.error(`Stale or missing: ${item.label}`)
      failed = true
    } else {
      console.log(`In sync: ${item.label}`)
    }
  } else {
    fs.writeFileSync(item.destination, expected)
    console.log(`Updated: ${item.label}`)
  }
}

if (failed) process.exit(1)
