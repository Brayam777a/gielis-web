export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'gielis.theme'

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return isThemePreference(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref: ThemePreference): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (pref === 'light' || pref === 'dark') {
    root.dataset.theme = pref
  } else {
    delete root.dataset.theme
  }
}

export function setThemePreference(pref: ThemePreference): ThemePreference {
  if (typeof window !== 'undefined') {
    try {
      if (pref === 'system') {
        window.localStorage.removeItem(STORAGE_KEY)
      } else {
        window.localStorage.setItem(STORAGE_KEY, pref)
      }
    } catch {
      // localStorage no disponible
    }
  }
  applyTheme(pref)
  return pref
}
