---
name: SonicAI
description: An AI music creation playground — warm brass precision on a dark immersive canvas
colors:
  brass-gold: "#d4a853"
  brass-glow: "#e8c267"
  brass-deep: "#8b6d2f"
  canvas-black: "#0d0d0d"
  panel-charcoal: "#141414"
  raised-slate: "#1c1c1c"
  hover-slate: "#262626"
  text-primary: "#f2f2f2"
  text-secondary: "#a0a0a0"
  text-tertiary: "#666666"
  border-default: "#262626"
  border-light: "#1f1f1f"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(1.875rem, 5vw, 4.5rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontStyle: italic
  body:
    fontFamily: "Plus Jakarta Sans, DM Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.625rem"
    fontWeight: 500
    letterSpacing: "0.15em"
    textTransform: uppercase
rounded:
  pill: "9999px"
  outer: "1.5rem"
  inner: "calc(1.5rem - 5px)"
  md: "12px"
  sm: "8px"
  xs: "6px"
spacing:
  section-gap: "2rem"
  card-pad: "1.5rem"
  item-gap: "0.75rem"
  tight: "0.25rem"
components:
  button-primary:
    backgroundColor: "{colors.brass-gold}"
    textColor: "{colors.canvas-black}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  button-primary-hover:
    backgroundColor: "{colors.brass-glow}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  card-outer:
    backgroundColor: rgba(255,255,255,0.03)
    rounded: "{rounded.outer}"
    padding: "5px"
  card-inner:
    backgroundColor: "{colors.panel-charcoal}"
    rounded: "{rounded.inner}"
    padding: "{spacing.card-pad}"
  chip-eyebrow:
    backgroundColor: rgba(212,168,83,0.08)
    textColor: "{colors.brass-gold}"
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
  nav-item:
    rounded: "{rounded.md}"
    padding: "12px 16px"
  nav-item-active:
    backgroundColor: "{colors.raised-slate}"
---

# Design System: SonicAI

## 1. Overview

**Creative North Star: "The Brass Atelier"**

A craftsman's workshop at dusk. The room is lit by a single warm lamp; brass tools gleam on a dark oak workbench. Every surface has been chosen, every edge considered. This is not a factory floor and not a sterile lab: it is a space where precision engineering meets artistic intuition.

SonicAI's interface inherits from this scene. Dark immersive backgrounds push sound and waveform into focus. Warm brass gold (#d4a853) is the sole accent — used sparingly for primary actions, active states, and moments of completion. Serif display type speaks to the artistry; a clean geometric sans carries the interface; monospace labels reinforce technical precision.

The system explicitly rejects: cyan-purple neon palettes, SaaS landing-page gradients, glassmorphism as decoration, and the cold enterprise-tool aesthetic that treats music as data rather than expression.

**Key Characteristics:**
- Dark-first with a deliberate light variant (not a simple invert)
- One accent color, used at ≤10% of any surface
- Double-Bezel card architecture: nested enclosures with fine metallic outer borders, like machined brass instrument panels seated in their trays
- Warm-tinted shadows (deep brown undertone, never pure black) that harmonize with the brass palette instead of fighting it
- Serif display + sans body + mono label hierarchy
- Subtle noise texture at 2.5% opacity for tactile depth
- Metallic gradient micro-shimmer on hover: a bronze-to-champagne hairline fades in along the card's bottom edge
- Tactile button feedback: combined scale-down + 1px downward displacement on click, like pressing a physical piano key

## 2. Colors: The Brass & Charcoal Palette

A restrained warm-metal-on-dark-neutral system. The single brass accent carries all meaningful color weight; every neutral is a step on a tight charcoal scale.

### Primary
- **Brass Gold** (#d4a853): Primary actions, active navigation, selection indicators, waveform playback fill. The only saturated color on the surface. Used on buttons, active borders, progress bars, and the bottom-edge card reveal line.
- **Brass Glow** (#e8c267): Hover state for primary buttons and interactive brass elements. Never used at rest. Produces a warm halo on dark backgrounds.
- **Brass Deep** (#8b6d2f): Light-mode primary. Reduced chroma to stay elegant on white surfaces.

### Neutral
- **Canvas Black** (#0d0d0d): Root background. Tinted warm (not true black) to avoid the harshness of `#000`.
- **Panel Charcoal** (#141414): Secondary surface — card interiors, sidebar, player backgrounds.
- **Raised Slate** (#1c1c1c): Tertiary — hover backgrounds, active nav items, progress track backgrounds.
- **Hover Slate** (#262626): Subtle hover feedback on list items and ghost buttons.
- **Text Primary** (#f2f2f2): All body text and headings.
- **Text Secondary** (#a0a0a0): Supporting copy, descriptions, helper text.
- **Text Tertiary** (#666666): Metadata, timestamps, mono labels.
- **Border Default** (#262626): Dividers, card borders, input strokes.
- **Border Light** (#1f1f1f): Outer card shell border, lighter than default for the double-bezel effect.

### Named Rules
**The One Metal Rule.** Brass gold appears on ≤10% of any given screen. Its rarity is the point. Backgrounds, borders, text, and non-primary buttons use only neutrals.

**The Warm Black Rule.** Never use `#000` or `#fff`. Every neutral is tinted toward the brass hue by 0.5–1%. In light mode, the surface is warm off-white (#fafaf9), not pure white.

## 3. Typography

**Display Font:** Playfair Display, Georgia, serif
**Body Font:** Plus Jakarta Sans, DM Sans, system-ui, sans-serif
**Label/Mono Font:** JetBrains Mono, monospace

**Character:** The serif display speaks to artistry and tradition (music as craft); the geometric sans keeps the interface clean and modern (music as technology). Mono labels act as the technical annotations on an instrument panel.

### Hierarchy
- **Display** (500 italic, clamp(1.875rem–4.5rem), line-height 1, tracking -0.02em): Hero headlines on the landing page. Never used in the creation studio UI.
- **Headline** (500 italic, 1.875rem, line-height 1.1): Section titles on the creation page and landing sections. Playfair Display italic.
- **Title** (600, 1rem, line-height 1.3): Card titles, list item headings, player track names. Plus Jakarta Sans medium-to-semibold.
- **Body** (400, 0.875rem, line-height 1.65, max-width 65ch): All prose, descriptions, form labels, placeholder text.
- **Label** (500, 0.625rem, letter-spacing 0.15em, uppercase): Navigation labels, timestamps, metadata, eyebrow tags, status indicators. JetBrains Mono exclusively.

### Named Rules
**The No-Display-in-UI Rule.** Playfair Display is reserved for marketing surfaces (landing hero, section headers) and editorial moments. The creation studio uses only Plus Jakarta Sans and JetBrains Mono. Display fonts in buttons, form labels, or data tables are prohibited.

## 4. Elevation

Depth is conveyed through diffused ambient shadows paired with micro-shimmer highlights — not through heavy drop shadows or flat tonal layering alone.

The Double-Bezel card architecture (card-outer + card-inner nested shells) creates physical depth: an outer tray at 3% white opacity with a hairline border, and an inner core with an inset highlight (1px white at 5% opacity). On hover, the outer shadow expands and a warm brass hairline fades in along the bottom edge of the inner core.

### Shadow Vocabulary
All shadows are tinted with a trace of deep warm brown (#2a1a08 at varying alpha) — never pure black. This keeps shadow hues consistent with the brass theme and prevents the cold, clinical feel of `rgba(0,0,0,x)` shadows.

- **Card Rest** (`0 1px 2px rgba(42,26,8,0.45), 0 4px 16px rgba(42,26,8,0.35)`): Default card shadow. Warm and ambient, a dark oak surface resting on felt.
- **Card Elevated** (`0 2px 4px rgba(42,26,8,0.55), 0 8px 32px rgba(42,26,8,0.45)`): Hover state. The card lifts; the shadow deepens with a warm undertone. Paired with the metallic shimmer reveal.
- **Overlay** (`0 4px 12px rgba(42,26,8,0.55), 0 16px 64px rgba(42,26,8,0.65)`): Modal, glass panel, or dropdown. Deep, wide, and warm.
- **Inset Highlight** (`inset 0 1px 0 rgba(255,255,255,0.05)`): Applied to card-inner. Simulates light catching the inner brass edge. In light mode: `inset 0 1px 0 rgba(255,255,255,0.6)`.

### Named Rules
**The Shimmer-On-Hover Rule.** Shadows are ambient at rest. On hover, two things happen simultaneously: the outer shadow expands (warm-tinted, see Shadow Vocabulary) and a metallic brass hairline fades in along the bottom of the inner core. This line uses a linear gradient from antique bronze (#8b6914) through bright champagne (#f0d68a) to muted brass (#c49a3c) — a deliberate metallic sweep that catches the eye without glowing. No shadow-only hover: the shimmer is the point.

**The Noise Floor Rule.** A fixed, full-screen SVG noise texture at 2.5% opacity (3% in light mode) sits above all content with `pointer-events: none`. Never applied to scrolling containers. This is the floor — every surface rests on it.

## 5. Components

### Buttons
- **Shape:** Full pill (9999px radius). No square or slightly-rounded corners on primary actions.
- **Primary:** Brass gradient background, charcoal text, 14px 28px padding, uppercase, 0.8125rem, 600 weight. Contains an optional trailing icon nested inside a circular wrapper (32px, black at 8% opacity).
- **Hover:** Background shifts to brass glow; a warm halo appears (`0 0 48px rgba(212,168,83,0.3)`); the button lifts 1px.
- **Active:** Scale to 98% with a 1px downward translate (`translateY(1px)`). The combined scale + displacement simulates a physical key being pressed into a panel — not just a color change, but a tactile micro-journey. Duration: 100ms, ease-out.
- **Disabled:** Flat raised-slate background, tertiary text, no shadow, no transform.
- **Ghost:** Transparent background, 1px border in default color, 8px 16px padding, pill shape. Hover shifts border to brass and background to brass-soft.

### Chips / Tags
- **Eyebrow Tag:** Pill shape (9999px), 4px 12px padding, brass-soft background (8% opacity) with a subtle brass border. Mono font, 10px, uppercase, 0.2em tracking. Used above section headings and on selected style labels.
- **Suggestion Pills:** Ghost button style. Pill shape, border-default stroke, secondary text. Hover shifts to brass border with brass-soft background.

### Cards / Containers
- **Corner Style:** 1.5rem outer, calc(1.5rem - 5px) inner. Squircle territory — soft enough to feel physical, not so round it feels like a toy.
- **Architecture:** Double-Bezel. Outer shell (3% white bg, 5px padding) uses a fine metallic hairline border — `1px solid rgba(180,150,90,0.15)` — a trace of brass in the stroke that reinforces the workshop instrument character. Inside, the inner core (panel-charcoal bg, inset highlight, bottom-edge brass gradient reveal line on hover) feels like a precisely machined insert seated in its tray.
- **Shadow Strategy:** Card rest at rest, card elevated on hover, paired with shimmer reveal.
- **Border:** Outer shell uses border-light; inner core has no border — depth comes from the nested architecture alone.
- **Internal Padding:** 1.5rem (24px) standard; 2rem (32px) for hero cards like the dropzone.

### Inputs / Fields
- **Style:** 1px border-default stroke, panel-charcoal or canvas-black background, 12px radius, 16px 20px padding.
- **Focus:** Border shifts to brass gold. A subtle left-edge accent bar (2px brass) appears at 40% opacity when the field contains text.
- **Placeholder:** Text-secondary, Plus Jakarta Sans. Descriptive and encouraging.
- **Disabled:** 40% opacity. Border remains default, background stays the same.

### Navigation
- **Primary Layout:** Fixed left sidebar (240px) on creation page. Minimal top bar on landing page.
- **Sidebar Item:** 12px radius, 12px 16px padding, 2px left border on active. Background shifts to raised-slate on active, hover-slate on hover. Active state includes a small rotated diamond marker.
- **Icon Style:** Phosphor icons, 18px for nav, 14-16px for UI. Weight shifts from regular (inactive) to fill (active). Stroke width standardized at 1.5 globally.
- **Top Bar (Landing):** Fixed, transparent background. Logo mark (rotated diamond + brass dot) on the left, primary CTA button on the right. Minimal and floating.

### Music Player
- **Shape:** Standard Double-Bezel card.
- **VU Meter:** 48 bars at variable heights (sine + random), color shifts from border-default to brass-gold as playback progresses. 1px gaps between bars.
- **Play Button:** Rotated 45deg diamond (accent gold fill, dark icon). Active scale-down to 90%.
- **Progress:** 4px track in raised-slate, filled with brass-gold. Hover reveals a small rotated diamond handle.

### Signature: The Dropzone
- **Shape:** Double-Bezel card with Art Deco corner ornaments (8px accent borders at each corner, rotated diamonds at midpoints).
- **Idle State:** Dashed border, vinyl-record icon, French-inflected invitation copy ("拖拽音频文件到此处").
- **Processing:** Animated waveform bars (16 bars, 3px wide, brass color, staggered delays).
- **Success:** Rotated diamond with green check icon, filename display.
- **Error:** Rotated diamond with red warning icon, retry prompt.

## 6. Do's and Don'ts

### Do:
- **Do** use the Double-Bezel architecture for every major card on the creation page. Outer shell + inner core is the standard, not an exception.
- **Do** use brass gold exclusively for primary actions, active states, and completion signals. If brass appears on more than 10% of the surface, something is over-accented.
- **Do** pair every hover shadow lift with the bottom-edge brass shimmer reveal. One without the other is half-finished.
- **Do** use Playfair Display italic for landing hero and section titles only. The creation studio uses sans-serif exclusively.
- **Do** include loading, empty, and error states for every interactive component. The skeleton shimmer pattern (not a spinner) is the default loading treatment.
- **Do** apply the noise texture overlay to a fixed, pointer-events-none pseudo-element only. Never attach it to scrolling content.
- **Do** animate exclusively via transform and opacity. No layout-triggering properties (top, left, width, height) in transitions.

### Don't:
- **Don't** use side-stripe borders (`border-left` or `border-right` > 1px) as colored accents on cards or list items. The active nav item uses a thin 2px left border as a functional indicator, but this is the only exception; rewrite decorative side-stripes with background tints, full borders, or leading indicators.
- **Don't** use gradient text (`background-clip: text`) anywhere. Emphasis comes from weight, size, or the brass accent as a solid color.
- **Don't** use glassmorphism (backdrop-blur panels) as a default card style. Glass is reserved for fixed-position overlays, modals, and the landing page header — and even then, sparingly.
- **Don't** use `#000` or `#fff` anywhere. The dark theme's deepest color is #0d0d0d (canvas-black); the light theme's brightest is #fafaf9.
- **Don't** use purple, blue, or cyan as accent colors. No neon glows, no purple-blue gradients. The palette is brass.
- **Don't** use identical card grids (same-sized cards with icon + heading + text repeated). Vary card sizes, use masonry or asymmetric grids, or skip cards entirely in favor of dividers and negative space.
- **Don't** use Inter, Roboto, Arial, Open Sans, or Helvetica as display or body fonts.
- **Don't** use emojis in code, markup, text content, or alt text. Replace with Phosphor icons or clean SVG primitives.
- **Don't** use `h-screen` for full-height sections. Always use `min-h-[100dvh]` to prevent iOS Safari viewport collapse.
