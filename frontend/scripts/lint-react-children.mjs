#!/usr/bin/env node
/**
 * Catches API fields that are objects being rendered as React children.
 *
 * Written after a real outage: `ThreadListSerializer.get_preview` returns
 * `{side, body}`, the admin inbox rendered `{row.preview || 'No messages yet'}`,
 * and React threw "Objects are not valid as a React child". With no error
 * boundary the whole tree unmounted and the page went white — while the server
 * logged nothing but 200s, so there was no trace of it anywhere.
 *
 * None of the existing checks could see it. It isn't an import error, a missing
 * export, or a contrast problem: it's a *type* mismatch across the API boundary,
 * and the frontend has no types.
 *
 * So this reads the DRF serializers, finds every `SerializerMethodField` whose
 * getter returns a dict or a list, and fails if the matching field name is
 * interpolated bare into JSX. It is narrow on purpose — a general "is this
 * expression an object" check needs a type system, but this specific shape is
 * the one that actually bit.
 *
 *   npm run lint:children
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const BACKEND = join(ROOT, '..', '..', 'Backend')

function walk(dir, test) {
  let out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'venv' || entry === '__pycache__') continue
    const full = join(dir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) out = out.concat(walk(full, test))
    else if (test(entry)) out.push(full)
  }
  return out
}

/* ------------------------------------------- object-valued serializer fields */

const objectFields = new Map() // field name -> "app/serializers.py"

let serializerFiles = []
try {
  serializerFiles = walk(BACKEND, (f) => f === 'serializers.py')
} catch {
  console.log('· backend not found next to the frontend; skipping')
  process.exit(0)
}

for (const file of serializerFiles) {
  const source = readFileSync(file, 'utf8')
  // def get_<field>(self, obj): ... return { or return [
  for (const m of source.matchAll(
    /def get_(\w+)\s*\([^)]*\):([\s\S]*?)(?=\n {4}def |\n{2}class |\nclass |$)/g,
  )) {
    const [, field, body] = m
    if (/\n\s*return\s*[{[]/.test(body)) {
      objectFields.set(field, relative(ROOT, file))
    }
  }
}

/* ------------------------------------------------- bare JSX interpolations */

const failures = []

for (const file of walk(SRC, (f) => /\.jsx?$/.test(f))) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')

  for (const [field, origin] of objectFields) {
    // `{something.field}` or `{something.field || 'fallback'}` as a child —
    // i.e. not followed by `.` (property access) or `?` (optional chain) and
    // not inside an attribute (`={`).
    const pattern = new RegExp(
      `(?<!=)\\{\\s*[\\w.?]+\\.${field}\\s*(\\|\\|[^}]*)?\\}`,
      'g',
    )
    for (const m of source.matchAll(pattern)) {
      const line = source.slice(0, m.index).split('\n').length
      failures.push({
        file: relative(ROOT, file),
        line,
        field,
        origin,
        snippet: lines[line - 1]?.trim().slice(0, 100),
      })
    }
  }
}

if (failures.length) {
  console.error(
    `\n✖ ${failures.length} object-valued field(s) rendered as a React child:\n`,
  )
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line}`)
    console.error(`    "${f.field}" is a dict/list from ${f.origin}`)
    console.error(`    ${f.snippet}`)
    console.error(`    → render a property of it, e.g. {x.${f.field}.body}\n`)
  }
  process.exit(1)
}

console.log(
  `✓ react children: ${objectFields.size} object-valued serializer field(s) ` +
    `(${[...objectFields.keys()].join(', ') || 'none'}) — none rendered bare`,
)
