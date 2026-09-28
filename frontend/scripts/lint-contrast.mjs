#!/usr/bin/env node
/**
 * Contrast checker for the CommerceX design system.
 *
 * The rule this enforces is the one the design system is built on: a light
 * background must carry dark text, and a dark background must carry light text
 * — in *both* themes, since every semantic token has two values.
 *
 * It does not pattern-match token names. It resolves each `bg-*` and `text-*`
 * utility to a real hex value twice (once with light-mode tokens, once with
 * `.dark` applied), then computes the WCAG 2.1 relative-luminance contrast
 * ratio. That's the only way to catch a pair that *looks* fine by name but
 * isn't — `bg-info-bg` with `text-brand-700`, say, which reads as "tinted
 * background, dark brand text" and is perfectly legible in light mode but is
 * dark-on-dark once `.dark` repoints `--color-info-bg` to near-black.
 *
 * Most text in a React app sets no background of its own — it sits on whatever
 * card, panel or gradient encloses it. So the file is scanned into a JSX element
 * tree and each text colour is checked against the *nearest ancestor that
 * actually paints a background*. Without that, `text-white` inside a
 * brand-gradient header looks like white-on-white and every hero in the app
 * reports as broken; with it, the same class inside a plain card is correctly
 * flagged.
 *
 * Four classes of bug it reports:
 *
 *   1. LOW CONTRAST     — resolved ratio below the WCAG AA threshold.
 *   2. INVERTED         — light bg + light text, or dark bg + dark text.
 *                         Reported separately because it's almost always a
 *                         forgotten `dark:` variant rather than a bad colour
 *                         choice, and the fix is different.
 *   3. UNPAIRED BG      — a background that runs against the theme (dark panel
 *                         on a light page) with no foreground set, so text
 *                         inherits the page colour and lands dark-on-dark.
 *   4. ON INHERITED BG  — a text colour that fails against the background its
 *                         nearest painting ancestor establishes.
 *
 * Ternaries are expanded rather than skipped. The first version of this script
 * bailed out of any className containing `?`, which silently exempted most of
 * the app — conditional styling is exactly where a state gets a new background
 * and keeps the old text colour.
 *
 *   npm run lint:contrast
 *   npm run lint:contrast -- --verbose    # show every pair and its ratio
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath, not URL.pathname — the latter leaves %20 encoded, which breaks
// on any project path containing a space (like "Simple Project").
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const CSS = join(SRC, 'index.css')

const VERBOSE = process.argv.includes('--verbose')

/* ------------------------------------------------------------------ colour */

const TAILWIND = {
  white: '#ffffff',
  black: '#000000',
}

// Tailwind v4's default palette, only the families this codebase actually uses.
// Hardcoded rather than imported: pulling it out of the installed package would
// make this script depend on node_modules resolution internals, and these
// values are stable across v4 patch releases.
const PALETTE = {
  slate: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#020617'],
  gray: ['#f9fafb', '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563', '#374151', '#1f2937', '#111827', '#030712'],
  red: ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a'],
  rose: ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'],
  amber: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'],
  emerald: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'],
  sky: ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#082f49'],
  violet: ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'],
}
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

for (const [family, values] of Object.entries(PALETTE)) {
  values.forEach((hex, i) => {
    TAILWIND[`${family}-${SHADES[i]}`] = hex
  })
}

function parseColor(raw) {
  if (!raw) return null
  const value = String(raw).trim()

  const hex = value.match(/^#([0-9a-f]{3,8})$/i)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    // 8-digit hex carries alpha in the last pair.
    const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: alpha,
    }
  }

  // rgb(15 23 42 / 0.45) and rgb(15, 23, 42)
  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+%?))?\s*\)$/i,
  )
  if (rgb) {
    const rawAlpha = rgb[4]
    const a = rawAlpha
      ? rawAlpha.endsWith('%')
        ? parseFloat(rawAlpha) / 100
        : parseFloat(rawAlpha)
      : 1
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a }
  }

  return null
}

/** Composite a translucent colour over an opaque one. */
function over(fg, bg) {
  if (!fg) return null
  if (fg.a >= 1 || !bg) return { ...fg, a: 1 }
  const mix = (f, b) => Math.round(f * fg.a + b * (1 - fg.a))
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 }
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const isLight = (color) => luminance(color) > 0.35

/* ------------------------------------------------------- token resolution */

/**
 * Read the two token maps out of index.css: the `@theme` block is light mode,
 * the `.dark` block is the override set.
 */
function readTokens() {
  const css = readFileSync(CSS, 'utf8')

  const block = (pattern, label) => {
    const match = css.match(pattern)
    if (!match) throw new Error(`index.css: could not find the ${label} block`)
    return Object.fromEntries(
      [...match[1].matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
        m[1],
        m[2].trim(),
      ]),
    )
  }

  const light = block(/@theme\s*\{([\s\S]*?)\n\}/, '@theme')
  const darkOverrides = block(/\n\.dark\s*\{([\s\S]*?)\n\}/, '.dark')

  // Paired utilities declare a background and foreground together, so they are
  // resolved as a unit and can never be reported as unpaired.
  const pairs = {}
  for (const m of css.matchAll(/@utility\s+(surface-[\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
    const body = m[2]
    const bg = body.match(/background-color:\s*(?:var\(--color-([\w-]+)\)|([^;]+));/)
    const fg = body.match(/(?:^|\n)\s*color:\s*(?:var\(--color-([\w-]+)\)|([^;]+));/)
    if (bg && fg) {
      pairs[m[1]] = {
        bg: bg[1] ? `var:${bg[1]}` : bg[2].trim(),
        fg: fg[1] ? `var:${fg[1]}` : fg[2].trim(),
      }
    }
  }

  if (!Object.keys(pairs).length) {
    throw new Error('index.css: no surface-* paired utilities found')
  }

  return { light, dark: { ...light, ...darkOverrides }, pairs }
}

const TOKENS = readTokens()

/**
 * Resolve a utility's colour suffix (`surface-muted`, `brand-600`, `white`,
 * `slate-900`, plus an optional `/40` opacity) for one theme.
 */
function resolve(suffix, theme) {
  const [name, opacity] = suffix.split('/')
  const map = TOKENS[theme]

  let raw = null
  if (Object.prototype.hasOwnProperty.call(map, name)) raw = map[name]
  else if (Object.prototype.hasOwnProperty.call(TAILWIND, name)) raw = TAILWIND[name]
  if (!raw) return null

  const color = parseColor(raw)
  if (!color) return null

  if (opacity && /^\d+$/.test(opacity)) {
    return { ...color, a: color.a * (Number(opacity) / 100) }
  }
  return color
}

function resolveRef(ref, theme) {
  if (ref.startsWith('var:')) return resolve(ref.slice(4), theme)
  return parseColor(ref) || resolve(ref, theme)
}

/* ------------------------------------------------------- class extraction */

// Variants describing a transient state rather than the resting appearance.
const STATE =
  /^(hover|focus|focus-visible|focus-within|active|disabled|visited|group-hover|group-focus|group-focus-within|peer-checked|peer-focus|peer-disabled|checked|indeterminate|open|first|last|odd|even|placeholder|before|after|selection|file|marker|backdrop)$/

const RESPONSIVE =
  /^(sm|md|lg|xl|2xl|print|motion-safe|motion-reduce|rtl|ltr)$/

/** Split "dark:hover:bg-surface" into { variants, utility }. */
function splitVariants(token) {
  const parts = token.split(':')
  return { variants: parts.slice(0, -1), utility: parts.at(-1) }
}

/**
 * Does this token apply to the resting appearance in `theme`?
 * Returns a specificity rank so more-specific declarations win, or null if the
 * token doesn't apply.
 */
function applies(variants, theme) {
  let rank = 0
  for (const v of variants) {
    if (v === 'dark') {
      if (theme !== 'dark') return null
      rank += 10
    } else if (RESPONSIVE.test(v)) {
      rank += 1
    } else {
      // States, arbitrary selectors, aria-/data- variants: not the resting
      // appearance, or not safely knowable. Either way, don't guess.
      return null
    }
  }
  return rank
}

/**
 * Every plausible resting class set for one className expression.
 *
 * Base classes are those outside any ternary. Each ternary contributes its
 * branches, and each branch is checked together with the base — a background in
 * one branch plus a foreground in the base is a real pair.
 */
function classSets(expression) {
  const ternaries = []
  const consumed = []

  for (const m of expression.matchAll(
    /\?\s*(['"`])((?:(?!\1)[^\\])*)\1\s*:\s*(?:(['"`])((?:(?!\3)[^\\])*)\3)?/g,
  )) {
    const branches = [m[2], m[4]].filter((b) => b && b.trim())
    if (branches.length) {
      ternaries.push(branches)
      consumed.push([m.index, m.index + m[0].length])
    }
  }

  let base = expression
  for (const [start, end] of [...consumed].reverse()) {
    base = base.slice(0, start) + ' '.repeat(end - start) + base.slice(end)
  }

  const baseTokens = [...base.matchAll(/(['"`])((?:(?!\1)[^\\$])*)\1/g)]
    .map((m) => m[2])
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)

  if (!ternaries.length) return [baseTokens]

  return ternaries.flatMap((branches) =>
    branches.map((branch) => [...baseTokens, ...branch.split(/\s+/).filter(Boolean)]),
  )
}

/* ---------------------------------------------------------- jsx tree scan */

/**
 * Scan a file into a flat list of JSX elements, each carrying its ancestor
 * chain.
 *
 * This is a deliberately small hand-rolled scanner rather than a real parser.
 * It needs to answer exactly one question — "which elements enclose this one?"
 * — and doing that with a dependency-free character walk keeps the lint step
 * runnable with plain `node` and no build.
 *
 * The one thing it has to get right is *context*, because a quote means
 * opposite things in the two places it appears:
 *
 *   <p>the assistant isn't configured</p>   ← JSX text; the ' is an apostrophe
 *   useAuth must be used inside <Auth>      ← a JS string; the < is not a tag
 *
 * Both of those exist in this codebase. Treating quotes as string delimiters
 * everywhere swallows the rest of the file at the first apostrophe; treating
 * them as text everywhere opens a phantom element at the first `<` inside a
 * string. So the scanner keeps a stack of frames — `js` where quotes delimit
 * strings, `jsx` where they're literal text — and switches between them on
 * `{`, `}` and tag boundaries.
 */
function scanElements(source) {
  const elements = []
  const stack = []
  // The bottom frame is module-level JS. `{` in JSX children pushes a js frame;
  // its matching `}` pops back.
  const frames = [{ kind: 'js', depth: 0 }]
  let i = 0

  const isTagNameStart = (c) => /[A-Za-z_$>]/.test(c)

  while (i < source.length) {
    const c = source[i]
    const frame = frames.at(-1)

    if (frame.kind === 'js') {
      // ---- things that can hide a '<' -------------------------------------
      if (c === '/' && source[i + 1] === '/') {
        const nl = source.indexOf('\n', i)
        i = nl === -1 ? source.length : nl
        continue
      }
      if (c === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2)
        i = end === -1 ? source.length : end + 2
        continue
      }
      if (c === '"' || c === "'" || c === '`') {
        i = skipString(source, i)
        continue
      }
      if (c === '{') {
        frame.depth++
        i++
        continue
      }
      if (c === '}') {
        frame.depth--
        // A negative depth means this `}` closed the JSX expression that opened
        // this frame, so control returns to the surrounding children.
        if (frame.depth < 0 && frames.length > 1) frames.pop()
        else if (frame.depth < 0) frame.depth = 0
        i++
        continue
      }
    } else {
      // ---- jsx children: quotes are text, `{` starts an expression ---------
      if (c === '{') {
        // A JSX comment is an expression containing only a block comment.
        if (source.slice(i + 1).trimStart().startsWith('/*')) {
          const end = source.indexOf('}', source.indexOf('*/', i) + 2)
          i = end === -1 ? source.length : end + 1
          continue
        }
        frames.push({ kind: 'js', depth: 0 })
        i++
        continue
      }
    }

    if (c !== '<') {
      i++
      continue
    }

    // ---- closing tag --------------------------------------------------------
    if (source[i + 1] === '/') {
      const end = source.indexOf('>', i)
      if (end === -1) break
      stack.pop()
      // Children of that element are over; drop back to its parent's context.
      if (frame.kind === 'jsx' && frames.length > 1) frames.pop()
      i = end + 1
      continue
    }

    if (!isTagNameStart(source[i + 1])) {
      i++ // a less-than, not a tag
      continue
    }

    // ---- opening tag: find its '>' -----------------------------------------
    //
    // Strings are skipped only *outside* brace expressions. Inside them, brace
    // depth alone finds the terminator, and skipping strings there is actively
    // wrong: an element-valued prop contains JSX children, whose text may hold
    // an apostrophe —
    //
    //     action={<Button>Raise last month's invoices</Button>}
    //
    // — and treating that as a string delimiter swallowed the rest of the tag.
    // Outside braces, quotes must still be honoured, because a plain attribute
    // value can legitimately contain '>' (`className="a>b"`).
    //
    // A '>' inside braces is never the terminator, so `onClick={() => x}` and
    // `{count > 0 && …}` both pass through untouched.
    let j = i + 1
    let braces = 0
    let selfClosing = false
    while (j < source.length) {
      const d = source[j]
      if (braces === 0 && (d === '"' || d === "'" || d === '`')) {
        j = skipString(source, j)
        continue
      }
      if (d === '{') braces++
      else if (d === '}') braces--
      else if (d === '>' && braces === 0) {
        selfClosing = /\/\s*$/.test(source.slice(i, j))
        break
      }
      j++
    }
    if (j >= source.length) break

    const tag = source.slice(i, j + 1)
    const node = {
      index: i,
      line: source.slice(0, i).split('\n').length,
      name: (tag.match(/^<\s*([A-Za-z][\w.]*)/) || [, 'fragment'])[1],
      className: extractClassName(tag),
      parents: [...stack],
    }
    elements.push(node)
    if (!selfClosing) {
      stack.push(node)
      frames.push({ kind: 'jsx' })
    }

    i = j + 1
  }

  // A non-empty stack means the scanner lost its place — an unmatched tag, or a
  // construct it mis-read. That silently corrupts every ancestor lookup after
  // the slip, so it's surfaced rather than swallowed.
  return { elements, unbalanced: stack.length }
}

/** Advance past a string literal (handles escapes and `${}` interpolation). */
function skipString(source, start) {
  const quote = source[start]
  let i = start + 1
  while (i < source.length) {
    const c = source[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (quote === '`' && c === '$' && source[i + 1] === '{') {
      // Template interpolation can itself contain strings and braces.
      let depth = 1
      i += 2
      while (i < source.length && depth > 0) {
        const d = source[i]
        if (d === '"' || d === "'" || d === '`') {
          i = skipString(source, i)
          continue
        }
        if (d === '{') depth++
        else if (d === '}') depth--
        i++
      }
      continue
    }
    if (c === quote) return i + 1
    i++
  }
  return source.length
}

/** Pull the className payload out of a single opening tag's text. */
function extractClassName(tag) {
  const m = tag.match(/\bclassName=(?:(\{)|(["']))/)
  if (!m) return null
  const start = m.index + m[0].length

  if (m[2]) {
    const end = tag.indexOf(m[2], start)
    return end === -1 ? null : `"${tag.slice(start, end)}"`
  }

  let depth = 1
  let i = start
  while (i < tag.length && depth > 0) {
    const c = tag[i]
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(tag, i)
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--
    i++
  }
  return tag.slice(start, i - 1)
}

/* ------------------------------------------------------------------ checks */

const AA = 4.5
const AA_LARGE = 3
// "Large" per WCAG is >=18.66px bold or >=24px. Only the size utilities that
// guarantee it qualify; text-base with font-bold does not.
const LARGE = /^text-(xl|[2-9]xl|display|title)$/

// Icons are graphics, not text. WCAG 1.4.11 scores non-text content at 3:1, so
// an `<svg>` or an `*Icon` component gets the lower threshold — holding a 12px
// chevron to 4.5:1 would force every decorative glyph to near-black.
const GRAPHIC = /^(svg|path|circle|rect|line|polyline|polygon|g)$|Icon$|^(Spinner|Star|Stars|Thumb)$/

// bg-* utilities that aren't colours.
const NON_COLOUR_BG =
  /^(gradient|clip|blend|origin|repeat|fixed|local|scroll|auto|cover|contain|center|top|bottom|left|right|none|current|transparent|inherit)/

// text-* utilities that aren't colours.
const NON_COLOUR_TEXT =
  /^(xs|sm|base|lg|[2-9]xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|display|title|current|transparent|inherit|size|opacity)/

/**
 * Resolve one class set for one theme into { bgs, fg, large }.
 *
 * `bgs` is a list because a gradient paints a range, not a colour: text over
 * `from-brand-500 to-brand-700` has to be legible at both ends, so both
 * endpoints are returned and the caller checks the worst.
 */
function evaluate(tokens, theme) {
  let bg = null
  let fg = null
  let large = false
  // Keyed by gradient position, so `dark:from-brand-950` replaces
  // `from-brand-50` instead of being collected alongside it. Collecting both
  // made every child of the AI panel report as light-on-light in dark mode:
  // the checker took the worst of the two stops, and one of them was the
  // light-mode value that `.dark` had already overridden.
  const stops = new Map()

  for (const token of tokens) {
    const { variants, utility } = splitVariants(token)
    const rank = applies(variants, theme)
    if (rank === null) continue

    if (LARGE.test(utility)) large = true

    const pair = TOKENS.pairs[utility]
    if (pair) {
      const bgColor = resolveRef(pair.bg, theme)
      const fgColor = resolveRef(pair.fg, theme)
      if (bgColor && (!bg || rank >= bg.rank)) bg = { rank, color: bgColor, name: utility }
      if (fgColor && (!fg || rank >= fg.rank)) fg = { rank, color: fgColor, name: utility }
      continue
    }

    // Gradient stops paint a background even though they aren't `bg-*`.
    const stop = utility.match(/^(from|via|to)-([\w-]+(?:\/\d+)?)$/)
    if (stop) {
      const color = resolve(stop[2], theme)
      const held = stops.get(stop[1])
      if (color && (!held || rank >= held.rank)) {
        stops.set(stop[1], { rank, color, name: utility })
      }
      continue
    }

    const bgMatch = utility.match(/^bg-([\w-]+(?:\/\d+)?)$/)
    if (bgMatch && !NON_COLOUR_BG.test(bgMatch[1])) {
      const color = resolve(bgMatch[1], theme)
      if (color && (!bg || rank >= bg.rank)) bg = { rank, color, name: utility }
    }

    const fgMatch = utility.match(/^text-([\w-]+(?:\/\d+)?)$/)
    if (fgMatch && !NON_COLOUR_TEXT.test(fgMatch[1])) {
      const color = resolve(fgMatch[1], theme)
      if (color && (!fg || rank >= fg.rank)) fg = { rank, color, name: utility }
    }
  }

  // Gradient stops win over the `bg-gradient-to-*` placeholder, and over a
  // solid `bg-*` sitting underneath them as a fallback.
  const bgs = stops.size ? [...stops.values()] : bg ? [bg] : []
  return { bgs, fg, large }
}

/* -------------------------------------------------------------------- run */

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.jsx?$/.test(entry) ? [full] : []
  })
}

const problems = []
const suppressed = []
const scanErrors = []
let checked = 0


for (const file of walk(SRC)) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  const rel = relative(ROOT, file)

  const { elements, unbalanced } = scanElements(source)
  if (unbalanced) {
    scanErrors.push(`${rel}: ${unbalanced} unclosed element(s) — ancestor lookups may be wrong`)
  }

  /**
   * Background established by the nearest ancestor that actually paints one.
   * Falls back to the page canvas, which is what `body` sets.
   *
   * Translucent fills are composited down the chain, so `bg-white/10` inside a
   * `from-brand-900` hero resolves to the near-black wash it really is instead
   * of being treated as white.
   */
  function ambientBg(node, theme) {
    const chain = []
    for (const ancestor of node.parents) {
      if (!ancestor.className) continue
      // A parent's own conditional branches can't be resolved to one value, so
      // the first branch stands in — ancestors are used for context, not for
      // the assertion itself.
      const [tokens] = classSets(ancestor.className)
      const { bgs } = evaluate(tokens, theme)
      if (bgs.length) chain.push(bgs)
    }

    let base = resolve('canvas', theme)
    for (const bgs of chain) {
      // Opaque stops reset the ground; translucent ones layer over it.
      const solid = bgs.map((b) => ({ ...b, color: over(b.color, base) }))
      base = solid[0].color
      if (bgs === chain.at(-1)) return solid
    }
    return [{ color: base, name: 'inherited canvas' }]
  }

  for (const node of elements) {
    if (!node.className) continue
    const line = node.line

    // Escape hatch for the cases the scanner genuinely can't resolve — a
    // background painted by a sibling, a pseudo-element, or an image. A reason
    // is required, so every suppression justifies itself in the diff and shows
    // up in the passing output.
    //
    //   {/* contrast-ok: sits on the hero's background image */}
    //   <Button className="bg-white/10 text-white" />
    const suppression = lines
      .slice(Math.max(0, line - 6), line - 1)
      .join('\n')
      .match(/contrast-ok:\s*([^*}\n]+)/)
    if (suppression) {
      suppressed.push(`${rel}:${line} — ${suppression[1].trim()}`)
      continue
    }

    for (const tokens of classSets(node.className)) {
      for (const theme of ['light', 'dark']) {
        const { bgs, fg, large } = evaluate(tokens, theme)
        const ambient = ambientBg(node, theme)
        const canvas = resolve('canvas', theme)

        // The element's own background if it paints one, else its ancestor's.
        const grounds = bgs.length
          ? bgs.map((b) => ({ name: b.name, color: over(b.color, ambient[0].color) }))
          : ambient

        // ---- a background with no foreground -----------------------------
        if (bgs.length && !fg) {
          // Inheriting is fine — and is the point of the token system — as long
          // as the background tracks the theme. `bg-surface` is light in light
          // mode and dark in dark mode, so the inherited `--color-fg` flips
          // with it and stays legible.
          //
          // What breaks is a background running *against* its context: a
          // `bg-fg` or `bg-brand-700` panel on a light page inherits dark text
          // and lands dark-on-dark.
          const flipped = grounds.some((g) => isLight(g.color) !== isLight(ambient[0].color))

          // Decorative fills (progress bars, dots, rules) carry no text.
          const decorative = tokens.some((t) =>
            /^(h|w|size)-(px|0\.5|1|1\.5|2|2\.5|3)$/.test(splitVariants(t).utility),
          )
          const holdsText = tokens.some((t) =>
            /^(p|px|py|pt|pb|pl|pr)-[1-9]/.test(splitVariants(t).utility),
          )

          if (flipped && !decorative && holdsText) {
            const g = grounds[0]
            problems.push({
              kind: 'UNPAIRED BG',
              file: rel,
              line,
              theme,
              detail:
                `"${g.name}" is ${isLight(g.color) ? 'light' : 'dark'} against a ` +
                `${isLight(ambient[0].color) ? 'light' : 'dark'} ${ambient[0].name}, and no ` +
                `text colour is set — text inherits the page foreground and lands ` +
                `${isLight(g.color) ? 'light-on-light' : 'dark-on-dark'}. Use a ` +
                `surface-* utility, or set text-* explicitly.`,
              snippet: tokens.join(' '),
            })
          }
          continue
        }

        if (!fg) continue

        // ---- text against every ground it can sit on ----------------------
        let worst = null
        for (const ground of grounds) {
          const ratio = contrast(ground.color, over(fg.color, ground.color))
          if (!worst || ratio < worst.ratio) worst = { ratio, ground }
        }

        checked++
        const inherited = !bgs.length
        if (VERBOSE) {
          console.log(
            `  ${rel}:${line} [${theme}] ${inherited ? 'via ' : ''}${worst.ground.name}` +
              ` + ${fg.name} = ${worst.ratio.toFixed(2)}:1`,
          )
        }

        const threshold = large || GRAPHIC.test(node.name) ? AA_LARGE : AA
        if (worst.ratio >= threshold) continue

        const bgLight = isLight(worst.ground.color)
        const fgLight = isLight(over(fg.color, worst.ground.color))
        const hint =
          theme === 'dark' && !/^(text|bg)-(fg|canvas|surface|line|success|warning|danger|info)/.test(fg.name)
            ? ' — a raw palette colour has no dark value to flip to; add a dark: variant or use a semantic token'
            : ''

        if (inherited) {
          problems.push({
            kind: 'ON INHERITED BG',
            file: rel,
            line,
            theme,
            detail:
              `"${fg.name}" on the ${worst.ground.name} it inherits is ` +
              `${worst.ratio.toFixed(2)}:1, below AA ${threshold}:1${hint}`,
            snippet: tokens.join(' '),
          })
        } else if (bgLight === fgLight) {
          problems.push({
            kind: 'INVERTED',
            file: rel,
            line,
            theme,
            detail:
              `${bgLight ? 'light' : 'dark'} background "${worst.ground.name}" with ` +
              `${fgLight ? 'light' : 'dark'} text "${fg.name}" — ` +
              `${worst.ratio.toFixed(2)}:1${hint}`,
            snippet: tokens.join(' '),
          })
        } else {
          problems.push({
            kind: 'LOW CONTRAST',
            file: rel,
            line,
            theme,
            detail:
              `"${worst.ground.name}" + "${fg.name}" = ${worst.ratio.toFixed(2)}:1, ` +
              `below AA ${threshold}:1`,
            snippet: tokens.join(' '),
          })
        }
      }
    }
  }
}


/* Deduplicate: one line often yields the same finding via several class sets. */
const seen = new Set()
const unique = problems.filter((p) => {
  const key = `${p.file}:${p.line}:${p.theme}:${p.detail}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

if (scanErrors.length) {
  console.error('\n✖ the jsx scanner could not read these files reliably:\n')
  scanErrors.forEach((e) => console.error(`  ${e}`))
  console.error('')
  process.exit(2)
}

if (unique.length) {
  console.error(`\n✖ ${unique.length} contrast problem(s) across ${checked} resolved pairs:\n`)
  for (const p of unique) {
    console.error(`  ${p.kind}  ${p.file}:${p.line}  [${p.theme} mode]`)
    console.error(`    ${p.detail}`)
    console.error(`    ${p.snippet.slice(0, 130)}\n`)
  }
  process.exit(1)
}

console.log(
  `✓ contrast: ${checked} background/text pairs resolved to hex and checked ` +
    `against WCAG AA in both themes`,
)
if (suppressed.length) {
  console.log(`  ${suppressed.length} suppressed:`)
  suppressed.forEach((s) => console.log(`    ${s}`))
}
