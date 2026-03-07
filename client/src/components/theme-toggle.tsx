import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEMES, type ThemeId, useThemeContext } from "@/contexts/ThemeContext";

export function ThemeToggle() {
  const { themeId, setThemeId } = useThemeContext();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-theme-toggle">
          <Palette className="h-5 w-5" />
          <span className="sr-only">Change theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.entries(THEMES) as [ThemeId, (typeof THEMES)[ThemeId]][]).map(
          ([id, meta]) => (
            <DropdownMenuItem
              key={id}
              onClick={() => setThemeId(id)}
              className="flex items-center gap-2 cursor-pointer"
              data-testid={`theme-option-${id}`}
            >
              {/* Colour swatch preview */}
              <span className="flex gap-0.5 shrink-0">
                {meta.previewColors.map((color, i) => (
                  <span
                    key={i}
                    className="inline-block h-3 w-3 rounded-full border border-border/40"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span className="flex-1">{meta.label}</span>
              {themeId === id && <Check className="h-3.5 w-3.5 shrink-0" />}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

