/**
 * Theme system — 2-mode (Light / Dark) with glassmorphism palette.
 *
 * Previously supported 6 theme variants (Aurora, Midnight, Ocean, Nebula,
 * Slate, Abyss). Consolidated down to Light + Dark in April 2026 to match
 * the glass-emerald brand direction. Any user with a legacy key in
 * localStorage is silently migrated into the closest new mode.
 */
import { createContext, useContext, useEffect, useState } from "react";

export type ThemeId = "light" | "dark";

export interface ThemeMeta {
  label: string;
  isDark: boolean;
  /** [background, surface, accent] — used for any swatch previews. */
  previewColors: [string, string, string];
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  light: {
    label: "Light",
    isDark: false,
    previewColors: ["#F5FDF8", "#FFFFFF", "#22C55E"],
  },
  dark: {
    label: "Dark",
    isDark: true,
    previewColors: ["#051410", "#0A1F17", "#22C55E"],
  },
};

const STORAGE_KEY = "budget-theme-v2";
const DEFAULT_THEME: ThemeId = "light";

/**
 * Legacy → new mode map. Covers every theme id we shipped before the
 * consolidation so returning users don't flicker to the default.
 */
const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  "theme-aurora": "light",
  "theme-ocean": "light",
  "theme-slate": "light",
  "theme-midnight": "dark",
  "theme-nebula": "dark",
  "theme-abyss": "dark",
};

function readStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_THEME;
    if (stored === "light" || stored === "dark") return stored;
    const migrated = LEGACY_THEME_MAP[stored];
    if (migrated) {
      // Persist the migrated value so we don't do the lookup on every mount.
      localStorage.setItem(STORAGE_KEY, migrated);
      return migrated;
    }
  } catch {
    // localStorage unavailable (SSR / private mode) — fall back to default.
  }
  return DEFAULT_THEME;
}

interface ThemeContextValue {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeContextProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => readStoredTheme());

  useEffect(() => {
    const root = window.document.documentElement;

    // Strip any theme-* class (including legacy ones) before applying current.
    Array.from(root.classList).forEach((cls) => {
      if (cls.startsWith("theme-")) root.classList.remove(cls);
    });
    root.classList.remove("dark");

    root.classList.add(`theme-${themeId}`);

    // Mirror into the `dark` class so Tailwind `dark:` variants keep working.
    if (THEMES[themeId].isDark) {
      root.classList.add("dark");
    }
  }, [themeId]);

  const setThemeId = (id: ThemeId) => {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
    setThemeIdState(id);
  };

  const toggleTheme = () => setThemeId(themeId === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider
      value={{ themeId, setThemeId, toggleTheme, isDark: THEMES[themeId].isDark }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeContextProvider");
  return ctx;
}
