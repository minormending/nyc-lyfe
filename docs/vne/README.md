# Visual Novel Engine (VNE)

The VNE renders interactive story scenes with backgrounds, character portraits, dialogue, and branching choices. It is a self-contained module that knows nothing about game state or game logic.

---

## Table of Contents

- [Overview](#overview)
- [API](#api)
- [Scene Object Format](#scene-object-format)
- [Rendering Pipeline](#rendering-pipeline)
- [Character Portraits](#character-portraits)
- [Dialogue System](#dialogue-system)
- [Choice System](#choice-system)
- [Asset Fallbacks](#asset-fallbacks)
- [Narrator Mode](#narrator-mode)
- [Accessibility](#accessibility)
- [CSS Structure](#css-structure)
- [Common Tasks](#common-tasks)

---

## Overview

**File:** `js/engine/vne.js`
**CSS:** `css/vne.css`
**DOM:** Owns `#vne-container` exclusively

The VNE is stateless. It receives a scene object, renders it, and calls back with the player's choice. It does not know about GameState, effects, or any other game system.

```
Caller (inbox, planner, creation)
  │
  ├── VNE.play(scene, onComplete)
  │     └── Renders scene, handles interaction
  │     └── Calls onComplete(choiceIndex) when done
  │
  └── Caller applies effects based on choiceIndex
```

---

## API

### `play(sceneObject, onComplete)`

Renders a scene and calls `onComplete(choiceIndex)` when the player finishes it.

```js
import * as VNE from '../engine/vne.js';

VNE.play(myScene, (choiceIndex) => {
  // choiceIndex = 0, 1, 2, ... for the selected choice
  // choiceIndex = -1 if the scene had no choices
});
```

**Behavior:**
1. Builds fresh DOM inside `#vne-container`
2. Removes the `vne-container--hidden` class (makes it visible)
3. Fades in from black
4. Renders dialogue line by line with typewriter effect
5. After all dialogue: shows choices (or waits for final click)
6. Fades to black on exit
7. Adds `vne-container--hidden` back
8. Calls `onComplete`

### `preload(assetManifest)`

Preloads background and portrait images.

```js
VNE.preload({
  backgrounds: ['apartment_day', 'subway_platform'],
  portraits: ['carlos_neutral', 'priya_concerned']
});
```

Each background path resolves to `./assets/bg/[name].jpg`, each portrait to `./assets/portraits/[name].png`.

### `setTextSpeed(charsPerSecond)`

Sets the typewriter speed. Range: 10 (slow) to 100 (instant).

```js
VNE.setTextSpeed(50); // fast reader
```

At speed 100, text appears all at once (no typewriter effect).

### `skip()`

Immediately completes the current typewriter animation. If called during a typing animation, the full text appears instantly.

---

## Scene Object Format

A scene is a plain JavaScript object:

```js
{
  id: 'scene_id',                    // unique identifier
  background: 'apartment_day',       // maps to assets/bg/apartment_day.jpg
  characters: [                      // array of character portraits
    {
      id: 'carlos',                  // maps to portrait files
      position: 'left',             // 'left' or 'right'
      expression: 'neutral'          // maps to assets/portraits/carlos_neutral.png
    },
    {
      id: 'priya',
      position: 'right',
      expression: 'concerned'
    }
  ],
  dialogue: [                        // array of dialogue lines, played in order
    { speaker: 'narrator', text: 'The bodega is quiet this time of day.' },
    { speaker: 'carlos', text: 'You want coffee?' },
    { speaker: 'player', text: 'Sure.' },
    { speaker: 'carlos', text: 'It is three dollars.' }
  ],
  choices: [                         // branching options (null if no choices)
    {
      label: 'Pay for the coffee',
      effects: { money: -3, happiness: 5, npc: { id: 'carlos', delta: 1 } }
    },
    {
      label: 'Say you forgot your wallet',
      effects: { happiness: -2 }
    }
  ]
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique scene identifier |
| `background` | string | No | Background key. Resolves to `./assets/bg/[key].jpg`. Missing = solid dark fill |
| `characters` | array | No | Character portraits to display. Empty = narrator mode |
| `dialogue` | array | Yes | Dialogue lines played in sequence |
| `choices` | array or null | No | Branching choices shown after dialogue ends. Null or empty = no choices |

### Speaker Values

| Value | Behavior |
|-------|----------|
| `'narrator'` | No nameplate. Text appears as narration |
| `'player'` | Nameplate shows "YOU" |
| `'carlos'` | Nameplate shows "Carlos". Portrait brightens |
| (any ID) | Nameplate shows capitalized ID. Matching portrait brightens |

---

## Rendering Pipeline

Here is exactly what happens when `play()` is called:

```
1. SETUP (instant)
   ├── Clear container innerHTML
   ├── Build DOM: bg div, scene div, nameplate, dialogue box, text area,
   │              advance hint, choices panel, fade overlay, SR transcript
   ├── Remove vne-container--hidden class
   ├── Set background image (with fallback)
   ├── Check narrator mode (no characters → add narrator CSS classes)
   └── Create character portrait elements

2. FADE IN (320ms)
   ├── Fade overlay transitions from opaque black to transparent
   └── After 320ms: hide fade overlay, show first dialogue line

3. DIALOGUE LOOP
   For each line in dialogue[]:
   ├── Update speaker highlight (active portrait brightens, others dim)
   ├── Show/hide nameplate
   ├── Update SR transcript (for screen readers)
   ├── Start typewriter animation
   │   ├── Characters appear one at a time at configured speed
   │   ├── Click during typing → complete instantly
   │   └── When typing finishes: show advance hint (▼ indicator)
   ├── Wait for click/Space/Enter
   └── Advance to next line

4. AFTER LAST LINE
   ├── If choices exist: show choice buttons
   └── If no choices: wait for one more click/key → exit

5. CHOICES (if present)
   ├── Hide dialogue box
   ├── Show choices panel
   ├── Animate buttons in from below (80ms stagger per button)
   ├── Each button shows: label + colored effect previews
   ├── Focus first button for keyboard navigation
   ├── On click: selected button highlights, others fade out
   └── After 300ms delay: exit scene

6. EXIT (420ms)
   ├── Show fade overlay (transition to opaque black)
   ├── After 420ms: cleanup DOM, add vne-container--hidden
   └── Call onComplete(choiceIndex)
```

---

## Character Portraits

### Position

Characters are positioned absolutely within the scene:
- `left`: positioned on the left side of the screen
- `right`: positioned on the right side of the screen

### Active/Inactive State

The currently speaking character is "active":
- Active portrait: full opacity (1.0), shifted 12px toward center
- Inactive portrait: reduced opacity (0.4), no shift

Transitions between active states take 200ms.

### Portrait Loading

For a character `{ id: 'carlos', expression: 'amused' }`:

```
1. Try: ./assets/portraits/carlos_amused.png
2. If fails: Try ./assets/portraits/carlos_neutral.png
3. If fails: Show colored circle placeholder
```

### Placeholder Circles

When no portrait image is available, a colored circle is shown with the character's first initial:

```
Carlos → brown circle (#A0522D) with "C"
Priya  → blue circle (#6090C0) with "P"
Dima   → green circle (#4A7C59) with "D"
Jordan → copper circle (#9C5A3C) with "J"
Player → orange circle (#F4A623) with "P"
```

These colors are defined in the `CHAR_COLORS` constant in `vne.js`.

---

## Dialogue System

### Typewriter Effect

Text appears one character at a time. The speed is controlled by `_textSpeed` (characters per second):

- Default: 28 chars/sec
- Range: 10 (very slow) to 100 (instant)
- At speed 100: text appears all at once, no animation

The interval between characters: `1000 / _textSpeed` milliseconds.

### Player Interaction

| State | Click/Space/Enter |
|-------|------------------|
| Typing in progress | Completes typing instantly (shows full text) |
| Text complete, waiting | Advances to next dialogue line |
| Last line shown, no choices | Exits scene with choiceIndex = -1 |
| Choices visible | No effect (clicks go to choice buttons) |

### Advance Hint

A small `▼` indicator appears below the text when the typewriter finishes, telling the player they can click to advance. CSS class: `vne-advance-hint--visible`.

---

## Choice System

### Display

Choices appear after the last dialogue line. Each choice button shows:

1. **Label text** - The choice description (e.g., "Pay for the coffee")
2. **Effect preview** - Colored tags showing what the choice does:
   - Money: green (`#4CAF50`) for gains, red (`#e05555`) for costs
   - Energy: orange (`#F4A623`) for gains, red for costs
   - Happiness: pink (`#E91E8C`) for gains, red for costs
   - Clout: purple (`#9C27B0`) for gains, red for costs
   - NPC: green for positive, red for negative, with NPC name
   - Unlocks: purple, shows unlock name

### Animation

Choices animate in with an 80ms stagger:
- Button 1: appears at 0ms
- Button 2: appears at 80ms
- Button 3: appears at 160ms

On selection:
- Selected button: adds `vne-choice--selected` class (highlight)
- Other buttons: add `vne-choice--fading` class (fade out)
- 300ms later: scene exits

### Keyboard Navigation

After choices appear, focus moves to the first button. Players can Tab between choices and press Enter/Space to select.

---

## Asset Fallbacks

The VNE must never crash on missing assets. Here is the fallback chain:

### Backgrounds

```
1. Load ./assets/bg/[key].jpg
2. On success: set as background-image (cover fit)
3. On failure: set background-color to var(--color-night) (#1A1A2E)
```

### Portraits

```
1. Load ./assets/portraits/[id]_[expression].png
2. On success: display image
3. On failure: try ./assets/portraits/[id]_neutral.png
4. On success: display image
5. On failure: show colored circle with initial letter
```

---

## Narrator Mode

If the scene has no `characters` array (or it's empty), the VNE enters narrator mode:

- A dark semi-transparent overlay is added on top of the background
- The dialogue box gets additional styling (centered, italic-friendly)
- No nameplate is shown
- No portrait elements are created

This is used for the intro scene (apartment arrival monologue) and some event cards.

---

## Accessibility

### Screen Reader Support

- The VNE container has `aria-live="polite"`
- A hidden transcript element (`vne-sr-transcript`) is updated with each dialogue line
- This means screen readers will announce new dialogue lines as they appear

### Keyboard Support

- Space or Enter: advance dialogue / select choice
- Tab: navigate between choice buttons
- All interactive elements have appropriate `tabindex` and `role` attributes

---

## CSS Structure

The VNE styles are in `css/vne.css`. Key classes:

| Class | Purpose |
|-------|---------|
| `.vne-container` | Full-screen overlay, fixed position, z-index above everything |
| `.vne-container--hidden` | Hides the container (`display: none`) |
| `.vne-bg` | Background image layer, `background-size: cover` |
| `.vne-bg--narrator-overlay` | Dark overlay for narrator mode |
| `.vne-scene` | Contains all interactive elements (portraits, dialogue, choices) |
| `.vne-portrait` | Character portrait wrapper |
| `.vne-portrait--left` / `--right` | Horizontal positioning |
| `.vne-portrait--active` | Full opacity, shifted toward center |
| `.vne-portrait--inactive` | Reduced opacity |
| `.vne-portrait__placeholder` | Colored circle fallback |
| `.vne-nameplate` | Speaker name label above dialogue |
| `.vne-nameplate--visible` | Fade in the nameplate |
| `.vne-dialogue` | Dialogue box container |
| `.vne-dialogue--narrator` | Narrator mode styling |
| `.vne-text` | Dialogue text content |
| `.vne-text--fade-in` | Fade-in animation for new text |
| `.vne-advance-hint` | "Click to continue" indicator |
| `.vne-choices` | Choices container |
| `.vne-choices--hidden` | Hides choices until dialogue ends |
| `.vne-choice` | Individual choice button |
| `.vne-choice--visible` | Fade-in animation |
| `.vne-choice--selected` | Highlight state |
| `.vne-choice--fading` | Fade-out for non-selected choices |
| `.vne-choice__label` | Choice text |
| `.vne-choice__effects` | Effect preview tags |
| `.vne-fade` | Black overlay for fade transitions |
| `.vne-fade--in` | Fade from black to transparent |
| `.vne-fade--out` | Fade from transparent to black |

---

## Common Tasks

### Adding a New Character Expression

1. Create the portrait image: `public/assets/portraits/[id]_[expression].png` (320x420 PNG)
2. Reference it in scene data: `{ id: 'carlos', position: 'left', expression: 'your_expression' }`
3. No code changes needed

### Changing Typewriter Speed

The speed is stored in `nyc_settings` localStorage and applied via `VNE.setTextSpeed()`. The settings modal slider (in `main.js`) controls this.

### Adding a New Character Color

Add the color to `CHAR_COLORS` in `vne.js`:

```js
const CHAR_COLORS = {
  carlos: '#A0522D',
  priya:  '#6090C0',
  dima:   '#4A7C59',
  jordan: '#9C5A3C',
  player: '#F4A623',
  your_new_char: '#hexcolor',
};
```

### Creating a Scene Programmatically

Any code can construct a scene object and pass it to `VNE.play()`:

```js
const myScene = {
  id: 'dynamic_scene',
  background: 'apartment_night',
  characters: [
    { id: 'dima', position: 'left', expression: 'amused' }
  ],
  dialogue: [
    { speaker: 'dima', text: 'Is that my music bothering you again?' },
    { speaker: 'player', text: 'A little bit, yeah.' }
  ],
  choices: [
    { label: 'Ask him to turn it down', effects: { happiness: 3 } },
    { label: 'Say it is fine', effects: { npc: { id: 'dima', delta: 1 } } }
  ]
};

VNE.play(myScene, (idx) => { /* handle result */ });
```

### Debugging a Scene

Open the browser console and run:

```js
// Import VNE (available as module in browser)
// Navigate to any screen first, then:
import('./js/engine/vne.js').then(VNE => {
  VNE.play({
    id: 'test',
    background: null,
    characters: [],
    dialogue: [{ speaker: 'narrator', text: 'Test scene.' }],
    choices: null
  }, idx => console.log('Done:', idx));
});
```
