#!/usr/bin/env node
/**
 * Tests for the contrast checker.
 *
 * A linter that reports nothing is indistinguishable from a linter that is
 * broken, and this one is a few hundred lines of hand-rolled scanning — exactly
 * the kind of code that quietly stops matching anything after a refactor. So
 * each class of bug it claims to catch is planted into a real source file, the
 * checker is run, and the file is restored.
 *
 *   npm run test:contrast
 *
 * Nothing is left modified: each probe restores from a backup even when the
 * assertion fails.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LINTER = join(ROOT, 'scripts', 'lint-contrast.mjs')

function runLinter() {
  // stderr must be piped explicitly: execFileSync forwards the child's stderr to
  // the parent's by default, which would dump every planted failure into this
  // test's own output and bury the results.
  const options = { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  try {
    return execFileSync('node', [LINTER], options)
  } catch (err) {
    // Non-zero exit is the expected outcome for every probe.
    return `${err.stdout ?? ''}${err.stderr ?? ''}`
  }
}

let passed = 0
const failures = []

/**
 * Plant `replacement` in place of `anchor`, assert the checker reports `want`,
 * then restore the file.
 */
function probe({ name, file, anchor, replacement, want }) {
  const path = join(ROOT, file)
  const backup = `${path}.contrast-test-backup`
  copyFileSync(path, backup)

  try {
    const source = readFileSync(path, 'utf8')
    if (!source.includes(anchor)) {
      failures.push(`${name}: anchor no longer present in ${file} — update the test`)
      return
    }
    writeFileSync(path, source.replace(anchor, replacement))

    const output = runLinter()
    if (output.includes(want)) {
      console.log(`  ✓ ${name} → reported as ${want}`)
      passed++
    } else {
      failures.push(`${name}: expected "${want}", got:\n${output.split('\n').slice(0, 6).join('\n')}`)
    }
  } finally {
    copyFileSync(backup, path)
    execFileSync('rm', ['-f', backup])
  }
}

console.log('contrast checker — planted bugs:\n')

probe({
  name: 'light background with light text',
  file: 'src/components/ui.jsx',
  anchor: '<span className="min-w-0">',
  replacement: '<span className="min-w-0 bg-surface p-2 text-brand-100">',
  want: 'INVERTED',
})

probe({
  name: 'dark background with dark text (missing dark: variant)',
  file: 'src/components/AuthShell.jsx',
  anchor: 'bg-surface p-7',
  replacement: 'bg-surface p-7 text-slate-800',
  want: 'INVERTED',
})

probe({
  name: 'raw palette colour with no dark value, on an inherited surface',
  file: 'src/pages/Cart.jsx',
  anchor: 'text-emerald-700 dark:text-emerald-400',
  replacement: 'text-brand-800',
  want: 'ON INHERITED BG',
})

probe({
  name: 'inverted panel with no foreground set',
  file: 'src/components/AuthShell.jsx',
  anchor: 'bg-surface p-7',
  replacement: 'bg-fg p-7',
  want: 'UNPAIRED BG',
})

probe({
  name: 'ratio marginally under AA',
  file: 'src/components/ProductCard.jsx',
  anchor: "'bg-emerald-700 text-white'",
  replacement: "'bg-emerald-600 text-white'",
  want: 'LOW CONTRAST',
})

// Regression: the scanner used to treat the apostrophe in JSX text ("isn't
// configured") as a string delimiter and swallow the rest of the file, so
// nothing after it was ever checked. This probe sits past that apostrophe.
probe({
  name: 'element positioned after an apostrophe in JSX text',
  file: 'src/components/ChatWidget.jsx',
  anchor: '<p className="text-[11px] text-fg-subtle">',
  replacement: '<p className="bg-surface p-2 text-white">',
  want: 'INVERTED',
})

// A suppression has to use the exact marker, so a typo fails loudly rather
// than silently exempting an element.
probe({
  name: 'malformed suppression marker does not suppress',
  file: 'src/components/ui.jsx',
  anchor: 'contrast-ok: gold on white',
  replacement: 'contrast-maybe: gold on white',
  want: 'accent-400',
})

// And the clean tree must pass, or every probe above is meaningless.
console.log('')
const clean = runLinter()
if (clean.includes('✓ contrast:')) {
  console.log('  ✓ clean tree passes')
  passed++
} else {
  failures.push(`clean tree does not pass:\n${clean}`)
}

console.log('')
if (failures.length) {
  console.error(`✖ ${failures.length} failure(s):\n`)
  failures.forEach((f) => console.error(`  ${f}\n`))
  process.exit(1)
}
console.log(`✓ ${passed} checks passed`)
