# Phase 3 — Light-Theme UI Overhaul Plan

Target: bring the BSAI light theme up to the reference mockup's production-SaaS
feel. The existing dark theme already reads well; the deltas below are
light-mode-first, but every change uses theme tokens so dark inherits cleanly.

Gap summary (what the mockup does that we don't):

1. Surfaces are **green-tinted glass**, not near-white. Today
   `--glass-surface: 255 255 255 / 0.55` — cards stack on a mint page and read
   pure white. Mockup cards carry a subtle mint tint that matches the backdrop.
2. The **sidebar is a floating island**, not a flush full-height rail. It has
   margin on all four sides, rounded corners, its own drop shadow, and the
   backdrop blobs peek around it.
3. **Nav typography is bigger and clearer**: group labels ~13px, nav items
   ~14–15px. Today we're at 11px labels and the default shadcn `text-sm` items,
   and main-vs-sub hierarchy is only carried by the L-connector and indent.
4. **Corner radius is larger and more consistent**: mockup uses ~20–24px on
   cards and ~28–32px on the sidebar island. We're on `--radius: .5rem` (8px)
   globally with a grab-bag of `rounded-md`, `rounded-lg`, `rounded-xl` in
   components.
5. **KPI cards are chunkier**: bigger padding, bigger icon tile (10–12 size
   with a colored background), bigger number (28–32px). Ours are 28×28 icon,
   `text-xl` number.
6. **Header greeting is much larger AND not gradient**: mockup reads ~36–40px
   semibold in solid charcoal, not the emerald→teal gradient we use today. The
   brand gradient is reserved for the logo mark and CTAs in the mockup — the
   H1 is neutral, which is what makes it read as production SaaS rather than
   marketing-site. We're at `text-xl md:text-2xl` with `brand-gradient-text`.
7. **KPI numbers are solid-foreground bold, not emerald**: only the *negative*
   card (Total Outgoing) uses color — solid red. Positive cards (Bank Deposits,
   Net Cash Flow, Bills Due) render the number in plain foreground so the eye
   reads the magnitude first and the color system stays meaningful. Today every
   "income" variant of our KPI card forces emerald text.
8. **Mockup adds a delta pill under the subtitle** (`+4.2%` green for Deposits,
   `+12%` for Outgoing). We already compute `momChangePercent` in the engine
   but don't surface it on the KPI cards — easy win.
9. **Icon tiles in the top-right of each KPI card are bigger and category-colored**:
   green up-arrow for Deposits, red down-arrow for Outgoing, teal `$` for Net
   Cash Flow, amber calendar for Bills Due. Ours are 28px with emerald/red
   only — need a proper category palette.

Everything below is additive — no page-by-page rewrites. The sidebar +
top-bar + dashboard KPI cards + generic `<Card>` get the mockup treatment,
and every other page picks up the new radius / glass tokens for free because
they all render through the same primitives.

---

## Phase 3.0 — Theme tokens (one commit, everything benefits)

File: `client/src/index.css` (the `:root` block, roughly lines 22–212).

### 3.0a — Deepen the light glass

```css
/* before */
--glass-surface:        255 255 255 / 0.55;
--glass-surface-strong: 255 255 255 / 0.72;
--glass-border:         255 255 255 / 0.6;

/* after — mint-tinted so cards read as "green glass" on the mint page */
--glass-surface:        236 250 243 / 0.60;   /* ≈ rgb off #ECFAF3 */
--glass-surface-strong: 219 244 231 / 0.78;   /* ≈ rgb off #DBF4E7 */
--glass-border:         34 197 94 / 0.18;     /* emerald border @ 18% */
--glass-border-soft:    13 148 136 / 0.10;    /* teal soft border */
--glass-shadow:         0 8px 32px rgba(13, 148, 136, 0.14),
                        inset 0 1px 0 rgba(255, 255, 255, 0.5);
--glass-shadow-lg:      0 12px 40px rgba(13, 148, 136, 0.18),
                        inset 0 1px 0 rgba(255, 255, 255, 0.6);
```

Effect: every `.glass-surface` call-site (sidebar inner, any card that opts in)
picks up a mint cast + an emerald-tinted border + a teal drop-shadow instead of
the current flat white.

### 3.0b — Bump the page backdrop saturation

```css
/* before */
--bg-base:   linear-gradient(135deg, #F5FDF8 0%, #E8F7F0 50%, #DCF3E8 100%);
--bg-blob-1: rgba(34, 197, 94, 0.18);
--bg-blob-2: rgba(13, 148, 136, 0.22);
--bg-blob-3: rgba(132, 204, 22, 0.12);

/* after — more visible blobs so the "mist behind glass" effect reads */
--bg-base:   linear-gradient(135deg, #E8F7EF 0%, #D5F0E2 50%, #C3E9D4 100%);
--bg-blob-1: rgba(34, 197, 94, 0.28);
--bg-blob-2: rgba(13, 148, 136, 0.32);
--bg-blob-3: rgba(132, 204, 22, 0.18);
```

### 3.0c — Global radius bump

```css
/* before */
--radius: .5rem;   /* 8px */

/* after */
--radius: 1rem;    /* 16px — Card, Button, Input, Dialog inherit this */
```

Then add KPI-specific radius token for the dashboard hero cards:

```css
--radius-card-lg: 1.5rem;   /* 24px — KPI cards, hero panels */
--radius-island:  1.75rem;  /* 28px — sidebar island, topbar search */
```

Audit sweep: look for hardcoded `rounded-md` on interactive primitives and
replace with `rounded-[var(--radius)]` or leave the Tailwind utility since
shadcn's base primitives already read from `--radius`.

### 3.0d — Nav tokens tuned for the darker glass

The current `--nav-active-bg` already uses the brand gradient at 22%. On the
deeper green surface it'll pop — no change needed, but:

```css
/* before */
--nav-fg:            #1A3020;   /* body text on nav items */
--nav-muted-fg:      #3F6B47;   /* inactive icon tint */
--nav-group-label:   #3F6B47;   /* small caps group label */

/* after — more contrast so labels read against the green-glass surface */
--nav-fg:            #0D2818;
--nav-muted-fg:      #2F5739;
--nav-group-label:   #0D9488;   /* teal — matches mockup's cap label */
```

---

## Phase 3.1 — Sidebar island

Shadcn's `<Sidebar>` ships a `variant="inset"` / `variant="floating"` that
rounds the inner container. We were using the default `sidebar` variant; the
switch to `floating` + glass overrides is the simplest path.

File: `client/src/components/app-sidebar.tsx`

```tsx
<Sidebar variant="floating" className="!border-r-0">
```

File: `client/src/index.css` — the `[data-slot="sidebar-inner"]` block (line
727 ish) already applies the glass background. With `variant="floating"`,
shadcn puts the inner container inside a padded outer; add these tweaks:

```css
/* Floating sidebar: padding around the island + bigger radius */
[data-slot="sidebar-container"][data-variant="floating"] {
  padding: 0.75rem;
}

[data-slot="sidebar-inner"] {
  background: rgb(var(--glass-surface-strong)) !important;
  border: 1px solid rgb(var(--glass-border));
  border-radius: var(--radius-island);
  box-shadow: var(--glass-shadow-lg);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}

/* Strip the full-height border on the outer container now that the
 * inner is its own island. */
[data-slot="sidebar-container"] {
  border-right: 0 !important;
}
```

### 3.1a — Bigger nav typography + clearer hierarchy

Two files touch this: the sidebar component itself (group labels + items) and
`client/src/components/ui/sidebar.tsx` (the shadcn primitive's `SidebarMenuButton`
sizing).

In `app-sidebar.tsx`, update the group-header button (line ~525):

```tsx
className={cn(
  "w-full flex items-center justify-between px-3 py-2 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors",
  hasActive
    ? "text-[color:var(--nav-group-label)]"
    : "text-muted-foreground/80 hover:text-foreground"
)}
```

Diff: `px-2 py-1` → `px-3 py-2`; `text-[11px] font-semibold` → `text-[12px] font-bold`; letter-spacing bumped to mimic the mockup's spacious caps.

In `ui/sidebar.tsx`, find the `SidebarMenuButton` variants and bump the default size from `h-8 text-sm` to `h-10 text-[14px]` for the `default` variant. Verify the icon sizing inside `renderNavItem` (line 439):

```tsx
<item.icon className="h-[18px] w-[18px] shrink-0" />   // was h-4 w-4
<span className="flex-1 truncate font-medium">{item.title}</span>
```

Result: main-nav items become visibly heavier than sub-items (which stay at
14px but indent further via `.nav-sub-item`), matching the mockup's
"section-header vs. child-item" hierarchy.

### 3.1b — Sub-item connector: make it sturdier

Current L-connector uses `rgba(127, 161, 140, 0.35)`. Against the greener glass
it'll disappear. Bump to `rgba(13, 148, 136, 0.45)` (teal @ 45%) in both light
and dark variants.

### 3.1c — Active-state treatment

The current active pill is good — brand gradient at 22% alpha with a thin
emerald border and small green shadow. Two tweaks to match the mockup:

- Move from `rounded-md` (shadcn default) to `rounded-xl` on the
  `SidebarMenuButton`.
- Give the active item a **left accent bar**: 3px-wide solid emerald
  indicator on the left edge, offset 4px from the button's left edge. The
  mockup uses a small vertical accent that makes the active state jump out.

```css
/* client/src/index.css — new utility */
[data-slot="sidebar-menu-button"][data-active="true"] {
  position: relative;
}
[data-slot="sidebar-menu-button"][data-active="true"]::before {
  content: "";
  position: absolute;
  left: 6px;
  top: 25%;
  bottom: 25%;
  width: 3px;
  border-radius: 2px;
  background: var(--brand-gradient);
}
```

---

## Phase 3.2 — Top nav: bigger greeting

File: `client/src/components/TopNavBar.tsx` (line 113).

```tsx
/* before — gradient fill fights the mockup's neutral, authoritative feel */
<h1 className="font-display text-xl md:text-2xl font-bold leading-tight truncate brand-gradient-text">
  {greeting}, {greetingName}
</h1>
<p className="text-xs md:text-sm text-muted-foreground leading-tight truncate">
  Here's your financial snapshot for {monthYear}
</p>

/* after — solid charcoal, much larger, tighter line-height */
<h1 className="font-display text-2xl md:text-3xl lg:text-[36px] font-bold leading-[1.05] truncate text-foreground tracking-[-0.02em]">
  {greeting}, {greetingName}
</h1>
<p className="text-sm md:text-base text-muted-foreground/90 leading-tight truncate">
  Here's your financial snapshot for {monthYear}
</p>
```

**Drop `brand-gradient-text` on the H1.** The gradient stays on the logo
(`BudgetSmartLogoWithText`) and on CTAs. Keeping it off the greeting is what
makes the mockup read as a product dashboard rather than a marketing page.

Also bump the header height: `h-20` → `h-24` so the bigger text + subtitle
breathe, and shift the sticky-header backdrop to use the glass tokens:

```tsx
"border-b border-[color:rgb(var(--glass-border))] bg-[color:rgb(var(--glass-surface))] backdrop-blur-xl"
```

(Replaces the current `bg-background/60 backdrop-blur-xl
supports-[backdrop-filter]:bg-background/40`.)

Search input (line 130): round it fully and give it the glass treatment:

```tsx
"w-full h-10 pl-10 pr-3 text-sm rounded-[var(--radius-island)]",
"bg-[color:rgb(var(--glass-surface))] border border-[color:rgb(var(--glass-border))] backdrop-blur-sm",
```

---

## Phase 3.3 — KPI card restyle

File: `client/src/pages/dashboard.tsx` — the `RealCashFlowCard` (line 180) and
`PlanStatCard` (line 229) components. Also: replace both with a single
`<KpiCard>` so future cards don't fork again.

Six changes per card:

1. **Glass wrapper**:
   `className="glass-surface rounded-[var(--radius-card-lg)] border-0"` (the
   `Card` primitive already has `rounded-[var(--radius)]` once the token
   bumps land — we override to the bigger radius for KPI hero cards).
2. **Bigger padding**: `px-4 pt-4` → `px-5 pt-5`, `px-4 pb-4` → `px-5 pb-6`.
3. **Bigger colored icon tile**: `h-7 w-7 rounded-md` → `h-9 w-9 rounded-xl`
   with a category-specific gradient. Each KPI gets its own tile color, not a
   shared "income/spending/default" palette:
   - Bank Deposits / Income: `from-emerald-500/25 to-emerald-400/10` +
     `text-emerald-600` ↗ icon
   - Total Outgoing: `from-red-500/25 to-red-400/10` + `text-red-600` ↘ icon
   - Net Cash Flow: `from-teal-500/25 to-teal-400/10` + `text-teal-600` `$` icon
   - Bills Due: `from-amber-500/25 to-amber-400/10` + `text-amber-600`
     calendar icon
4. **Bigger number, solid foreground**: `text-xl font-bold` →
   `text-[28px] md:text-[32px] font-bold leading-none tracking-[-0.02em]
   text-foreground`. **Do not force `text-emerald-600` on positives** — only
   negative values get color (solid red). This is the biggest visual
   difference from what we ship today and is why our cards currently feel
   "green everywhere" instead of "green accents on a neutral grid".
5. **Delta pill below the subtitle**: new mini-component. Takes
   `momChangePercent` (we already compute this in the engine), renders
   `+4.2%` / `-12%` in a small rounded pill. Green pill for favorable
   direction, amber for unfavorable (context depends on the metric — a
   deposit going up is favorable, outgoing going up is unfavorable, so the
   card passes `favorableDirection: "up" | "down"`).

   ```tsx
   function DeltaPill({ delta, favorableDirection }: {
     delta: number;
     favorableDirection: "up" | "down";
   }) {
     if (!Number.isFinite(delta) || delta === 0) return null;
     const isFavorable = favorableDirection === "up" ? delta > 0 : delta < 0;
     const tone = isFavorable
       ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
       : "bg-amber-500/15 text-amber-700 dark:text-amber-300";
     const sign = delta > 0 ? "+" : "";
     return (
       <span className={cn(
         "inline-flex items-center h-5 px-1.5 rounded-md text-[11px] font-semibold",
         tone
       )}>
         {sign}{delta.toFixed(1)}%
       </span>
     );
   }
   ```

6. **Label ordering** (subtle, matches the mockup's read order):
   `Title (small gray) → Number (big solid) → "subtitle · period" (small
   gray) → DeltaPill (small)`. Icon tile stays pinned top-right.

---

## Phase 3.4 — Generic `<Card>` glass pass

File: `client/src/components/ui/card.tsx` (small surgical diff).

Add a `variant="glass"` prop (defaults to the current flat look so we don't
regress existing uses):

```tsx
const variants = {
  default: "bg-card border border-card-border",
  glass:   "glass-surface border-0",
};

<div
  className={cn(
    "rounded-[var(--radius)] shadow-sm",
    variants[variant],
    className
  )}
  {...props}
/>
```

Then opt in per-surface. First targets (high visibility, near the top of each
page):

- Dashboard KPI row — use `variant="glass"` + the radius override above
- Dashboard "Where your money went" card (already polished under task #26)
- Income / Expenses / Budgets page header-row cards
- Accounts page sidebar summary

Rest of the app inherits the new corner radius automatically and ships mostly
as-is. Once these land we'll do a second sweep to glass the remaining hero
cards.

---

## Phase 3.5 — Verification

Screenshot each of these in light + dark side-by-side with the mockup before
shipping:

1. Dashboard (the page Ryan shared)
2. Income page (new registry UI)
3. Accounts page
4. Budgets page
5. Settings → Profile

What to check:

- Sidebar reads as a clear floating island, not a full-height rail
- Main nav items are visibly larger than sub items, group labels are
  distinct from both
- Dashboard greeting hero is ~30px and the cards below read as green glass
- KPI numbers are the hero of each card, icon tiles are colored not gray
- Gold Upgrade CTA and amber warning variants still read as distinct from
  the new green-tinted glass (per Color palette policy memory)
- Demo-user view at `app.budgetsmart.io/demo` loads without regressions on
  the 12 seeded income sources

---

## Rollout order

Ship as **four small PRs**, not one:

| PR  | Scope                              | Risk                                   |
|-----|------------------------------------|----------------------------------------|
| 3.0 | Theme tokens (glass + radius + bg) | Visually affects every page — test all |
| 3.1 | Sidebar island + nav typography    | Contained to sidebar                   |
| 3.2 | Top-bar bigger greeting + search   | Contained to topbar                    |
| 3.3 | KPI card restyle + Card glass prop | Contained to dashboard + opt-ins       |

Each PR passes `npm run check` (tsc) and we eyeball the dashboard + three
other pages before merging. If 3.0 regresses anything, the per-PR structure
means we can revert it without losing the component-level work.
