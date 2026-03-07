import { createContext, useContext, useEffect, useState } from "react";

export type ThemeId =
  | "theme-midnight"
  | "theme-aurora"
  | "theme-ocean"
  | "theme-nebula"
  | "theme-slate";

export interface ThemeMeta {
  label: string;
  isDark: boolean;
  /** [background, surface, accent] swatch colours for the picker preview */
  previewColors: [string, string, string];
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  "theme-aurora": {
    label: "Aurora",
    isDark: false,
    previewColors: ["#f5fdf8", "#ffffff", "#16a34a"],
  },
  "theme-midnight": {
    label: "Midnight",
    isDark: true,
    previewColors: ["#0b1311", "#121c19", "#4ade80"],
  },
  "theme-ocean": {
    label: "Ocean",
    isDark: false,
    previewColors: ["#f0f8ff", "#ffffff", "#2563eb"],
  },
  "theme-nebula": {
    label: "Nebula",
    isDark: true,
    previewColors: ["#0e0b1e", "#1a1530", "#a78bfa"],
  },
  "theme-slate": {
    label: "Slate",
    isDark: false,
    previewColors: ["#f8fafc", "#ffffff", "#64748b"],
  },
};

const STORAGE_KEY = "budget-theme-v2";
const DEFAULT_THEME: ThemeId = "theme-aurora";

interface ThemeContextValue {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeContextProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    return stored && stored in THEMES ? stored : DEFAULT_THEME;
  });

  useEffect(() => {
    const root = window.document.documentElement;

    // Remove all theme classes
    (Object.keys(THEMES) as ThemeId[]).forEach((id) => {
      root.classList.remove(id);
    });

    // Remove the legacy dark class, then re-add if needed
    root.classList.remove("dark");

    // Apply the selected theme class
    root.classList.add(themeId);

    // Mirror into the `dark` class so Tailwind `dark:` variants keep working
    if (THEMES[themeId].isDark) {
      root.classList.add("dark");
    }
  }, [themeId]);

  const setThemeId = (id: ThemeId) => {
    localStorage.setItem(STORAGE_KEY, id);
    setThemeIdState(id);
  };

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId, isDark: THEMES[themeId].isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeContextProvider");
  return ctx;
}
