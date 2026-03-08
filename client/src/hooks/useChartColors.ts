import { useMemo } from "react";
import { useThemeContext } from "@/contexts/ThemeContext";

/**
 * Returns chart colors derived from the current theme's CSS variables.
 * Values are recomputed whenever the theme changes.
 */
export function useChartColors() {
  const { themeId } = useThemeContext();

  return useMemo(
    () => ({
      primary:  getHslVar("--primary"),
      accent:   getHslVar("--chart-1"),
      success:  getRgbVar("--color-income"),
      danger:   getRgbVar("--color-expense"),
      warning:  getRgbVar("--color-warning"),
      muted:    getHslVar("--muted-foreground"),
      text:     getHslVar("--foreground"),
      gridLine: getHslVar("--border"),
      tooltip:  getHslVar("--popover"),
      chart1:   getHslVar("--chart-1"),
      chart2:   getHslVar("--chart-2"),
      chart3:   getHslVar("--chart-3"),
      chart4:   getHslVar("--chart-4"),
      chart5:   getHslVar("--chart-5"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeId],
  );
}

/** Read an HSL-channel CSS variable and return a valid `hsl(...)` colour string. */
function getHslVar(varName: string): string {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return val ? `hsl(${val})` : "hsl(0 0% 50%)";
}

/** Read an RGB-channel CSS variable (format: "R G B") and return `rgb(R G B)`. */
function getRgbVar(varName: string): string {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return val ? `rgb(${val})` : "rgb(128 128 128)";
}
