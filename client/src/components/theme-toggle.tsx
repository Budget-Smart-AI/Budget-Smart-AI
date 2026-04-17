/**
 * Settings-page theme toggle — light/dark radio.
 *
 * Shows both themes side-by-side with a small preview swatch and Check
 * glyph on the active one. Used on the Preferences page. Topbar uses
 * ThemeQuickSwitcher (single-click sun/moon toggle) instead.
 */
import { Check } from "lucide-react";
import { THEMES, type ThemeId, useThemeContext } from "@/contexts/ThemeContext";

export function ThemeToggle() {
  const { themeId, setThemeId } = useThemeContext();

  return (
    <div className="grid grid-cols-2 gap-2 max-w-md">
      {(Object.entries(THEMES) as [ThemeId, (typeof THEMES)[ThemeId]][]).map(([id, meta]) => (
        <button
          key={id}
          type="button"
          onClick={() => setThemeId(id)}
          className="flex items-center gap-3 rounded-lg border border-border bg-card hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors px-3 py-2.5 text-left"
          data-testid={`theme-option-${id}`}
          aria-pressed={themeId === id}
        >
          <span className="flex gap-0.5 shrink-0" aria-hidden>
            {meta.previewColors.map((color, i) => (
              <span
                key={i}
                className="inline-block h-3 w-3 rounded-full border border-border/40"
                style={{ backgroundColor: color }}
              />
            ))}
          </span>
          <span className="flex-1 text-sm font-medium">{meta.label}</span>
          {themeId === id && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
        </button>
      ))}
    </div>
  );
}
