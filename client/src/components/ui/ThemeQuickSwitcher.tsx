/**
 * Topbar theme toggle — simple one-click switch between Light and Dark.
 *
 * Was a 6-option palette popover; consolidated to a sun/moon icon button
 * when the theme system was reduced to 2 modes (April 2026). Kept the
 * same component name + data-testid so test IDs and imports don't churn.
 */
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeContext } from "@/contexts/ThemeContext";

export function ThemeQuickSwitcher() {
  const { themeId, toggleTheme } = useThemeContext();
  const isDark = themeId === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      data-testid="button-theme-quick-switcher"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
