# Margin — Visual Identity & Design System (DESIGN.md)

## Style Prompt
Warm, botanical editorial fintech. Margin rejects cold corporate spreadsheets and neon dark-mode clichés in favor of a calm, tactile shared-home aesthetic: soft sage-tinted paper backgrounds (`#f6f8f4`), deep forest ink typography (`#152016`), rich moss-green hero cards (`#243422` and `#587e3e`) accented by organic fern photography (`fern.webp`), and friendly illustrated roommate avatars (`roommates.webp`). Every card uses crisp 1px sage borders (`#dfead8`), generous 24px–32px border radii, and subtle forest-tinted elevation shadows.

## Colors
- **Canvas Background (`--bg`)**: `#f6f8f4` (Warm sage-tinted off-white paper)
- **Card Surface (`--card`)**: `#ffffff` with `#dfead8` 1px border and `#edf3e8` soft fill pills
- **Primary Forest Ink (`--ink`)**: `#152016` (High-contrast botanical charcoal for headlines and numbers, >14:1 contrast on `#f6f8f4`)
- **Secondary Moss Copy (`--muted`)**: `#4a5947` (WCAG AA compliant muted forest slate for body copy and labels)
- **Primary Brand Green (`--green`)**: `#587e3e` (Botanical leaf green for primary buttons, active badges, and highlights)
- **Deep Hero Canopy (`--canopy`)**: `#243422` (Deep forest card surface for high-emphasis hero stats and dark callout cards, paired with `#f4faef` text)
- **Warm Amber Callout (`--amber`)**: `#8a5216` on `#fdf3e4` (For What-if scenario deltas)

## Typography
- **Display & Numbers**: `Space Grotesk` (700 bold, tight tracking `-0.045em`, `font-variant-numeric: tabular-nums`)
- **UI & Body Copy**: `Inter` (400, 500, 600, 700, clean geometric legibility)

## What NOT to Do
- Do NOT use dark neon backgrounds, cyan/purple gradients, or generic `#3b82f6` blue.
- Do NOT use CSS `transform: translate(...)` for centering elements that GSAP animates.
- Do NOT place raw unframed screenshots without device chrome, rounded corners, and continuous subtle motion.
- Do NOT use font sizes below 18px for labels or 22px for body copy on the 1920x1080 canvas.
