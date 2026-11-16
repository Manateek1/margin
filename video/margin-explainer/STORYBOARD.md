# Margin — Storyboard (STORYBOARD.md)

## Format & Canvas
- **Resolution**: 1920x1080 (16:9 HD Landscape)
- **FPS**: 30
- **Audio**: Local Kokoro-82M voiceover (`af_heart`) + warm synthesized acoustic-pad underscore (`underscore.wav`)

## Beats & Asset Audit

| Beat | Scene ID | Assets Used | UI Components & Motion |
| :--- | :--- | :--- | :--- |
| 1 | `#scene-overview` | `assets/favicon.svg`, `assets/fern.webp`, `assets/screen-overview.png`, `assets/roommates.webp` | Left: Brand header, headline "Your home, in sync.", live recreated Fern hero card (`$1,800` Shared monthly costs / `$1,800` Room after the plan). Right: Framed `screen-overview.png` with slow Ken Burns zoom + floating split badge. |
| 2 | `#scene-split` | `assets/screen-roommates.png`, `assets/roommates.webp` | Left: Recreated Roommate cards for Maya (`$2,800` take-home, `$1,600` essentials -> `$1,200` left) & Leo (`$4,800` take-home, `$2,400` essentials -> `$2,400` left) + animated Equal (`$900/$900`) vs Available Income (`$600/$1,200` = `50%` effort) comparison card. Right: Framed `screen-roommates.png`. |
| 3 | `#scene-plan-whatif` | `assets/screen-plan.png`, `assets/screen-scenarios.png`, `assets/roommates.webp` | Left: Layered `screen-plan.png` and `screen-scenarios.png` browser windows. Right: Recreated Monthly Bills card (`Rent $1,200 Paid`, `Utilities $350`, `Groceries $250`) + What-If Scenario card (`+$120` preview -> `$1,800` to `$1,920`, Maya `+$40`, Leo `+$80`). |
| 4 | `#scene-coach` | `assets/screen-coach.png` | Left: Framed `screen-coach.png` + Zero-PII Privacy Boundary flow (`Goal + Tone -> Cloudflare Workers AI` vs `Names + $ -> Local Browser`). Right: Recreated AI Coach quote card with Google Gemma 4 opener and `ADDED ON THIS DEVICE` local numbers card. |
| 5 | `#scene-security` | `assets/screen-security.png`, `assets/screen-lock.png` | Left: Framed `screen-security.png` & `screen-lock.png` showcase. Right: Recreated Margin Lock Screen card (`Welcome back.`, animated password entry, `AES-256-GCM` & `PBKDF2 600,000 iterations` security badges). |
| 6 | `#scene-outro` | `assets/favicon.svg`, `assets/fern.webp`, `assets/roommates.webp` | Centered closing card: Margin brand lockup, "More clarity for the home you share.", `getmargin.pages.dev` live badge, `github.com/Manateek1/margin` source badge, and Bay Valley Hacks "Elevate the Ordinary" footer. |
