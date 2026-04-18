# CSS Architecture

This document explains how styles are organized, what the design system looks like, and how to add or modify visual elements.

---

## Table of Contents

- [File Organization](#file-organization)
- [Design System Variables](#design-system-variables)
- [Typography](#typography)
- [Color System](#color-system)
- [Shared Components](#shared-components)
- [Screen-Specific Styles](#screen-specific-styles)
- [The HUD](#the-hud)
- [VNE Styles](#vne-styles)
- [Responsive Considerations](#responsive-considerations)
- [Rules and Conventions](#rules-and-conventions)

---

## File Organization

```
css/
├── reset.css    Minimal browser reset (margins, box-sizing, etc.)
├── main.css     Design system: CSS variables, typography, buttons, cards, base layout
├── vne.css      Visual novel engine: scene, portraits, dialogue, choices, fades
└── ui.css       All screen-specific styles: title, creation, HUD, planner, explore, etc.
```

**Load order in `index.html`:**
```html
<link rel="stylesheet" href="./css/reset.css">
<link rel="stylesheet" href="./css/main.css">
<link rel="stylesheet" href="./css/vne.css">
<link rel="stylesheet" href="./css/ui.css">
```

This order matters because later files can override earlier ones. `ui.css` has the highest specificity for screen-specific rules.

---

## Design System Variables

All design tokens are defined as CSS custom properties in `main.css`. Use these instead of hardcoding values.

### Colors

```css
/* Primary palette */
--color-night:          #1A1A2E;   /* darkest background, page bg */
--color-deep:           #16213E;   /* card backgrounds, panels */
--color-surface:        #0F3460;   /* elevated surfaces, hover states */
--color-accent:         #F4A623;   /* subway orange — primary buttons, key UI */
--color-border:         #2A2A4A;   /* subtle borders between elements */

/* Text */
--color-text-primary:   #F0EAD6;   /* warm off-white — body text */
--color-text-muted:     #8A9BB0;   /* secondary labels, helper text */

/* Stats (used for bars, delta floaters, effect previews) */
--color-money:          #4CAF50;   /* green */
--color-energy:         #F4A623;   /* orange (same as accent) */
--color-happiness:      #E91E8C;   /* pink */
--color-clout:          #9C27B0;   /* purple */

/* Background class accents */
--color-rich:           #C0A060;   /* Legacy class */
--color-middle:         #6090C0;   /* Ladder class */
--color-immigrant:      #C06040;   /* Grinder class */

/* Utility */
--color-danger:         #e05555;   /* red — negative money, delete buttons */
--color-success:        #4CAF50;   /* green — positive changes */
```

### Spacing

```css
--space-xs:   4px;
--space-sm:   8px;
--space-md:   16px;
--space-lg:   24px;
--space-xl:   40px;
```

### Typography

```css
--font-display:   'Courier New', monospace;   /* titles, stat numbers */
--font-body:      system-ui, sans-serif;      /* readable body text */
```

### Borders

```css
--radius-sm:   4px;
--radius-md:   8px;
--radius-lg:   12px;
```

---

## Typography

### Display Font

`'Courier New', monospace` is used for:
- Game title and headers
- Stat numbers and values
- Week counters
- Transit sign-inspired UI elements

This gives the game a New York transit signage feel.

### Body Font

`system-ui, sans-serif` is used for:
- Dialogue text
- Descriptions and labels
- Button text
- Card content

### Utility Classes

```css
.title-xl     /* Large title (game name, screen headers) */
.title-lg     /* Section headers */
.title-md     /* Subsection headers */
.title-sm     /* Small headers, labels */
.text-muted   /* Secondary text, --color-text-muted */
.text-italic   /* Italic flavor text */
```

---

## Color System

### When to Use Each Color

| Color | CSS Variable | Use For |
|-------|-------------|---------|
| Night | `--color-night` | Page background, missing asset fallback |
| Deep | `--color-deep` | Card backgrounds, panel backgrounds |
| Surface | `--color-surface` | Hover states, elevated elements |
| Accent | `--color-accent` | Primary buttons, links, key UI elements |
| Text Primary | `--color-text-primary` | Body text, headings |
| Text Muted | `--color-text-muted` | Labels, secondary info |
| Danger | `--color-danger` | Negative money, delete buttons, warnings |

### Stat Colors

Each stat has a consistent color used everywhere it appears:
- Stat bars in the HUD
- Effect previews in VNE choices
- Delta floaters
- Activity cost/effect previews in the planner
- Week summary on explore screen
- Ending screen stats

Use the CSS variable (e.g., `var(--color-money)`) not the hex value.

---

## Shared Components

### Buttons

```html
<button class="btn-primary">PRIMARY ACTION</button>
<button class="btn-ghost">SECONDARY ACTION</button>
<button class="btn-danger">DESTRUCTIVE ACTION</button>
```

| Class | Appearance | Use For |
|-------|-----------|---------|
| `.btn-primary` | Orange background, dark text | Main actions (Start Week, Continue, Resolve) |
| `.btn-ghost` | Transparent, orange border | Secondary actions (Skip, Do Nothing, Save & Quit) |
| `.btn-danger` | Red background | Destructive actions (Reset Game, Erase Everything) |

All buttons use `--font-display` and uppercase text.

### Cards

```html
<div class="card">
  Card content here
</div>
```

Cards have `--color-deep` background, rounded corners, and padding. They are used for:
- Planner activity cards
- Explore panels
- Inbox event cards
- Creation class/neighborhood cards

### Badges

```html
<span class="badge badge--city">CITY EVENT</span>
<span class="badge badge--opportunity">OPPORTUNITY</span>
<span class="badge badge--expiring">EXPIRES IN 2 DAYS</span>
```

Small colored pills used in the inbox and event interrupts.

### Relationship Pills

```html
<span class="rel-pill rel-pill--stranger">STRANGER</span>
<span class="rel-pill rel-pill--acquaintance">ACQUAINTANCE</span>
<span class="rel-pill rel-pill--neighbor">NEIGHBOR</span>
<span class="rel-pill rel-pill--ally">ALLY</span>
```

Used on the explore screen NPC panel and ending screen.

### Stat Bars

```html
<div class="stat-bar" data-stat="money">
  <span class="stat-bar__icon"></span>
  <span class="stat-bar__label">$</span>
  <div class="stat-bar__track">
    <div class="stat-bar__fill" id="stat-fill-money"></div>
  </div>
  <span class="stat-bar__value" id="stat-value-money">0</span>
</div>
```

Used in the HUD. Fill width and value text are updated by JavaScript.

Special state: `.stat-bar--money-negative` turns the money bar red when the player is in debt.

### Confirm Overlay

```html
<div class="confirm-overlay">
  <div class="confirm-box">
    <div class="confirm-box__title">Title</div>
    <div class="confirm-box__body">Are you sure?</div>
    <div class="confirm-box__actions">
      <button class="btn-ghost">CANCEL</button>
      <button class="btn-danger">CONFIRM</button>
    </div>
  </div>
</div>
```

Full-screen overlay with centered dialog box. Used for reset game confirmation. Created dynamically by `main.js`.

### Delta Floaters

```html
<div class="delta-floater delta-floater--money">+$100</div>
<div class="delta-floater delta-floater--energy">-10 energy</div>
```

Floating stat change indicators that animate upward and fade out. Created dynamically by `main.js.showStatDeltas()` and `planner.js._showStatDeltas()`.

Each stat variant uses the appropriate stat color. Animation duration: 1300ms.

---

## Screen-Specific Styles

All screen styles live in `css/ui.css`. Each screen section is marked with a comment header.

### Title Screen
- Centered layout with gradient background
- Large wordmark with `--font-display`
- Flavor text with muted color
- Vertically stacked buttons

### Creation Screen
- Card grid: class cards with colored accent bars
- Selection states: `--selected` (highlighted border), `--dimmed` (reduced opacity)
- Stat bars within cards
- Hood cards with rent/bonus/penalty info

### Planner Screen
- Day timeline (horizontal pills showing slots)
- Activity list (card-style buttons with cost/effect previews)
- Work recap bar
- Day transition overlay (animated)
- Flavor toast (slides up from bottom, fades out)
- Warning banners (danger red, warn yellow, good green)

### Explore Screen
- Grid layout for panels
- NPC rows with avatar circles and info
- Progress bar
- Pulse panel with weather/headlines

### Inbox Screen
- Card list with badges, titles, teasers
- Resolve buttons per card

### Ending Screen
- Stats grid
- NPC list with relationship pills
- Score display with large number

### Settings Modal
- Overlay with centered panel
- Text speed slider
- Reset game button

### Coach / Codex
- Coach overlay: small tip panel with dismiss button
- Codex modal: scrollable reference with sections

---

## The HUD

The HUD is a fixed `<header>` at the top of the viewport.

```
┌──────────────────────────────────────────────────────┐
│ WEEK 03  Astoria │ $ ██░░ 800 │ ENERGY ████░ 75 │ ? ⚙ │
│                  │ HAPPY ██░░  28 │ CLOUT █░░░  12 │    │
└──────────────────────────────────────────────────────┘
```

### HUD Visibility

The HUD is toggled via:
```css
.hud--hidden { display: none; }
```

When the HUD is visible, `<body>` gets the `hud-visible` class. Screen layouts use this to adjust their `min-height`:

```css
body.hud-visible .screen.active {
  min-height: calc(100vh - var(--hud-height));
}
```

### HUD Layout

Three sections:
- **Left:** Week number + neighborhood label
- **Center:** 4 stat bars
- **Right:** Help button (?) + settings gear (SVG icon)

---

## VNE Styles

See [docs/vne/README.md](../vne/README.md#css-structure) for VNE-specific CSS documentation.

---

## Responsive Considerations

The game is designed for desktop-first but should work on mobile:
- The HUD stat bars stack or shrink on narrow screens
- Card grids collapse to single column
- The VNE uses relative units for portrait positioning
- Button tap targets meet minimum 44px guidelines

The viewport meta tag is set in `index.html`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

Capacitor is configured for future native builds, which will need additional mobile-specific CSS.

---

## Rules and Conventions

1. **No inline styles in JavaScript.** All styling must go through CSS classes. The only exceptions in the codebase are stat colors in dynamically generated HTML (e.g., `style="color:var(--color-money)"`) where the color depends on data.

2. **Use CSS variables.** Never hardcode `#1A1A2E` when you can use `var(--color-night)`.

3. **BEM-ish naming.** Class names follow a BEM-like pattern:
   - Block: `.planner`
   - Element: `.planner__header`
   - Modifier: `.planner__warning--danger`

4. **State classes use `--` prefix:** `.hud--hidden`, `.vne-container--hidden`, `.class-card--selected`

5. **Screen visibility uses `.active` class:**
   ```css
   .screen { display: none; }
   .screen.active { display: flex; }
   ```

6. **Keep related styles together.** All planner styles are in one block in `ui.css`, all VNE styles in `vne.css`.
