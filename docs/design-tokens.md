# Design Tokens — Evidence-First Portfolio Redesign

Status: research artifact (T0) · Date: 2026-10-09 · Branch: `ai/portfolio-10x`
Reference bar: Brittany Chiang v4-style developer portfolio.
Research note: a single websearch for "developer portfolio design trends 2026" returned **HTTP 503**, so this
document is built from the captured reference audit (live-site audit + Brittany Chiang pattern capture) rather
than fresh web results.

---

## 1. Design direction

The redesign adopts a **dark-first, dual-theme system** (dark navy default with a fully specified light theme)
that keeps the site's core identity — *"Evidence before confidence"* — as the visual organizing principle rather
than softening it: every claim on the page carries a visible evidence affordance (chip, metric, link to a case
study), hierarchy is achieved with space, type scale, and a single restrained accent instead of decoration, and
motion is used only to reveal structure (timeline draws, section reveals) so the site feels alive without
undermining credibility. Conservative "Loading…/Draft" placeholders are replaced by resolved states or honest
omission, and the bilingual en/es parity is preserved at the token level so both locales share one system.

---

## 2. Color tokens

One accent hue family, semantic naming, both themes. Contrast ratios are computed against the listed
background and measured for WCAG 2.1 AA: **4.5:1 body text, 3:1 large text (≥24px or ≥19px bold) and
non-text UI**.

### 2.1 Dark theme (default)

| Token | Hex | Usage | Contrast note |
|---|---|---|---|
| `--color-bg` | `#0A192F` | Page background | base |
| `--color-surface` | `#112240` | Cards, panels, code blocks | base |
| `--color-surface-raised` | `#1D3254` | Hovered cards, popovers | base |
| `--color-text` | `#E6F1FF` | Primary body + headings | 15.42:1 on `bg` ✅ AAA |
| `--color-text-muted` | `#98A2C2` | Secondary copy, metadata | 6.94:1 on `bg`, 5.06:1 on `surface-raised` ✅ AA |
| `--color-border` | `#233554` | Hairlines, dividers, chip borders | 1.43:1 on `bg` — decorative only; any *interactive* border must use `accent` (3:1+) |
| `--color-accent` | `#64FFDA` | Links, active nav, focus ring, chips | 14.13:1 on `bg` ✅ AAA |
| `--color-accent-ink` | `#0A192F` | Text on accent-filled buttons | 14.13:1 ✅ AAA |
| `--color-success` | `#48BB78` | "Verified / shipped / evidence ok" status | 7.25:1 on `bg` ✅ AA |
| `--color-warn` | `#F6C177` | "Draft / estimated / in-progress" status | 10.74:1 on `bg` ✅ AA |

### 2.2 Light theme

| Token | Hex | Usage | Contrast note |
|---|---|---|---|
| `--color-bg` | `#F7FAFC` | Page background | base |
| `--color-surface` | `#FFFFFF` | Cards, panels | base |
| `--color-surface-raised` | `#EDF2F7` | Hovered cards, chips | base |
| `--color-text` | `#1A202C` | Primary body + headings | 15.57:1 on `bg` ✅ AAA |
| `--color-text-muted` | `#4A5568` | Secondary copy, metadata | 7.18:1 on `bg` ✅ AA |
| `--color-border` | `#E2E8F0` | Hairlines, dividers | decorative; interactive borders use `accent-ink` |
| `--color-accent` | `#006557` | Links, active nav, focus ring (light needs a darker accent than `#64FFDA`) | 6.68:1 on `bg`, 5.50:1 on the 14 % accent chip ✅ AA |
| `--color-accent-ink` | `#FFFFFF` | Text on accent-filled buttons (white on `#006557`) | 7.00:1 ✅ AA |
| `--color-success` | `#276749` | Verified status | 6.42:1 on `bg` ✅ AA |
| `--color-warn` | `#8A4F0B` | Draft status | 6.25:1 on `bg`, 5.15:1 on the 14 % warn chip ✅ AA |

Verified with WCAG 2.1 relative-luminance formula, most recently on 2026-10-11 (re-synced to `web/src/styles/tokens.css` after the UI audit: dark `--color-text-muted` `#8892B0` → `#98A2C2`, light `--color-accent` `#007A6A` → `#006557`, light `--color-warn` `#97570F` → `#8A4F0B`).

Rules:
- Body copy never uses `text-muted` below 16px on `surface` without re-checking contrast.
- Theme switch via `data-theme="light|dark"` on `<html>`, default dark, honoring `prefers-color-scheme` on
  first visit; persisted choice wins.
- All status colors are paired with an icon or text label — color is never the only signal.

---

## 3. Typography scale

Font stack (system-first, zero webfont latency, Inter where available):

```
--font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

| Token | Size / Line-height | Use |
|---|---|---|
| `--text-xs` | 12px / 1.5 | Labels, chip text, metadata |
| `--text-sm` | 14px / 1.55 | Secondary copy, captions |
| `--text-base` | 16px / 1.65 | Body copy (default) |
| `--text-md` | 18px / 1.6 | Lead paragraph, card body |
| `--text-lg` | 22px / 1.45 | Card titles, subsection heads |
| `--text-xl` | 28px / 1.35 | Section headings |
| `--text-2xl` | 36px / 1.25 | Hero role line, large stats |
| `--text-3xl` | 48px / 1.15 | Hero name (mobile) |
| `--text-4xl` | 60px / 1.1 | Hero name (desktop) |
| `--text-5xl` | 72px / 1.05 | Display / oversized numerals |

Rules: body is `--text-base` with measure capped at `65ch`; headings use `letter-spacing: -0.02em` from
`--text-xl` up; section eyebrows are `--text-xs` uppercase with `letter-spacing: 0.12em`; numerals in metrics
use `font-variant-numeric: tabular-nums`.

---

## 4. Spacing, radii, shadows

Spacing — 4px base scale:

| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-12` | 48px |
| `--space-16` | 64px |
| `--space-24` | 96px |
| `--space-32` | 128px (section padding, desktop) |

Radii: `--radius-sm: 4px` (chips, inputs) · `--radius-md: 8px` (buttons, cards) · `--radius-lg: 16px`
(feature cards, modals) · `--radius-full: 9999px` (pills, avatar).

Shadows (subtle; dark theme relies on surface steps, light theme on elevation):

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(10, 25, 47, 0.08)` (light) / none (dark) |
| `--shadow-md` | `0 4px 12px rgba(10, 25, 47, 0.12)` (light) / `0 8px 24px rgba(2, 12, 27, 0.35)` (dark) |
| `--shadow-lg` | `0 16px 40px rgba(10, 25, 47, 0.16)` (light) / `0 16px 48px rgba(2, 12, 27, 0.45)` (dark) |
| `--ring-focus` | `0 0 0 3px rgba(100, 255, 218, 0.35)` focus halo (dark), accent at 35% (light) |

---

## 5. Motion tokens

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 150ms | Hover, chip, link underline |
| `--duration-base` | 250ms | Card lift, nav indicator, theme cross-fade |
| `--duration-slow` | 400ms | Section reveal, accordion, hero entrance |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | General transitions |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Reveals, entrance (decelerating) |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Timeline draw, theme change |

Patterns:
- **Reveal-on-scroll**: `opacity 0→1` + `translateY(16px→0)` over `--duration-slow` with `--ease-out`,
  staggered 60ms per child, triggered once via `IntersectionObserver` at 15% visibility. Content is visible
  by default if JS is unavailable (`.js` class on `<html>` gates the hidden initial state).
- **Timeline draw**: vertical rail scales `scaleY(0→1)` from the top over `--duration-slow` with
  `--ease-in-out`; node dots pop with a 120ms delay after their rail segment passes.
- **Card interaction**: `translateY(-4px)` + accent border over `--duration-base` with `--ease-standard`.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` sets all durations to `1ms`, disables
  transforms and the timeline draw (rail rendered fully drawn), keeps opacity changes only — no information
  depends on motion.

---

## 6. Breakpoints

| Token | Value | Target |
|---|---|---|
| `--bp-xs` | 360px | Minimum supported width; single column, stacked CTAs |
| `--bp-sm` | 768px | Tablet; 2-column cards where useful, side nav collapses to top bar |
| `--bp-md` | 1024px | Desktop; sticky numbered side nav appears, timeline gains side layout |
| `--bp-lg` | 1440px | Wide; max content width `1120px`, generous section padding |

Mobile-first CSS: base styles target 360px, enhancements gated at `min-width` queries. No horizontal
scrolling at 360px.

---

## 7. Layout patterns to adopt

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

## 8. Accessibility checklist for the redesign

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
