import { useTheme } from '../hooks/useTheme'
import { MoonIcon, SunIcon } from './icons'
import { cn } from '../lib/cn'

export default function ThemeToggle({ className }) {
  const { isDark, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      // The label announces the action, not the current state — screen-reader
      // users need to know what pressing it will do.
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={cn(
        'relative grid h-10 w-10 place-items-center rounded-lg text-fg-muted',
        'transition-colors hover:bg-surface-muted hover:text-fg',
        className,
      )}
    >
      {/* Both icons stay mounted and cross-fade with a slight rotation, which
          feels less abrupt than swapping elements. */}
      <SunIcon
        className={cn(
          'absolute h-5 w-5 transition-all duration-300 ease-out-soft',
          isDark ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100',
        )}
      />
      <MoonIcon
        className={cn(
          'absolute h-5 w-5 transition-all duration-300 ease-out-soft',
          isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0',
        )}
      />
    </button>
  )
}
