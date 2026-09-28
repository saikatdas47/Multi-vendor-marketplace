import { createContext, useCallback, useEffect, useMemo, useState } from 'react'

export const ThemeContext = createContext(null)

const STORAGE_KEY = 'commercex.theme'

/** 'light' | 'dark' | 'system' */
function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return ['light', 'dark', 'system'].includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStored)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Follow the OS live, so a user switching their system theme sees it apply
  // immediately while their preference is 'system'.
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const onChange = (event) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const isDark = preference === 'system' ? systemDark : preference === 'dark'

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', isDark)
    // Tells the browser to render form controls and scrollbars to match.
    root.style.colorScheme = isDark ? 'dark' : 'light'
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      /* private mode — the theme just won't persist */
    }
  }, [isDark, preference])

  const value = useMemo(
    () => ({
      preference,
      isDark,
      setPreference,
      toggle: () => setPreference(isDark ? 'light' : 'dark'),
    }),
    [preference, isDark],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
