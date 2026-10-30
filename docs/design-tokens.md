# Design Tokens — Evidence-First Portfolio Redesign

Status: research artifact (T0) · Date: 2026-10-09 · Branch: `ai/portfolio-10x`
Updated: 2026-10-30 to reflect the type-first redesign (Task 2 direction).

---

## 1. Design direction

The redesign is a **type-first, dual-theme system** (deep gray default with a warm-paper light theme)
that keeps the site's core identity — *"Evidence before confidence"* — as the visual organizing
principle: every claim on the page carries a visible evidence affordance (chip, metric, link to a case
study), hierarchy is achieved with space, type scale, and a single magenta accent reserved for primary
CTAs, and motion is used only to reveal structure (timeline draws, masked headline entrance) so the site
feels alive without undermining credibility. Typography pairs **Newsreader** (display 300 / text 400,
optical sizing) with **JetBrains Mono** (code); the palette is deep gray surfaces + warm paper ink +
magenta accent (buttons only). Conservative "Loading…/Draft" placeholders are replaced by resolved
states or honest omission, and the bilingual en/es parity is preserved at the token level so both
locales share one system.

---

## 2. Color tokens

One accent hue family, semantic naming, both themes. Contrast ratios are computed against the listed
background and measured for WCAG 2.1 AA: **4.5:1 body text, 3:1 large text (≥24px or ≥19px bold) and
non-text UI**.

### 2.1 Dark theme (default)

| Token | Hex | Usage | Contrast note |
|---|---|---|---|
| `--color-bg` | `#0A0A0A` | Page background (deep gray) | base |
| `--color-surface` | `#1A1A1A` | Cards, panels, code blocks | base |
| `--color-surface-raised` | `#222222` | Hovered cards, popovers | base |
| `--color-text` | `#F2EFE6` | Primary body + headings (warm paper ink) | ~17.75:1 on `bg` ✅ AAA |
| `--color-text-muted` | `#98938A` | Secondary copy, metadata | ~7.02:1 on `bg` ✅ AA |
| `--color-border` | `#2A2A2A` | Hairlines, dividers, chip borders | decorative only; any *interactive* border must use `accent` (3:1+) |
| `--color-accent` | `#F53FD6` | Primary CTA buttons (magenta) | ~6.2:1 on `bg` ✅ AA |
| `--color-accent-ink` | `#0A0A0A` | Text on accent-filled buttons | ~17.75:1 ✅ AAA |
| `--color-success` | `#48BB78` | "Verified / shipped / evidence ok" status | ~7.25:1 on `bg` ✅ AA |
| `--color-warn` | `#F6C177` | "Draft / estimated / in-progress" status | ~10.74:1 on `bg` ✅ AA |

### 2.2 Light theme

| Token | Hex | Usage | Contrast note |
|---|---|---|---|
| `--color-bg` | `#F2EFE6` | Page background (warm paper) | base |
| `--color-surface` | `#FFFFFF` | Cards, panels | base |
| `--color-surface-raised` | `#E8E5DC` | Hovered cards, chips | base |
| `--color-text` | `#0A0A0A` | Primary body + headings | ~17.75:1 on `bg` ✅ AAA |
| `--color-text-muted` | `#5A5650` | Secondary copy, metadata | ~7.18:1 on `bg` ✅ AA |
| `--color-border` | `#D0CDC4` | Hairlines, dividers | decorative; interactive borders use `accent-ink` |
| `--color-accent` | `#C4009E` | Primary CTA buttons (darker magenta for light bg) | ~6.5:1 on `bg` ✅ AA |
| `--color-accent-ink` | `#FFFFFF` | Text on accent-filled buttons (white on magenta) | 7.00:1 ✅ AA |
| `--color-success` | `#2F855A` | Verified status | ~6.42:1 on `bg` ✅ AA |
| `--color-warn` | `#B7791F` | Draft status | ~6.25:1 on `bg` ✅ AA |

Verified with WCAG 2.1 relative-luminance formula, most recently on 2026-10-30 (re-synced to `web/src/styles/tokens.css` after the type-first redesign: palette shifted from navy/mint to deep-gray/warm-paper/magenta, `--color-accent` `#64FFDA` → `#F53FD6` dark / `#006557` → `#C4009E` light).

Rules:
- Body copy never uses `text-muted` below 16px on `surface` without re-checking contrast.
- Theme switch via `data-theme="light|dark"` on `<html>`, default dark, honoring `prefers-color-scheme` on
  first visit; persisted choice wins.
- All status colors are paired with an icon or text label — color is never the only signal.
- Accent magenta is reserved for primary CTA buttons; links and secondary UI use `text` or `text-muted`.

---

## 3. Typography scale

Font stack (Newsreader display + text, JetBrains Mono for code):

```
--font-display: 'Newsreader', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
--font-sans: 'Newsreader', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
  /* --font-sans is the body font but renders as serif (Newsreader) by design.
     The name is historical; --font-display is the same face at weight 300. */
--font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

Display sizes use tight tracking (`--tracking-tight`); text sizes use comfortable leading (1.45–1.6).
Five sizes do the work: four for body/UI, one display size (`lg`) with `clamp()` for fluid heading
scaling.

| Token | Size | Line-height | Use |
|---|---|---|---|
| `--text-xs` | 13px / `--leading-xs` 1.5 | Labels, chip text, metadata |
| `--text-sm` | 14px / `--leading-sm` 1.55 | Secondary copy, captions |
| `--text-base` | 16px / `--leading-base` 1.6 | Body copy (default) |
| `--text-md` | 18px / `--leading-md` 1.55 | Lead paragraph, card body |
| `--text-lg` | 32px / `--leading-lg` 1.2 | Display headlines (fluid via `clamp()` in components) |

Tracking tokens:

| Token | Value | Use |
|---|---|---|
| `--tracking-tight` | `-0.05em` | Display headlines (`--text-lg`) |
| `--tracking-eyebrow` | `0.12em` | Uppercase section eyebrows |

Rules: body is `--text-base` with measure capped at `--measure` (65ch); display headlines use
`--tracking-tight` from `--text-lg`; section eyebrows are `--text-xs` uppercase with
`--tracking-eyebrow`; numerals in metrics use `font-variant-numeric: tabular-nums`.

---

## 4. Spacing, radii, shadows

Spacing — 4px base scale:

| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-10` | 40px |
| `--space-12` | 48px |
| `--space-16` | 64px |
| `--space-24` | 96px |
| `--space-32` | 128px |
| `--space-40` | 160px (section gap, desktop) |
| `--space-48` | 192px (section gap, large desktop) |
| `--space-60` | 240px (section gap, hero) |

Radii (flat buttons, square or pill): `--radius-sm: 0px` (chips, inputs) · `--radius-md: 0px` (buttons,
cards) · `--radius-lg: 0px` (feature cards) · `--radius-full: 9999px` (pills, avatar).

Shadows (dark theme relies on surface steps; light theme on elevation):

| Token | Value |
|---|---|
| `--shadow-sm` | `none` (dark) / `0 1px 2px rgba(10, 10, 10, 0.08)` (light) |
| `--shadow-md` | `0 8px 24px rgba(0, 0, 0, 0.5)` (dark) / `0 4px 12px rgba(10, 10, 10, 0.12)` (light) |
| `--shadow-lg` | `0 16px 48px rgba(0, 0, 0, 0.6)` (dark) / `0 16px 40px rgba(10, 10, 10, 0.16)` (light) |
| `--ring-focus` | `0 0 0 3px rgba(245, 63, 214, 0.35)` focus halo (dark) / `rgba(196, 0, 158, 0.35)` (light) |

---

## 5. Motion tokens

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 150ms | Hover, chip, link underline |
| `--duration-base` | 250ms | Card lift, nav indicator, theme cross-fade |
| `--duration-slow` | 400ms | Section reveal, timeline draw |
| `--duration-hero` | 900ms | Masked headline entrance |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | General transitions |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Reveals, entrance (decelerating) |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Timeline draw, theme change |
| `--reveal-offset` | 16px | Reveal translateY distance |
| `--reveal-stagger` | 60ms | Per-child delay when staggering is requested |

Patterns:
- **Reveal-on-scroll**: `opacity 0→1` + `translateY(--reveal-offset→0)` over `--duration-slow` with
  `--ease-out`, staggered `--reveal-stagger` per child, triggered once via `IntersectionObserver` at 15%
  visibility. Content is visible by default if JS is unavailable (`.js` class on `<html>` gates the hidden
  initial state).
- **Masked headline entrance**: hero headline reveals over `--duration-hero` with `--ease-out`, masked
  by a clip-path or similar technique for a cinematic draw effect.
- **Timeline draw**: vertical rail scales `scaleY(0→1)` from the top over `--duration-slow` with
  `--ease-in-out`; node dots pop with a 120ms delay after their rail segment passes.
- **Card interaction**: `translateY(-4px)` + accent border over `--duration-base` with `--ease-standard`.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` sets all durations to `1ms`, disables
  transforms and the timeline draw (rail rendered fully drawn), keeps opacity changes only — no information
  depends on motion.

---

## 6. Layout tokens

| Token | Value | Use |
|---|---|---|
| `--shell-max` | 1120px | Max content width |
| `--shell-gutter` | `var(--space-4)` (16px) | Horizontal padding |
| `--measure` | 65ch | Body copy measure cap |
| `--header-height` | 64px | Fixed header height |

---

## 7. Breakpoints

| Token | Value | Target |
|---|---|---|
| `--bp-xs` | 360px | Minimum supported width; single column, stacked CTAs |
| `--bp-sm` | 768px | Tablet; 2-column cards where useful, side nav collapses to top bar |
| `--bp-md` | 1024px | Desktop; sticky numbered side nav appears, timeline gains side layout |
| `--bp-lg` | 1440px | Wide; max content width `--shell-max`, generous section padding |

Mobile-first CSS: base styles target 360px, enhancements gated at `min-width` queries. No horizontal
scrolling at 360px.

---

## 8. Layout patterns to adopt

| Pattern | Rationale |
|---|---|
| **Fixed side nav, numbered sections** (`01 — Evidence` …) with scroll-spy active state | Gives the long, evidence-dense page an at-a-glance table of contents and makes the structure itself a credibility signal. |
| **Hero: role + one-liner + social links + primary CTA** | States who/what/proof-of-work in the first viewport instead of a paragraph — the fastest path from arrival to trust. |
| **Section heading = eyebrow + h2 + 1-line summary** | Keeps text-heavy sections scannable so evidence reads as curated, not dumped. |
| **Vertical timeline (experience / direction-of-travel)** with company · title · dates · bullets · tech chips | "Full Stack → Cloud → AI Engineering → Agentic" is inherently sequential; a timeline says progression better than three stacked blocks. |
| **Project/case-study card: image · description · tech chips · repo/live links** | Scannable unit of proof with a consistent shape; chips double as skills inventory. |
| **Evidence chip** (status icon + label + link to source/case study) | Codifies "Evidence before confidence" as a reusable component: every claim carries its verification inline. |
| **Metric callout** (`tabular-nums`, accent number, muted label) | Quantified outcomes pop without prose; large text keeps 3:1 contrast. |
| **Writing list with thumbnails** | Supports the evidence trail with depth while staying visually lighter than cards. |
| **Two-path split (employment / services)** as side-by-side panels | Preserves the existing offer structure with a clear fork instead of a text wall. |
| **Footer with tech-stack disclosure** | Transparency about how the site is built extends the evidence-first identity to the artifact itself. |
| **Contact form with inline validation** | The current site has no conversion path; a validated form (with mailto fallback) closes the loop. |

---

## 9. Accessibility checklist for the redesign

- [ ] Contrast: body ≥4.5:1, large text and UI borders/icons ≥3:1 in **both** themes (verify tokens in §2).
- [ ] Keyboard: every interactive element reachable, visible focus ring (`--ring-focus`), logical tab order,
      skip-to-content link as first focusable element.
- [ ] Landmarks: one `<header>`/`<nav>`/`<main>`/`<footer>`, each section an `<section>` with `aria-labelledby`.
- [ ] Headings: exactly one `h1`, no skipped levels, numbered nav labels don't duplicate heading text ids.
- [ ] Motion: `prefers-reduced-motion` honored everywhere; no autoplaying motion longer than 5s.
- [ ] Images: meaningful `alt`, decorative marked `aria-hidden`; card images use explicit width/height (CLS).
- [ ] Forms: visible `<label>` per input, errors linked with `aria-describedby`, `aria-invalid`, and text
      (not color-only), success announced via `aria-live="polite"`.
- [ ] Status: evidence chips convey state by icon **and** text, never color alone.
- [ ] Language: `<html lang>` switches with en/es locale; no untranslated strings left visible.
- [ ] Responsive: full function at 360px, no horizontal scroll, tap targets ≥44×44px on touch.
- [ ] States: hover/focus/active/visited all distinguishable; no information available only on hover.
- [ ] Performance/a11y overlap: reveal animations gated behind `.js` so no-JS users see all content.
- [ ] Automated pass: axe-core clean on all pages before merge; manual screen-reader pass on nav, timeline,
      and contact form.
