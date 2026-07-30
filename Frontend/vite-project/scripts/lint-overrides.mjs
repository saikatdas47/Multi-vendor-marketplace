#!/usr/bin/env node
/**
 * Fails when a colour utility is passed to a primitive that already sets one.
 *
 * Written after the hero's "Start shopping" button vanished. It was styled with
 * `<Button className="bg-white text-brand-900">`, and the assumption — stated in
 * a comment in lib/cn.js, which made it look deliberate — was that a later class
 * in the attribute overrides an earlier one.
 *
 * It does not. `cn` only joins strings. Both `bg-brand-600` (from the variant)
 * and `bg-white` (from the caller) land in the class attribute, and CSS resolves
 * the tie by *stylesheet* order, which is Tailwind's own canonical ordering.
 * The override lost, and a white button on a brand-900 hero rendered
 * brand-on-brand: invisible, with no error anywhere.
 *
 * The contrast checker could not catch it either, because by name the pair
 * `bg-white` + `text-brand-900` is perfectly legible. Only the *resolution* was
 * wrong.
 *
 * So: primitives own their colours. Need a different one? Add a variant.
 *
 *   npm run lint:overrides
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const UI = join(SRC, 'components', 'ui.jsx')

/** Primitives that set their own background or text colour. */
const PRIMITIVES = ['Button', 'Badge', 'Alert', 'Input', 'Textarea', 'Select']

// Utilities that collide with what a primitive already sets. Spacing, layout,
// sizing and ring utilities are fine — those are legitimate composition.
const COLLIDING =
  /\b(bg|text)-(?!(xs|sm|base|lg|xl|[2-9]xl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|current|transparent|inherit)\b)[a-z][\w-]*(\/\d+)?\b/

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.jsx$/.test(entry)
        ? [full]
        : []
  })
}

/** Variants each primitive offers, read from ui.jsx so the hint stays honest. */
function variantsFor(name) {
  const css = readFileSync(UI, 'utf8')
  const block = css.match(
    new RegExp(`const ${name.toUpperCase()}_(?:VARIANTS|TONES)\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`),
  )
  if (!block) return []
  return [...block[1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
}

const failures = []

for (const file of walk(SRC)) {
  // ui.jsx defines the primitives; it is allowed to set their colours.
  if (file === UI) continue

  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')

  for (const primitive of PRIMITIVES) {
    // <Primitive ... className="..."> on one line or spread across several.
    const re = new RegExp(`<${primitive}\\b([^>]*?)/?>`, 'gs')
    for (const m of source.matchAll(re)) {
      const attrs = m[1]
      const classAttr = attrs.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/)
      if (!classAttr) continue

      const value = classAttr[1] ?? classAttr[2] ?? ''
      const hit = value.match(COLLIDING)
      if (!hit) continue

      const line = source.slice(0, m.index).split('\n').length
      failures.push({
        file: relative(ROOT, file),
        line,
        primitive,
        utility: hit[0],
        variants: variantsFor(primitive),
        snippet: lines[line - 1]?.trim().slice(0, 90),
      })
    }
  }
}

if (failures.length) {
  console.error(`\n✖ ${failures.length} colour override(s) on a primitive:\n`)
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line}`)
    console.error(
      `    <${f.primitive} className="… ${f.utility} …"> — cn() cannot override the`,
    )
    console.error(`    primitive's own colour; stylesheet order decides, not you.`)
    if (f.variants.length) {
      console.error(`    → use a variant: ${f.variants.join(', ')}`)
    }
    console.error(`    ${f.snippet}\n`)
  }
  process.exit(1)
}

console.log(
  `✓ overrides: no colour utilities passed to ${PRIMITIVES.join(', ')}`,
)
