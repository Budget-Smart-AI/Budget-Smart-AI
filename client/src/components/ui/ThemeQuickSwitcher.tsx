import { useState } from "react";
import { Check, Palette, X, Settings } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { THEMES, type ThemeId, useThemeContext } from "@/contexts/ThemeContext";

export function ThemeQuickSwitcher() {
  const { themeId, setThemeId } = useThemeContext();
  const [open, setOpen] = useState(false);

  const currentMeta = THEMES[themeId];
  const accentColor = currentMeta.previewColors[2];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="button-theme-quick-switcher"
          title="Switch theme"
          aria-label="Switch theme"
        >
          <span
            className="h-3.5 w-3.5 rounded-full border border-border/50"
            style={{ backgroundColor: accentColor }}
            aria-hidden
          />
          <span className="sr-only">Switch theme</span>
          <Palette className="h-4 w-4 ml-0.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[280px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Theme</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setOpen(false)}
            aria-label="Close theme picker"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Theme rows */}
        <div className="py-1">
          {(Object.entries(THEMES) as [ThemeId, (typeof THEMES)[ThemeId]][]).map(
            ([id, meta]) => {
              const isActive = themeId === id;
              const [, , accent] = meta.previewColors;

              return (
                <button
                  key={id}
                  onClick={() => setThemeId(id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors"
                  data-testid={`theme-quick-option-${id}`}
                  aria-pressed={isActive}
                >
                  {/* Swatch */}
                  <span
                    className="h-4 w-4 rounded-full shrink-0 border border-border/30"
                    style={{ backgroundColor: accent }}
                  />

                  {/* Name */}
                  <span className="flex-1 text-sm">{meta.label}</span>

                  {/* Dark/Light badge */}
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                  >
                    {meta.isDark ? "DARK" : "LIGHT"}
                  </Badge>

                  {/* Active checkmark */}
                  <Check
                    className="h-3.5 w-3.5 shrink-0 text-primary"
                    style={{ opacity: isActive ? 1 : 0 }}
                    aria-hidden={!isActive}
                  />
                </button>
              );
            },
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5">
          <Link
            href="/settings/preferences#appearance"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="h-3 w-3" />
            More settings →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
