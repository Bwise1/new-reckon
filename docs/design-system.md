# Reckon design system (reference: Reckon-Bill prototype)

The visual target for Reckon's UI, extracted from the `YemiKrist/Reckon-Bill`
prototype (`src/app/globals.css` + component conventions, pulled 2026-08-26).
Section 1–4 are the reference system; section 5 is what Reckon uses **today**;
section 6 is the migration plan.

---

## 1. Typography

**Face: General Sans** (local woff2, four weights). Already copied to
`src/assets/fonts/GeneralSans-{Regular,Medium,Semibold,Bold}.woff2`.

| Weight | File | Use |
|---|---|---|
| 400 Regular | GeneralSans-Regular | body copy, descriptions |
| 500 Medium | GeneralSans-Medium | labels, secondary buttons, nav items |
| 600 Semibold | GeneralSans-Semibold | card titles, emphasized values |
| 700 Bold | GeneralSans-Bold | headings, bill names, totals, primary buttons |

Fallback stack: `"General Sans", -apple-system, "Segoe UI", Roboto, sans-serif`.

**Scale actually used by the prototype** (no arbitrary sizes outside this):

| Token | Size | Where |
|---|---|---|
| `text-[9.5px]` | 9.5px medium | toolbar icon-button labels |
| `text-[10px]` | 10px semibold uppercase tracking-wider | group titles ("MEASURE"), small-caps labels ("BILL 1"), dropdown headers |
| `text-[11px]`/`text-xs` | 11–12px medium | status bar, chips, hints, sub-labels |
| `text-sm` | 14px | body text, inputs, menu items |
| `text-base` | 16px semibold | panel titles, project name |
| `text-lg` | 18px bold | bill row names |
| `text-2xl` | 24px extrabold | grand-total figures |

Numbers always get `tabular-nums`.

## 2. Color tokens

The prototype is **dark-first with a light flip** — every neutral is a semantic
token, never a raw gray. Brand hues are reserved for *micro-interactions*
(status, ticks, destructive), never as chrome fills.

### Brand accents (same in both themes)

| Token | Hex | Meaning |
|---|---|---|
| `charcoal` | `#0f172a` | darkest brand neutral |
| `navy-soft` | `#4a7fa8` (dark) / `#003566` (light) | Linear tool hue; Reckon navy |
| `teal` | `#289693` | accent base |
| `gold` | `#e9c268` | warn base (matches Reckon `brandGold`) |
| `coral` | `#fc7750` | danger base |

### Semantic tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `ink` | `#18181b` | `#f8fafc` | sidebars, rails, chrome bars |
| `ink-elevated` | `#232327` | `#eef2f6` | raised chrome (modal header strips) |
| `canvas` | `#121212` | `#ffffff` | app background behind the sheet |
| `surface` | `#1e1e1e` | `#ffffff` | cards, modal bodies, dropdowns |
| `surface-muted` | `#27272a` | `#f1f5f9` | inset fields, quiet fills |
| `border` | `#27272a` | `#e2e8f0` | hairline dividers |
| `body` | `#f4f4f5` | `#0f172a` | primary text |
| `muted` | `#a1a1aa` | `#64748b` | secondary text |
| `overlay` | `#ffffff` | `#0f172a` | hover/active tints **with opacity**: `bg-overlay/5`, `bg-overlay/10`, `border-overlay/10`, `ring-overlay/20` — one class works in both themes |
| `primary` / `primary-fg` | `#ffffff` / `#18181b` | `#0f172a` / `#ffffff` | solid CTA buttons (theme-inverted) |
| `accent` / `accent-strong` | teal / `#1f7875` | teal / `#1b6f6c` | success, calibrated, Area tool |
| `warn` / `warn-strong` | gold / `#c9a050` | `#c9a050` / `#a9813c` | uncalibrated, caution |
| `danger` / `danger-strong` | coral / `#e35f3a` | `#e35f3a` / `#c24a29` | delete, offline, Count tool |

Theme switch = `[data-theme="light"]` on the root; tokens flip, classes don't.

## 3. Shape, depth, motion

- **Radii**: `rounded-lg` (8px) controls/buttons · `rounded-xl` (12px) cards,
  dropdowns, panels · `rounded-full` pills (Help, badges).
- **Borders over shadows** for structure: 1px `border-border` everywhere;
  shadows only on floating things (`shadow-lg`/`shadow-xl` on dropdowns,
  modals, the sheet).
- **Hover/active** on chrome: `hover:bg-overlay/10`; selected: `bg-overlay/10`
  + `text-body`; primary-selected: solid `bg-primary text-primary-fg`.
- **Motion**: one animation, `float-in` (120ms ease-out, 4px rise + 0.98
  scale) for dropdowns/popovers; `transition-colors` on everything hoverable.
  Thin scrollbars (`scrollbar-thin`, overlay-tinted).

## 4. Component recipes (from the prototype)

- **Toolbar icon button**: 32×32 icon box (`h-8 w-8`, `rounded-lg`), 16px icon
  (`h-4 w-4`, stroke 1.5), 9.5px label beneath; active = tinted bg
  (`bg-<hue>/10`) + hue label. Groups titled in 10px caps with hairline
  dividers between groups. Toolbar height 92px.
- **Bill row / list card**: 10px caps label, 18px bold name, bold amount
  right-aligned; rows divided by `border-border`; container `rounded-xl`.
- **Stat card** (grand total): `surface-muted` fill, caps label, `text-2xl`
  extrabold figure.
- **Status bar**: 1-line strip, `text-xs` medium `text-muted`,
  `border-t border-border`, segments split by 1px×12px dividers, right side
  zoom + coordinates in `tabular-nums`.
- **Primary button**: solid `bg-primary text-primary-fg`, `rounded-lg`
  (or `rounded-xl`/full-width for hero actions), semibold.
- **Chips/badges**: `text-[11px]`–`xs`, 1px border, tinted fill at /10.
- **Canvas**: sheet floats on `canvas` background with grid
  (24px `linear-gradient` grid lines) and `shadow-lg`; drawing surface always
  stays light regardless of theme (it's paper, not chrome).

---

## 5. Reckon today (inventory, 2026-08-26)

- **Font**: Inter from Google Fonts CDN (all 9 weights imported; ~4 used).
  A Hellix family sits unused in `src/assets/fonts` (woff, from an old
  design). No General Sans yet — files now staged in the same folder.
- **Tokens** (`src/index.css` `@theme`): only four —
  `primary #D7D7D7` (near-unused), `secondary #003566` (the workhorse navy),
  `brandColor #11253E`, `brandGold #E9C268`. Plus the five icon-palette vars
  added with the toolbar port (`--color-warn/accent/muted/navy-soft/danger`).
- **Everything else is raw Tailwind grays**: ~400 uses of
  `gray-50…900`/`white`/`black` classes and ~30 hardcoded hexes
  (`#289693` teal ×19, `#003566` ×15, `#f97316` orange ×12, plus one-off
  grays like `#8C8787`, `#616161`, `#D9D9D9`, `#f0f2f5`).
- **Dark chrome is hardcoded**: PlanNavigator sidebar uses
  `bg-black/30`, `border-gray-800`, `text-gray-400` directly, so there is no
  theme switch — the left sidebar is permanently dark, the right permanently
  light.
- **Type sizes** are ad-hoc (`text-[10px]`, `text-[11px]`, `text-xs`,
  `text-sm` mixed freely) but already close to the prototype's scale.
- Surface conventions largely match already (white cards, `border-gray-200`
  hairlines, `rounded-lg/xl`, shadows on floats) — the migration is mostly
  *renaming to tokens*, not redesigning.

## 6. Migration plan

Phased so every step ships alone and nothing breaks visually in between.

**Phase 1 — Foundations (no visible change).**
Register General Sans via `@font-face` in `index.css` (staged woff2s);
replace the prototype-token block: add the full section-2 token set to
`@theme` (light values as default to match Reckon's current light UI; the
dark set behind `[data-theme="dark"]`, unused until a switch ships).
Keep `secondary`/`brandGold` as aliases (`secondary` → `navy-soft`-light,
`brandGold` → `gold`) so nothing existing breaks. Delete the Inter CDN
import and the Hellix leftovers.

**Phase 2 — Font flip (one visible change).**
`--font-family-sans` → General Sans. Review the few dense screens (BOQ
cards, tables) for metric drift; General Sans runs slightly wider than
Inter at small sizes.

**Phase 3 — Token sweep, file by file.**
Mechanical rename of grays to semantics, one component per commit:
`bg-white → bg-surface`, `border-gray-200/100 → border-border`,
`text-gray-900/800 → text-body`, `text-gray-500/400 → text-muted`,
`bg-gray-50/100 → bg-surface-muted`, `hover:bg-gray-100 → hover:bg-overlay/10`,
hex teal `#289693 → accent`, orange `#f97316 → warn` (calibration),
`#003566 → navy-soft`. Order: CanvasToolbar → CanvasStatusBar →
TakeoffRightSidebar/BillsOverview/EstimationCard → PlanNavigator →
dashboard/auth pages.

**Phase 4 — Chrome semantics.**
PlanNavigator + top nav move from hardcoded darks to `ink`/`ink-elevated`
tokens; canvas background to `canvas` token; sheet stays white by design.

**Phase 5 — Theme switch (optional, later).**
A `data-theme` toggle in Settings; by then it's one attribute because every
color is a token. The prototype's `ThemeToggle.tsx` is the reference.

Rule for all new code starting now: **no new raw grays or hexes — semantic
tokens only.** If a color isn't in section 2, it doesn't go in.
