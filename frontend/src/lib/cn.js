/**
 * Joins class names, dropping falsy values.
 *
 * Deliberately not `clsx` + `tailwind-merge`, but be clear about the tradeoff:
 * this CANNOT resolve conflicts. Two competing utilities — `bg-brand-600` from a
 * variant and `bg-white` from a caller — both end up in the class attribute, and
 * CSS picks the winner by *stylesheet* order, which is Tailwind's own canonical
 * ordering. The order they appear in the attribute is irrelevant.
 *
 * (An earlier version of this comment claimed the caller's className "wins on
 * source order". It does not. That mistake made the hero's primary button
 * render brand-on-brand and vanish.)
 *
 * So: never pass a colour utility to a primitive expecting it to override one.
 * Add a variant instead. `npm run lint:overrides` enforces this.
 */
export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}
