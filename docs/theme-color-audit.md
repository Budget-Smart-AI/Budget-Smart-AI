# BudgetSmart AI — Multi-Theme Skin System: Hardcoded Color Audit

**Generated:** 2026-03-07  
**Scope:** All `.tsx`, `.jsx`, `.ts`, `.js`, `.css` files under `client/src/`  
**Total files audited:** 136  
**Files with hardcoded colors:** 62  
**Total findings:** ~894 (background + text + border + ring + gradient + inline-style matches)

---

## Existing Theme Infrastructure

### ✅ `client/src/components/theme-provider.tsx`

Custom React context-based theme provider (not `next-themes`, though that package is installed).

| Detail | Value |
|--------|-------|
| Context name | `ThemeProviderContext` |
| Exported hook | `useTheme()` |
| Supported themes | `"light"` \| `"dark"` \| `"system"` |
| Storage key | `localStorage["budget-theme"]` |
| Mechanism | Adds `"light"` or `"dark"` class to `<html>` element |
| System detection | `window.matchMedia("(prefers-color-scheme: dark)")` |

### ✅ `client/src/components/theme-toggle.tsx`

Simple light ↔ dark toggle button using `useTheme()`. No multi-skin support yet.

### ✅ `client/src/App.tsx` (line 433)

```tsx
<ThemeProvider defaultTheme="light" storageKey="budget-theme">
  {/* app content */}
</ThemeProvider>
```

### ✅ `client/src/index.css`

Full CSS variable system already in place for both `:root` (light) and `.dark` (dark mode):

```
--background, --foreground, --card, --card-foreground,
--primary, --primary-foreground, --secondary, --secondary-foreground,
--muted, --muted-foreground, --accent, --accent-foreground,
--destructive, --destructive-foreground,
--border, --input, --ring, --radius,
--sidebar-background, --sidebar-foreground, --sidebar-primary, --sidebar-accent, --sidebar-border, --sidebar-ring,
--chart-1 through --chart-5
```

> **No `ColorModeContext` exists.** The app uses a custom `ThemeProviderContext` with `useTheme()`.

### Tailwind CSS Variable Mapping Reference

The following CSS-variable–backed Tailwind utilities are **safe replacements** for hardcoded colors:

| Hardcoded Pattern | Suggested Tailwind Replacement | CSS Variable |
|-------------------|-------------------------------|--------------|
| `bg-white` / `bg-gray-50` / `bg-gray-100` | `bg-background` / `bg-card` / `bg-muted` | `--background` / `--card` / `--muted` |
| `bg-gray-900` / `bg-black` / `bg-slate-950` | `bg-background` (dark) / `bg-card` | `--background` / `--card` |
| `bg-green-*` / `bg-emerald-*` / `bg-teal-*` | `bg-primary` | `--primary` |
| `bg-slate-800` / `bg-slate-900` | `bg-card` | `--card` |
| `text-white` / `text-black` | `text-foreground` / `text-primary-foreground` | `--foreground` / `--primary-foreground` |
| `text-gray-*` / `text-zinc-*` / `text-slate-*` | `text-muted-foreground` | `--muted-foreground` |
| `text-green-*` / `text-emerald-*` | `text-primary` | `--primary` |
| `border-gray-*` / `border-zinc-*` | `border-border` | `--border` |
| `border-green-*` / `border-emerald-*` | `border-primary` | `--primary` |
| `ring-emerald-*` / `focus:ring-*` | `ring-ring` / `focus:ring-ring` | `--ring` |
| `from-emerald-*` / `to-teal-*` (brand gradient) | `from-primary` / `to-primary` (define gradient stops in vars) | `--primary` |

> **Note on semantic colors:** `text-green-*` for income/positive values and `text-red-*` for expenses/negative values are **semantic** and should be mapped to dedicated CSS variables (e.g., `--income-color`, `--expense-color`, `--success-color`) rather than raw Tailwind primitives, so themes can override them.

> **Note on marketing/auth pages:** `from-slate-950 via-slate-900 to-slate-950` patterns on landing/login/signup pages form a fixed dark-background brand aesthetic. These may warrant a dedicated `--page-bg-gradient-*` variable set.

---

## Findings by File

### `src/components/app-sidebar.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 218 | `bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500` | gradient / bg | `bg-gradient-to-br from-primary via-primary to-primary` (or `bg-primary`) |
| 219 | `text-white` | text | `text-primary-foreground` |
| 221 | `text-white` | text | `text-primary-foreground` |
| 225 | `from-emerald-400 via-green-400 to-teal-400` | gradient text | `from-primary to-primary` (or define `--brand-gradient`) |

---

### `src/components/bank-provider-selection.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 106 | `bg-green-500` | bg | `bg-primary` |
| 106 | `bg-gray-200` | bg | `bg-muted` |
| 187 | `bg-white` | bg | `bg-card` |
| 200 | `text-green-500` | text | `text-primary` |
| 319 | `bg-white` | bg | `bg-card` |
| 340 | `text-green-500` | text | `text-primary` |
| 355 | `bg-green-500` | bg | `bg-primary` |
| 355 | `bg-gray-200` | bg | `bg-muted` |
| 368 | `bg-green-500` | bg | `bg-primary` |
| 368 | `bg-gray-200` | bg | `bg-muted` |
| 381 | `bg-green-500` | bg | `bg-primary` |
| 381 | `bg-gray-200` | bg | `bg-muted` |
| 412 | `bg-gray-50` | bg | `bg-muted` |
| 413 | `text-gray-400` | text | `text-muted-foreground` |

---

### `src/components/cash-flow-forecast.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 99 | `text-green-600` | text (semantic income) | `text-income` (new var) |
| 108 | `text-green-500` | text | `text-primary` |
| 114 | `text-green-600` | text (semantic income) | `text-income` |
| 271 | `text-green-600` | text | `text-primary` |

---

### `src/components/financial-health-score.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 60 | `bg-emerald-100 dark:bg-emerald-950/50` | bg | `bg-primary/10` |
| 61 | `text-emerald-700 dark:text-emerald-400` | text | `text-primary` |
| 62 | `border-emerald-200 dark:border-emerald-800` | border | `border-primary/30` |
| 68 | `bg-teal-100 dark:bg-teal-950/50` | bg | `bg-primary/10` |
| 159 | `text-emerald-500` | text | `text-primary` |
| 166 | `border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400` | border + text | `border-primary/30 text-primary` |
| 177 | `[&>div]:bg-emerald-500` | bg | `[&>div]:bg-primary` |
| 215 | `border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30` | border + text + bg | `border-primary/30 text-primary bg-primary/5` |
| 230 | `border-emerald-200 dark:border-emerald-800` | border | `border-primary/30` |
| 251 | `border-emerald-200 dark:border-emerald-800` | border | `border-primary/30` |
| 270 | `border-emerald-200 dark:border-emerald-800` | border | `border-primary/30` |
| 276 | `text-emerald-500` | text | `text-primary` |
| 311 | `bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900` | bg + border | `bg-primary/5 border-primary/20` |
| 312 | `text-emerald-600 dark:text-emerald-400` | text | `text-primary` |
| 325 | `bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900` | bg + border | `bg-primary/5 border-primary/20` |
| 330 | `text-emerald-600 dark:text-emerald-400` | text | `text-primary` |

---

### `src/components/floating-chatbot.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 107 | `from-emerald-500 to-teal-600` | gradient bg | `from-primary to-primary` |
| 112 | `text-white` | text | `text-primary-foreground` |
| 213 | `from-emerald-500 to-teal-500` | gradient | `from-primary to-primary` |
| 216 | `from-emerald-500 via-teal-500 to-cyan-500` | gradient bg | `from-primary via-primary to-primary` |
| 218 | `from-white/20 to-transparent` | gradient overlay | keep (decorative) |
| 222 | `text-white` | text | `text-primary-foreground` |
| 252 | `from-emerald-500 via-teal-500 to-cyan-500 text-white` | gradient + text | `from-primary via-primary to-primary text-primary-foreground` |
| 254 | `bg-white/20` | bg overlay | `bg-primary-foreground/20` |
| 268 | `text-white hover:bg-white/20` | text + bg | `text-primary-foreground hover:bg-primary-foreground/20` |
| 276 | `text-white hover:bg-white/20` | text + bg | `text-primary-foreground hover:bg-primary-foreground/20` |
| 293 | `from-emerald-500/20 to-teal-500/20` | gradient | `from-primary/20 to-primary/20` |
| 294 | `text-emerald-600` | text | `text-primary` |
| 323 | `from-emerald-500 to-teal-600` | gradient | `from-primary to-primary` |
| 324 | `text-white` | text | `text-primary-foreground` |
| 355 | `from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600` | gradient | `bg-primary hover:bg-primary/90` |

---

### `src/components/household-settings.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 929 | `bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800` | bg + border | `bg-primary/5 border-primary/20` |
| 930 | `text-green-600` | text | `text-primary` |

---

### `src/components/mobile-receipt-scanner.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 195 | `text-gray-600` | text | `text-muted-foreground` |
| 242 | `text-gray-600` | text | `text-muted-foreground` |
| 279 | `text-gray-500` | text | `text-muted-foreground` |
| 300 | `text-gray-500` | text | `text-muted-foreground` |
| 368 | `text-gray-600` | text | `text-muted-foreground` |
| 377 | `text-gray-500` | text | `text-muted-foreground` |
| 379 | `text-gray-500` | text | `text-muted-foreground` |
| 384 | `text-gray-500` | text | `text-muted-foreground` |
| 386 | `text-gray-500` | text | `text-muted-foreground` |
| 396 | `bg-gray-50` | bg | `bg-muted` |
| 408 | `text-gray-500` | text | `text-muted-foreground` |
| 414 | `text-gray-500` | text | `text-muted-foreground` |
| 429 | `bg-gray-50` | bg | `bg-background` |
| 431 | `bg-white` | bg | `bg-card` |
| 435 | `text-gray-500` | text | `text-muted-foreground` |
| 445 | `bg-gray-200` | bg | `bg-muted` |
| 446 | `bg-gray-200` | bg | `bg-muted` |
| 447 | `bg-gray-200` | bg | `bg-muted` |
| 458 | `bg-white` | bg | `bg-card` |

---

### `src/components/money-timeline.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 75 | `bg-emerald-500` | bg | `bg-primary` |
| 83 | `bg-emerald-500/10 border-emerald-500/30` | bg + border | `bg-primary/10 border-primary/30` |
| 159 | `text-emerald-500` | text | `text-primary` |
| 166 | `text-emerald-600 dark:text-emerald-400` | text | `text-primary` |
| 240 | `bg-emerald-500` | bg | `bg-primary` |
| 241 | `bg-gray-400` | bg | `bg-muted-foreground` |
| 257 | `text-emerald-500` | text | `text-primary` |

---

### `src/components/onboarding-wizard.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 488 | `text-green-500` | text | `text-primary` |

---

### `src/components/pwa-install-prompt.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 182 | `bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800` | bg + border | `bg-primary/5 border-primary/20` |
| 183 | `text-green-600` | text | `text-primary` |
| 184 | `text-green-700 dark:text-green-300` | text | `text-primary` |
| 215–218 | same as 182–184 | bg + text | `bg-primary/5 border-primary/20 text-primary` |
| 295 | `bg-green-600` | bg | `bg-primary` |
| 436–438 | same as 182–184 | bg + text | `bg-primary/5 border-primary/20 text-primary` |

---

### `src/components/receipt-scanner.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 340 | `bg-green-100 text-green-700 border-green-200` | bg + text + border | `bg-primary/10 text-primary border-primary/20` |
| 349 | `bg-black` | bg | `bg-background` (full-screen overlay, dark always) |
| 365 | `text-white/70` | text | `text-primary-foreground/70` |
| 371 | `bg-black/60` | bg overlay | keep (camera overlay) |
| 590 | `text-green-500` | text | `text-primary` |
| 764 | `text-green-600` | text | `text-primary` |

---

### `src/components/referral-program.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 158 | `bg-green-600` | bg | `bg-primary` |
| 232 | `text-green-500` | text | `text-primary` |

---

### `src/components/sales-chatbot.tsx`

> This component uses violet/purple branding intentionally to distinguish it from the main AI assistant. These may be kept as-is or mapped to a `--sales-primary` variable.

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 127 | `from-violet-500 to-purple-600` | gradient | `from-[--sales-primary] to-[--sales-primary-dark]` or keep |
| 132 | `text-white` | text | `text-primary-foreground` |
| 272 | `from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700` | gradient | keep (sales branding) |
| 434 | `from-violet-500 to-purple-500` | gradient | keep (sales branding) |
| 437 | `from-violet-500 via-purple-500 to-fuchsia-500` | gradient | keep (sales branding) |
| 448 | `bg-green-500` | bg | `bg-primary` |
| 449 | `text-white` | text | `text-primary-foreground` |
| 474 | `from-violet-500 via-purple-500 to-fuchsia-500 text-white` | gradient + text | keep (sales branding) |
| 552 | `text-white` | text | `text-primary-foreground` |

---

### `src/components/settings-layout.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 95 | `bg-[#1a365d] text-white` | inline bg + text | `bg-primary text-primary-foreground` |
| 121 | `bg-[#1a365d] text-white` | inline bg + text | `bg-primary text-primary-foreground` |

---

### `src/components/smart-savings.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 149 | `bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800` | bg + border | `bg-primary/5 border-primary/20` |
| 151 | `text-green-600 dark:text-green-400` | text | `text-primary` |
| 154 | `text-green-600 dark:text-green-400` | text | `text-primary` |
| 176 | `text-green-600 dark:text-green-400` | text | `text-primary` |
| 224 | `text-green-500` | text | `text-primary` |

---

### `src/components/spendability-widget.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 53 | `text-emerald-500` | text | `text-primary` |
| 59 | `bg-emerald-500/10 border-emerald-500/30` | bg + border | `bg-primary/10 border-primary/30` |

---

### `src/components/subscription-gate.tsx`

> This component renders full-screen dark-mode marketing/paywall UI. The dark slate background and emerald brand accent are intentional.

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 91 | `from-slate-950 via-slate-900 to-slate-950` | gradient bg | `from-[--page-bg] via-[--page-bg-mid] to-[--page-bg]` |
| 92 | `text-emerald-500` | text | `text-primary` |
| 119–120 | `from-slate-950 via-slate-900 to-slate-950`, `bg-slate-900/50 border-slate-800` | bg | `bg-[--page-bg]`, `bg-card border-border` |
| 122 | `from-emerald-500 via-green-500 to-teal-500` | gradient | `from-primary to-primary` |
| 123 | `text-white` | text | `text-primary-foreground` |
| 128 | `text-white` | text | `text-foreground` |
| 129 | `text-slate-400` | text | `text-muted-foreground` |
| 149 | `border-slate-700 text-white hover:bg-slate-800` | border + text + bg | `border-border text-foreground hover:bg-muted` |
| 163 | `from-emerald-500 via-green-500 to-teal-500` | gradient | `from-primary to-primary` |
| 169 | `text-white` | text | `text-foreground` |
| 170 | `text-slate-400` | text | `text-muted-foreground` |
| 182 | `bg-slate-900/50 border-slate-800` | bg + border | `bg-card border-border` |
| 184 | `text-white` | text | `text-foreground` |
| 185 | `text-emerald-400` | text | `text-primary` |
| 192 | `bg-emerald-500/20` | bg | `bg-primary/20` |
| 235 | `bg-slate-900/50 border-emerald-500/50` | bg + border | `bg-card border-primary/50` |
| 240 | `bg-emerald-500` | bg | `bg-primary` |
| 245 | `text-slate-400` | text | `text-muted-foreground` |
| 265–266 | `hover:border-emerald-500`, `border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/50` | border + bg + ring | `hover:border-primary border-primary bg-primary/10 ring-2 ring-primary/50` |
| 266 | `border-slate-700` | border | `border-border` |

---

### `src/components/transaction-drilldown.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 527 | `text-emerald-600` | text | `text-primary` |

---

### `src/components/ui/alert-dialog.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 19 | `bg-black/80` | bg overlay | keep (modal backdrop, intentionally opaque dark) |

---

### `src/components/ui/badge.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 8 | `focus:ring-ring` | ring | ✅ already uses CSS variable — no change needed |

---

### `src/components/ui/dialog.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 47 | `focus:ring-ring` | ring | ✅ already uses CSS variable |

---

### `src/components/ui/drawer.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| (see full file) | Uses `bg-background`, `text-foreground` etc. | ✅ already uses CSS variables |

---

### `src/components/ui/select.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 22 | `focus:ring-ring` | ring | ✅ already uses CSS variable |

---

### `src/components/ui/sheet.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 68 | `focus:ring-ring` | ring | ✅ already uses CSS variable |

---

### `src/components/ui/toast.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 63 | `focus:ring-ring` | ring | ✅ already uses CSS variable |
| 78 | `group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600` | text + ring | `group-[.destructive]:text-destructive-foreground/70 … focus:ring-destructive` |

---

### `src/pages/admin-ai-management.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 156 | `bg-green-600 text-white` | bg + text | `bg-primary text-primary-foreground` |
| 165 | `text-green-600 border-green-600` | text + border | `text-primary border-primary` |
| 241 | `text-green-600` | text | `text-primary` |

---

### `src/pages/admin-bank-providers.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 74 | `border-green-200 bg-green-50/30 dark:bg-green-950/10` | border + bg | `border-primary/20 bg-primary/5` |
| 78 | `bg-white dark:bg-muted` | bg | `bg-card` |
| 85 | `bg-green-600 text-white` | bg + text | `bg-primary text-primary-foreground` |
| 237 | `text-green-600` | text | `text-primary` |
| 305 | `bg-green-600 text-white` | bg + text | `bg-primary text-primary-foreground` |

---

### `src/pages/admin-landing.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 1239 | `bg-emerald-500` | bg | `bg-primary` |
| 1836 | `bg-slate-100 dark:bg-slate-800` | bg | `bg-muted` |
| 1981 | `bg-slate-700` | bg | `bg-muted` |
| 1982 | `bg-emerald-500` | bg | `bg-primary` |
| 1984 | `bg-green-500` | bg | `bg-primary` |

---

### `src/pages/admin-sales-chat.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 98 | `bg-green-500/10 text-green-500 border-green-500/20` | bg + text + border | `bg-primary/10 text-primary border-primary/20` |
| 115 | `bg-green-500/10 text-green-500 border-green-500/20` | bg + text + border | `bg-primary/10 text-primary border-primary/20` |
| 190 | `from-violet-500 to-purple-600` | gradient | keep (sales branding) |
| 196 | `text-white` | text | `text-primary-foreground` |
| 335 | `from-violet-500 to-purple-600 hover:…` | gradient | keep (sales branding) |
| 423 | `text-green-500 border-green-500/20` | text + border | `text-primary border-primary/20` |
| 628 | `text-green-500` | text | `text-primary` |
| 634 | `text-green-500` | text | `text-primary` |

---

### `src/pages/admin-support.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 48 | `bg-green-500/20 text-green-400 border-green-500/30` | bg + text + border | `bg-primary/20 text-primary border-primary/30` |
| 57 | `bg-gray-500/20 text-gray-400 border-gray-500/30` | bg + text + border | `bg-muted text-muted-foreground border-border` |
| 58 | `bg-slate-500/20 text-slate-400 border-slate-500/30` | bg + text + border | `bg-muted text-muted-foreground border-border` |
| 386 | `from-violet-600 via-indigo-600 to-blue-600` | gradient | keep (admin branding) |
| 387 | `text-white` | text | `text-primary-foreground` |

---

### `src/pages/admin-system-status.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 50 | `bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400` | bg + text | `bg-primary/10 text-primary` |
| 59 | `bg-green-50/40 dark:bg-green-950/10` | bg | `bg-primary/5` |
| 118 | `text-green-500` | text | `text-primary` |
| 122 | `text-green-600 dark:text-green-400` | text | `text-primary` |
| 147 | `text-green-500` | text | `text-primary` |
| 151 | `text-green-600 dark:text-green-400` | text | `text-primary` |
| 390 | `bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400` | bg + text | `bg-primary/10 text-primary` |

---

### `src/pages/admin-users.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 459 | `bg-green-600` | bg | `bg-primary` |
| 474 | `bg-emerald-600` | bg | `bg-primary` |
| 497 | `border-green-500 text-green-600` | border + text | `border-primary text-primary` |
| 503 | `border-gray-500 text-gray-600` | border + text | `border-border text-muted-foreground` |
| 506 | `border-gray-400 text-gray-500` | border + text | `border-border text-muted-foreground` |
| 526 | `bg-green-600` | bg | `bg-primary` |
| 546 | `text-green-600` | text | `text-primary` |

---

### `src/pages/affiliate.tsx`

> Most of this page uses dark slate + emerald brand on a marketing-page dark background. The `bg-slate-950`/`bg-slate-900` page backgrounds and `text-slate-*` text are intentional branding. Consider a dedicated `--marketing-bg` variable.

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 368 | `from-slate-950 via-slate-900 to-slate-950` | page bg gradient | `from-[--marketing-bg] via-[--marketing-bg-mid] to-[--marketing-bg]` |
| 374 | `from-emerald-400 to-teal-400` | text gradient | `from-primary to-primary` |
| 385 | `from-emerald-500 to-teal-500` | button gradient | `bg-primary hover:bg-primary/90` |
| 403 | `bg-emerald-500/10 text-emerald-400 border-emerald-500/20` | badge | `bg-primary/10 text-primary border-primary/20` |
| 407 | `text-white` | text | `text-foreground` (on dark bg) |
| 409 | `from-emerald-400 to-teal-400` | text gradient | `from-primary to-primary` |
| 415 | `text-slate-400` | text | `text-muted-foreground` |
| 421 | `from-emerald-500 to-teal-500` | button | `bg-primary hover:bg-primary/90` |
| 448 | `text-emerald-400` | text | `text-primary` |
| 496 | `from-emerald-500 to-teal-500 text-white` | gradient + text | `bg-primary text-primary-foreground` |
| 500 | `text-white` | text | `text-primary-foreground` |
| 505 | `text-slate-400` | text | `text-muted-foreground` |
| 565 | `text-white` | text | `text-foreground` (on dark bg) |
| 576 | `text-emerald-400` | text | `text-primary` |
| 608 | `accent-emerald-500` | slider accent | `accent-primary` |
| 906 | `from-emerald-500 to-teal-500` | button gradient | `bg-primary hover:bg-primary/90` |

---

### `src/pages/ai-assistant.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 188 | `from-emerald-500 via-teal-500 to-cyan-500` | gradient | `from-primary via-primary to-primary` |
| 193 | `text-white` | text | `text-primary-foreground` |
| 332 | `from-emerald-500/30 to-teal-500/30` | gradient glow | `from-primary/30 to-primary/30` |
| 333 | `from-emerald-500 via-teal-500 to-cyan-500` | gradient | `from-primary via-primary to-primary` |
| 334 | `text-white` | text | `text-primary-foreground` |
| 339 | `from-emerald-600 to-teal-600` | text gradient | `from-primary to-primary` |
| 372 | `from-emerald-500 via-teal-500 to-cyan-500` | gradient | `from-primary to-primary` |
| 373 | `text-white` | text | `text-primary-foreground` |

---

### `src/pages/anomalies.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 129 | `text-green-500` | text | `text-primary` |

---

### `src/pages/assets.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 320 | `text-green-600` | text (income positive) | `text-income` (semantic var) |
| 379 | `text-green-600` | text (gain positive) | `text-income` |

---

### `src/pages/bank-accounts.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 473 | `bg-white` | bg | `bg-card` |
| 488 | `text-green-600` | text (credit positive) | `text-income` |
| 1484 | `text-green-600` | text (credit positive) | `text-income` |
| 1542 | `text-green-500` | text | `text-primary` |
| 1545 | `text-green-600` | text | `text-primary` |
| 1861 | `bg-white` | bg | `bg-card` |
| 1866 | `text-white` | text | `text-primary-foreground` |
| 1867 | `style={{ backgroundColor: CATEGORY_COLORS[…] \|\| '#71717a' }}` | inline style | use CSS variable or Tailwind class |
| 1891 | `text-green-600` | text (credit) | `text-income` |
| 1923 | `style={{ color: CATEGORY_COLORS[…] \|\| '#71717a' }}` | inline style | use CSS variable or Tailwind class |
| 1960 | `bg-green-100 text-green-800 hover:bg-green-100` | bg + text | `bg-primary/10 text-primary hover:bg-primary/10` |

---

### `src/pages/budgets.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 424 | `text-green-600` | text (under budget) | `text-income` |
| 498 | `text-green-600` | text | `text-primary` |
| 578 | `border-green-300 text-green-700` | border + text | `border-primary/30 text-primary` |

---

### `src/pages/calendar.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 41 | `bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800` | income event style | `bg-primary/10 text-primary border-primary/20` |
| 43 | `bg-gray-100 text-gray-800` | bg + text | `bg-muted text-muted-foreground` |
| 122 | `text-green-600` | text | `text-primary` |
| 248 | `bg-green-100 text-green-600` | bg + text | `bg-primary/10 text-primary` |
| 261 | `text-green-600` | text | `text-primary` |
| 287 | `bg-green-100 border border-green-200` | bg + border | `bg-primary/10 border-primary/20` |

---

### `src/pages/categories.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 225 | `style={{ backgroundColor: color }}` | inline style (user-chosen color) | keep (user-defined) |
| 274 | `style={{ backgroundColor: category.color }}` | inline style (user-chosen color) | keep (user-defined) |
| 408 | `text-green-500` | text | `text-primary` |

---

### `src/pages/dashboard.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 187 | `from-emerald-500 to-teal-500` | gradient | `from-primary to-primary` |
| 192 | `text-white` | text | `text-primary-foreground` |
| 210 | `border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30` | combined | `border-primary/20 text-primary bg-primary/5` |
| 282 | `bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400` | bg + text | `bg-primary/10 text-primary` |
| 284 | `bg-teal-100 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400` | bg + text | `bg-primary/10 text-primary` |
| 303 | `text-emerald-600 dark:text-emerald-400` | text | `text-primary` |
| 723 | `from-emerald-600 via-teal-600 to-cyan-600` | text gradient | `from-primary to-primary` |
| 780 | `bg-white/60 dark:bg-black/20` | bg | `bg-card/60` |
| 946 | `border-emerald-200 dark:border-emerald-800 from-emerald-50/50 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10` | border + gradient | `border-primary/20 from-primary/5 to-primary/5` |
| 1034 | `bg-amber-500 hover:bg-amber-600 text-white` | bg (amber accent) | consider `bg-warning` CSS var |
| 1057 | `text-emerald-600` | text | `text-primary` |
| 1066 | `text-emerald-600` | text | `text-primary` |
| 1075 | `text-emerald-600` | text | `text-primary` |
| 1090 | `text-emerald-600 dark:text-emerald-400` | text | `text-primary` |

---

### `src/pages/debt-payoff.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 541 | `text-green-600` | text | `text-primary` |
| 555 | `bg-green-100 dark:bg-green-950` | bg | `bg-primary/10` |
| 556 | `text-green-600` | text | `text-primary` |
| 787 | `bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800` | bg + border | `bg-primary/5 border-primary/20` |
| 789 | `text-green-600` | text | `text-primary` |
| 790 | `text-green-800 dark:text-green-200` | text | `text-primary` |
| 820 | `bg-green-600` | bg | `bg-primary` |
| 871 | `text-green-600` | text | `text-primary` |

---

### `src/pages/email-settings.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 230 | `bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800` | bg + border | `bg-primary/5 border-primary/20` |
| 236 | `text-green-600 dark:text-green-400` | text | `text-primary` |
| 244 | `text-green-800 dark:text-green-200` | text | `text-primary` |
| 254 | `text-green-700 dark:text-green-300` | text | `text-primary` |

---

### `src/pages/help.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 95 | `text-emerald-500` | text | `text-primary` |
| 119 | `text-green-500` | text | `text-primary` |
| 339 | `text-gray-500` | text | `text-muted-foreground` |
| 408 | `from-violet-600 via-indigo-600 to-blue-600` | gradient | keep (admin branding) |
| 409 | `text-white` | text | `text-primary-foreground` |
| 418 | `from-indigo-500/5 to-violet-500/5` | gradient bg | keep or define `--admin-accent` |

---

### `src/pages/income.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 811 | `text-green-600` | text (income positive) | `text-income` |
| 894 | `text-green-600` | text | `text-primary` |
| 956 | `text-green-600` | text | `text-primary` |

---

### `src/pages/investments.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 187 | `bg-green-100 text-green-800` | bg + text (buy signal) | `bg-primary/10 text-primary` |
| 192 | `bg-gray-100 text-gray-700` | bg + text (hold signal) | `bg-muted text-muted-foreground` |
| 854 | `text-green-600` | text (gain positive) | `text-income` |
| 993 | `text-green-600` | text (gain) | `text-income` |
| 1262 | `text-green-600` | text | `text-income` |
| 1271 | `text-green-600` | text | `text-income` |
| 1384 | `text-green-600` | text | `text-income` |

---

### `src/pages/invitation.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 267 | `bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800` | bg + border | `bg-primary/5 border-primary/20` |

---

### `src/pages/landing.tsx`

> This is a marketing/public page with a fixed dark-theme brand aesthetic. The `from-slate-950 via-slate-900 to-slate-950` page background is intentional. Consider a `--marketing-bg` variable family.

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 39–40 | `from-emerald-500 to-teal-500`, `from-emerald-500/20 to-teal-500/20` | gradient stops | `from-primary to-primary`, `from-primary/20 to-primary/20` |
| 46–47 | `from-blue-500 to-indigo-500` | gradient | keep (feature differentiation color) |
| 53–54 | `from-purple-500 to-pink-500` | gradient | keep (feature differentiation color) |
| 294 | `from-slate-800/95 to-slate-900/95 text-white` | bg + text | `bg-card text-foreground` |
| 295 | `from-emerald-500/95 to-teal-600/95 text-white` | bg + text | `bg-primary text-primary-foreground` |
| 665 | `from-emerald-500 to-teal-500 text-white` | badge | `bg-primary text-primary-foreground` |
| 669 | `from-slate-800 to-slate-900 border-emerald-500/50` | bg + border | `bg-card border-primary/50` |
| 717 | `from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white` | button | `bg-primary hover:bg-primary/90 text-primary-foreground` |
| 854 | `from-slate-950 via-slate-900 to-slate-950` | page bg | `bg-background` (marketing var) |
| 875 | `from-slate-950 via-slate-900 to-slate-950 text-white` | page bg + text | `bg-background text-foreground` |
| 891 | `from-emerald-500 via-green-500 to-teal-500` | logo gradient | `from-primary to-primary` |
| 897 | `from-emerald-400 via-green-400 to-teal-400` | brand name gradient | `from-primary to-primary` |
| 927 | `from-emerald-500 to-teal-500 text-white` | CTA button | `bg-primary text-primary-foreground` |
| 1120 | `from-emerald-500/5 to-teal-500/5` | decorative glow | `from-primary/5 to-primary/5` |
| 1141 | `from-emerald-500 to-teal-500 text-white` | CTA button | `bg-primary text-primary-foreground` |
| 1552 | `from-emerald-600 to-teal-600` | hero section bg | `from-primary to-primary` |
| 1582 | `from-emerald-500 via-green-500 to-teal-500` | logo mark | `from-primary to-primary` |

---

### `src/pages/login.tsx`

> Same dark marketing aesthetic as landing/signup.

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 582 | `from-slate-950 via-slate-900 to-slate-950 text-white` | page bg + text | `bg-background text-foreground` (marketing var) |
| 588 | `from-emerald-500 via-green-500 to-teal-500` | logo gradient | `from-primary to-primary` |
| 594 | `from-emerald-400 via-green-400 to-teal-400` | brand name gradient | `from-primary to-primary` |

---

### `src/pages/net-worth.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 148 | `text-green-600` | text (positive change) | `text-income` |
| 162 | `text-green-600` | text | `text-primary` |
| 165 | `text-green-600` | text | `text-primary` |
| 172 | `style={{ backgroundColor: ASSET_COLORS[i] }}` | inline chart color | keep (chart / data-driven) |
| 198 | `style={{ backgroundColor: LIABILITY_COLORS[i] }}` | inline chart color | keep (chart / data-driven) |
| 253 | `text-green-600` | text | `text-primary` |
| 262 | `bg-green-500` | bg (legend dot) | `bg-primary` |

---

### `src/pages/not-found.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 6 | `bg-gray-50` | bg | `bg-background` |
| 11 | `text-gray-900` | text | `text-foreground` |
| 14 | `text-gray-600` | text | `text-muted-foreground` |

---

### `src/pages/receipts.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 66 | `bg-black/60` | bg overlay | keep (camera/modal overlay) |

---

### `src/pages/reports.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 579 | `text-green-600` | text (savings rate positive) | `text-income` |
| 588 | `text-green-600` | text | `text-income` |
| 594 | `bg-green-500` | bg (bar chart) | `bg-primary` |
| 680 | `style={{ backgroundColor: CATEGORY_COLORS[…] \|\| "#6b7280" }}` | inline chart color | keep (chart / data-driven) |
| 837 | `text-green-600` | text (YTD income) | `text-income` |
| 849 | `text-green-600` | text | `text-income` |
| 860 | `bg-green-500` | bg (bar fill) | `bg-primary` |
| 871 | `text-green-600` | text | `text-income` |
| 896 | `bg-green-500` | bg (bar fill) | `bg-primary` |
| 918 | `bg-green-500` | bg (legend dot) | `bg-primary` |
| 930 | `text-green-600` | text | `text-income` |
| 1069 | `text-green-500` | text | `text-primary` |
| 1199 | `text-green-600` | text | `text-income` |
| 1219–1220 | `text-green-500` | text | `text-primary` |
| 1249 | `text-green-600` | text | `text-income` |
| 1303 | `style={{ backgroundColor: CATEGORY_COLORS[…] \|\| "#6b7280" }}` | inline chart color | keep (chart / data-driven) |
| 1343 | `bg-green-500` | bg (bar fill) | `bg-primary` |
| 1365 | `bg-green-500` | bg (legend dot) | `bg-primary` |

---

### `src/pages/savings-goals.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 211 | `style={{ backgroundColor: color.value }}` | inline (user-chosen color picker) | keep (user-defined) |
| 455 | `text-green-600` | text | `text-primary` |
| 507 | `style={{ backgroundColor: goal.color \|\| "#3b82f6" }}` | inline (user goal color) | keep (user-defined) |
| 511 | `style={{ color: goal.color \|\| "#3b82f6" }}` | inline (user goal color) | keep (user-defined) |
| 528 | `style={{ color: goal.color \|\| "#3b82f6" }}` | inline (user goal color) | keep (user-defined) |
| 541 | `style={{ "--progress-background": goal.color \|\| "#3b82f6" }}` | CSS custom prop (user goal color) | keep (user-defined) |
| 546 | `text-green-600` | text | `text-primary` |
| 682 | `text-green-600` | text | `text-income` |
| 720 | `bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400` | bg + text | `bg-primary/10 text-primary` |
| 743 | `text-green-500` | text | `text-primary` |
| 773–774 | `text-green-600` | text | `text-primary` |

---

### `src/pages/settings.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 146 | `bg-emerald-500`, `bg-teal-500`, `bg-cyan-500`, `bg-blue-500`, etc. (avatar colors array) | bg | keep (user-selectable avatar colors) |
| 148 | `bg-green-500` (in avatar colors array) | bg | keep (user-selectable) |
| 202 | `bg-green-500` (password strength) | bg | `bg-primary` |
| 926 | `from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600` | button | `bg-primary hover:bg-primary/90` |
| 939 | `bg-emerald-500 text-white` (Active badge) | bg + text | `bg-primary text-primary-foreground` |
| 942 | `bg-amber-500 text-white` (Trial badge) | bg (warning) | `bg-warning text-warning-foreground` (add `--warning` var) |
| 1594 | (avatarColor class from array) | bg | keep (user-selectable) |
| 1601 | `bg-black/50` | bg overlay | keep (photo overlay) |
| 1602–1603 | `text-white` | text | `text-primary-foreground` |
| 1689 | `text-emerald-500` | text | `text-primary` |
| 1953 | `from-emerald-500 to-teal-500 hover:…` | button | `bg-primary hover:bg-primary/90` |
| 1992 | `bg-green-600` | bg | `bg-primary` |
| 2038 | `bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800` | bg + border | `bg-primary/5 border-primary/20` |
| 2039 | `text-green-600` | text | `text-primary` |
| 2040 | `text-green-700 dark:text-green-400` | text | `text-primary` |
| 2182 | `bg-green-600` | bg | `bg-primary` |
| 2298 | `bg-white` | bg | `bg-card` |
| 2374 | `text-green-600` | text | `text-primary` |

---

### `src/pages/setup-mfa.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 174 | `bg-white` | bg | `bg-card` |
| 194 | `text-green-500` | text | `text-primary` |

---

### `src/pages/signup.tsx`

> Same dark marketing aesthetic as landing/login.

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 268 | `from-emerald-500 to-teal-500 hover:…` | button | `bg-primary hover:bg-primary/90` |
| 484 | `from-emerald-500 to-teal-500 hover:…` | button | `bg-primary hover:bg-primary/90` |
| 579 | `ring-2 ring-emerald-500/50` | ring | `ring-2 ring-primary/50` |
| 584 | `from-emerald-500 to-teal-500 text-white` | badge | `bg-primary text-primary-foreground` |
| 614 | `from-emerald-500/10 to-teal-500/10 border border-emerald-500/20` | bg + border | `bg-primary/10 border-primary/20` |
| 636 | `from-emerald-500 to-teal-500` | button | `bg-primary hover:bg-primary/90` |
| 666 | `from-slate-950 via-slate-900 to-slate-950` | page bg | `bg-background` (marketing var) |
| 673 | `from-slate-950 via-slate-900 to-slate-950 text-white` | page bg + text | marketing var |
| 677 | `from-emerald-500 via-green-500 to-teal-500` | logo | `from-primary to-primary` |
| 683 | `from-emerald-400 via-green-400 to-teal-400` | brand name | `from-primary to-primary` |

---

### `src/pages/simulator.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 310 | `text-emerald-500` | text | `text-primary` |
| 325 | `bg-emerald-500/10 border border-emerald-500/30` | bg + border | `bg-primary/10 border-primary/30` |
| 338 | `text-emerald-500` | text | `text-primary` |
| 348 | `text-emerald-500` | text | `text-primary` |
| 357 | `bg-emerald-500/10 border border-emerald-500/30` | bg + border | `bg-primary/10 border-primary/30` |
| 358 | `text-emerald-500` | text | `text-primary` |
| 362 | `text-emerald-500` | text | `text-primary` |
| 379 | `text-emerald-500` | text | `text-primary` |
| 383 | `text-emerald-500` | text | `text-primary` |
| 408 | `bg-emerald-500` | bg | `bg-primary` |
| 411 | `text-emerald-600 dark:text-emerald-400` | text | `text-primary` |
| 414 | `text-emerald-600 dark:text-emerald-400` | text | `text-primary` |

---

### `src/pages/split-expenses.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 541 | `border-green-200 dark:border-green-800` | border | `border-primary/20` |
| 544 | `text-green-600` | text | `text-primary` |
| 561 | `text-green-600` | text | `text-income` |
| 618 | `bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300` | bg + text | `bg-primary/10 text-primary` |

---

### `src/pages/support.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 63 | `bg-green-500/20 text-green-400 border-green-500/30` | bg + text + border | `bg-primary/20 text-primary border-primary/30` |
| 257 | `from-violet-600 via-indigo-600 to-blue-600` | gradient | keep (admin/support branding) |
| 258 | `text-white` | text | `text-primary-foreground` |
| 268 | `from-indigo-500/5 to-violet-500/5` | gradient bg | keep or define `--admin-accent` |
| 290 | `bg-green-500/10` | bg | `bg-primary/10` |
| 291 | `text-green-500` | text | `text-primary` |

---

### `src/pages/vault.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 85 | `bg-green-500/20 text-green-400 border-green-500/30` | bg + text + border | `bg-primary/20 text-primary border-primary/30` |
| 88 | `bg-gray-500/20 text-gray-400 border-gray-500/30` | bg + text + border | `bg-muted text-muted-foreground border-border` |
| 103 | `text-green-400` | text | `text-primary` |
| 115 | `bg-emerald-500/20 text-emerald-400 border-emerald-500/30` | bg + text + border | `bg-primary/20 text-primary border-primary/30` |
| 163 | `bg-black/70` | bg overlay | keep (full-screen modal backdrop) |
| 188 | `bg-amber-500 hover:bg-amber-600 text-white` | bg (amber CTA) | `bg-warning text-warning-foreground` or keep |
| 285 | `bg-black/60` | bg overlay | keep |
| 300 | `bg-emerald-500/20` | bg | `bg-primary/20` |
| 301 | `text-emerald-400` | text | `text-primary` |
| 342 | `text-emerald-400` | text | `text-primary` |
| 380 | `bg-amber-500 hover:bg-amber-600 text-white` | bg | `bg-warning text-warning-foreground` or keep |
| 508 | `bg-black/40` | bg overlay | keep |
| 585 | `bg-amber-500 hover:bg-amber-600 text-white` | bg | `bg-warning text-warning-foreground` or keep |
| 732 | `bg-amber-500 hover:bg-amber-600 text-white` | bg | `bg-warning text-warning-foreground` or keep |
| 762 | `bg-amber-500 hover:bg-amber-600 text-white` | bg | `bg-warning text-warning-foreground` or keep |
| 1011 | `bg-amber-500 hover:bg-amber-600 text-white` | bg | `bg-warning text-warning-foreground` or keep |
| 1042 | `bg-amber-500 hover:bg-amber-600 text-white` | bg | `bg-warning text-warning-foreground` or keep |
| 1058 | `bg-amber-500 text-white border-amber-500` | bg + border | `bg-warning text-warning-foreground border-warning` or keep |
| 1064 | `bg-white/20` | bg overlay | `bg-primary-foreground/20` or keep |

---

### `src/pages/verify-email.tsx`

| Line | Hardcoded Class / Style | Category | Suggested Replacement |
|------|------------------------|----------|-----------------------|
| 86 | `bg-green-500/10` | bg | `bg-primary/10` |
| 87 | `text-green-500` | text | `text-primary` |

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Background classes (`bg-*`) | 220 |
| Text color classes (`text-*`) | 386 |
| Border color classes (`border-*`) | 63 |
| Ring / focus-ring classes | 8 |
| Gradient classes (`from-*`, `via-*`, `to-*`) | 105 |
| Inline styles (`style={{ color/background/… }}`) | 13 |
| **Total** | **~795** |

---

## Recommended New CSS Variables to Add

To support a fully theme-swappable system, add the following to `client/src/index.css` and `tailwind.config.ts`:

```css
/* Semantic financial colors */
--income-color: <green hsl>;          /* positive amounts, income, gains */
--expense-color: <red hsl>;           /* negative amounts, debits */

/* Warning / CTA accent (amber/vault) */
--warning: <amber hsl>;
--warning-foreground: <amber text hsl>;

/* Marketing / Auth page backgrounds */
--marketing-bg: <slate-950 hsl>;
--marketing-bg-mid: <slate-900 hsl>;

/* (Optional) Admin/support accent */
--admin-accent-from: <violet hsl>;
--admin-accent-to: <indigo hsl>;
```

And in `tailwind.config.ts`:
```ts
income: "hsl(var(--income-color))",
expense: "hsl(var(--expense-color))",
warning: "hsl(var(--warning))",
"warning-foreground": "hsl(var(--warning-foreground))",
"marketing-bg": "hsl(var(--marketing-bg))",
```

---

## Files That Do NOT Require Changes

The following UI primitives already use CSS variable–backed utilities exclusively:

- `src/components/ui/accordion.tsx`
- `src/components/ui/alert.tsx`
- `src/components/ui/avatar.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/calendar.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/carousel.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/command.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/form.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/pagination.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/progress.tsx`
- `src/components/ui/radio-group.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/slider.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/toggle.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/theme-provider.tsx`
- `src/components/theme-toggle.tsx`
- `src/lib/utils.ts`
- `src/hooks/use-mobile.tsx`
- `src/hooks/use-toast.ts`

---

## Patterns to Keep As-Is (Do Not Replace)

The following hardcoded values are intentional and should **not** be converted to theme tokens:

1. **User-defined colors** — `style={{ backgroundColor: category.color }}`, `style={{ color: goal.color }}` in categories/savings-goals/net-worth. These come from user data and must remain dynamic.

2. **Chart / data-visualization colors** — `CATEGORY_COLORS`, `ASSET_COLORS`, `LIABILITY_COLORS` arrays used in inline styles. These drive chart segments and are data-driven, not theme-driven.

3. **Camera/modal overlays** — `bg-black/60`, `bg-black/70`, `bg-black/40` on camera viewfinders and modal backdrops. These are functional (ensure visibility against any content) and should stay as dark overlays.

4. **Sales chatbot violet/purple branding** — `from-violet-500 via-purple-500 to-fuchsia-500` in `sales-chatbot.tsx`. This widget is intentionally differentiated from the main app branding.

5. **Admin/support violet–indigo gradient** — `from-violet-600 via-indigo-600 to-blue-600` in support/help page header icons. This is consistent admin-UI branding.
