import { Check } from "lucide-react";
import { THEMES, type ThemeId, useThemeContext } from "@/contexts/ThemeContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const THEME_DESCRIPTIONS: Record<ThemeId, string> = {
  "theme-aurora": "Fresh teal-green, light & airy",
  "theme-midnight": "Deep teal with dark surfaces",
  "theme-ocean": "Cool blue, clean & focused",
  "theme-nebula": "Dark violet, moody & rich",
  "theme-slate": "Neutral gray, minimal & calm",
  "theme-abyss": "Deep navy blue, bold & immersive",
};

/**
 * Returns black or white depending on which provides better contrast
 * against the given hex colour (WCAG relative-luminance approach).
 */
function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Perceived luminance (sRGB coefficients)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#111827" : "#ffffff";
}

export function ThemePicker() {
  const { themeId, setThemeId } = useThemeContext();

  return (
    <div className="space-y-4" id="appearance">
      <div>
        <h3 className="text-base font-semibold">Appearance</h3>
        <p className="text-sm text-muted-foreground">Choose your BudgetSmart look</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(Object.entries(THEMES) as [ThemeId, (typeof THEMES)[ThemeId]][]).map(
          ([id, meta]) => {
            const [bg, surface, accent] = meta.previewColors;
            const isActive = themeId === id;

            return (
              <button
                key={id}
                onClick={() => setThemeId(id)}
                className={cn(
                  "relative w-full rounded-xl overflow-hidden text-left transition-all duration-200",
                  "border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "shadow-md scale-[1.02]"
                    : "hover:shadow-md",
                )}
                style={{
                  borderColor: isActive ? accent : undefined,
                  borderWidth: isActive ? "2px" : "1px",
                }}
                aria-pressed={isActive}
                aria-label={`Select ${meta.label} theme`}
              >
                {/* Preview area */}
                <div
                  className="h-[84px] w-full flex items-center justify-center gap-2 p-3"
                  style={{ backgroundColor: bg }}
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="rounded-lg flex-1 h-full flex flex-col gap-1.5 p-2"
                      style={{
                        backgroundColor: surface,
                        opacity: i === 2 ? 0.7 : 1,
                      }}
                    >
                      <div
                        className="h-2 rounded-full w-3/4"
                        style={{ backgroundColor: accent, opacity: 0.8 }}
                      />
                      <div
                        className="h-1.5 rounded-full w-full"
                        style={{ backgroundColor: accent, opacity: 0.25 }}
                      />
                      <div
                        className="h-1.5 rounded-full w-2/3"
                        style={{ backgroundColor: accent, opacity: 0.15 }}
                      />
                    </div>
                  ))}
                </div>

                {/* Info area */}
                <div className="p-3 space-y-1 bg-card">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: accent }}
                    />
                    <span className="text-sm font-medium">{meta.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-tight pl-5">
                    {THEME_DESCRIPTIONS[id]}
                  </p>
                  <div className="pl-5">
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 h-4"
                    >
                      {meta.isDark ? "DARK" : "LIGHT"}
                    </Badge>
                  </div>
                </div>

                {/* Active checkmark overlay */}
                {isActive && (
                  <div
                    className="absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: accent }}
                  >
                    <Check
                      className="h-3 w-3"
                      style={{ color: contrastColor(accent) }}
                    />
                  </div>
                )}
              </button>
            );
          },
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Your theme preference is saved automatically.
      </p>
    </div>
  );
}
