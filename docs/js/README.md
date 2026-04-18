# JavaScript Architecture

This document explains how the JavaScript code is organized, how modules communicate, and how data flows through the system. Read this before making any code changes.

---

## Table of Contents

- [Overview](#overview)
- [Module Map](#module-map)
- [Bootstrap Sequence](#bootstrap-sequence)
- [Data Flow](#data-flow)
- [State Management](#state-management)
- [The Effects System](#the-effects-system)
- [Module-by-Module Reference](#module-by-module-reference)
  - [main.js](#mainjs)
  - [game/state.js](#gamestatejs)
  - [game/effects.js](#gameeffectsjs)
  - [game/events.js](#gameeventsjs)
  - [game/idle.js](#gameidlejs)
  - [game/npcs.js](#gamenpcsjs)
  - [game/coach.js](#gamecoachjs)
  - [utils/loader.js](#utilsloaderjs)
  - [utils/router.js](#utilsrouterjs)
  - [engine/vne.js](#enginevnejs)
- [Common Patterns](#common-patterns)
- [Common Mistakes](#common-mistakes)

---

## Overview

The codebase is organized into four layers:

```
┌────────────────────────────────────┐
│          main.js (bootstrap)       │  Startup, HUD, settings
├────────────────────────────────────┤
│         screens/*.js               │  UI screens (7 total)
├────────────────────────────────────┤
│  game/*.js          engine/vne.js  │  Core logic + VNE renderer
├────────────────────────────────────┤
│         utils/*.js                 │  Data loading, routing
└────────────────────────────────────┘
```

**Key principles:**
- Each module has a single responsibility
- Modules communicate by passing data explicitly (no event bus, no pub/sub)
- The only shared mutable state is `GameState` in `state.js`
- All mutations go through `effects.js`
- No module touches another module's DOM

---

## Module Map

```
js/
├── main.js              Bootstrap + HUD management
├── engine/
│   └── vne.js           Visual novel scene renderer
├── game/
│   ├── state.js         GameState object + localStorage
│   ├── effects.js       Stat mutation (pure function)
│   ├── events.js        Card draw + resolution
│   ├── idle.js          Offline progression calculator
│   ├── npcs.js          NPC arc progression
│   └── coach.js         Tutorial tips + codex
├── screens/
│   ├── title.js         Title screen
│   ├── creation.js      Character creation
│   ├── digest.js        Idle summary
│   ├── inbox.js         Pending event cards
│   ├── planner.js       Day-by-day planner (most complex)
│   ├── explore.js       End-of-week hub
│   └── ending.js        Year-end summary
└── utils/
    ├── loader.js        JSON data fetcher + cache
    └── router.js        Screen navigation
```

---

## Bootstrap Sequence

When the page loads, `main.js` runs an immediately-invoked async function called `boot()`. Here is exactly what happens, in order:

```
1. Check if localStorage is available
   └── If not: show warning banner, continue anyway

2. Fetch all JSON data files (parallel)
   └── loader.fetchData() → returns { classes, neighborhoods, jobs, ... }

3. Load persisted settings
   └── state.loadSettings() → { textSpeed: 28 }
   └── VNE.setTextSpeed(settings.textSpeed)

4. Register all 7 screens with the router
   └── router.register('title', titleScreen)
   └── router.register('creation', creationScreen)
   └── ... etc

5. Pass data to router and initialize all screens
   └── router.setData(data)
   └── router.initAll()  → calls init(data) on each screen

6. Wire up HUD buttons (settings gear, help "?")
   └── Initialize coach system
   └── Register navigation callback to dismiss coach tips

7. Check for saved game
   ├── No save: hide HUD, router.go('title')
   └── Has save:
       ├── idle.calculate(savedState, data) → { state, summary }
       ├── state.setState(result.state)
       ├── state.save()
       ├── Show HUD
       └── Decide starting screen:
           ├── Nothing happened: go to 'explore' (or 'inbox' if pending)
           └── Something happened: go to 'digest' (show summary)

8. Start HUD update loop (every 2 seconds)
```

**Why this matters:** If you add a new module that needs data at startup, it must be registered before step 5. If you add a new screen, register it in step 4.

---

## Data Flow

Here is how data moves through the system when a player performs an action (for example, choosing an activity in the planner):

```
Player clicks "Go Out" activity button
  │
  ├─ planner.js: _doActivity(act, data)
  │   │
  │   ├─ Calculate effective energy cost (burnout modifier, neighborhood penalty)
  │   ├─ Apply energy cost via effects.apply({ energy: -cost }, GameState, data)
  │   │   └── effects.js: clones state, applies delta, clamps 0-100, returns new state
  │   ├─ setState(newState)
  │   │
  │   ├─ Apply activity effects via effects.apply(modifiedEffects, GameState, data)
  │   │   └── Class ability modifiers applied first (Grinder: -30% negatives, Ladder: +20% clout)
  │   │   └── Neighborhood penalty applied (UES: -30% happiness gains)
  │   ├─ setState(newState)
  │   │
  │   ├─ If social_hangout: _advanceRandomNpc(data)
  │   │   └── Picks random NPC, calls npcs.advanceArc(id, +1, state, npcData)
  │   │   └── If threshold crossed: scene ID added to inbox
  │   │
  │   ├─ _checkSafetyNet() (Legacy class: top up to $500 if below)
  │   ├─ _setActivity(day, slot, activityId) → writes to GameState.routine
  │   ├─ save()
  │   │
  │   ├─ _showStatDeltas(deltaSummary) → floating +/- numbers near HUD
  │   ├─ _showFlavorToast(act.flavorCompleted) → temporary text toast
  │   └─ _advanceSlot() → move to next slot or next day
  │
  └─ Meanwhile, HUD update loop picks up new stat values (every 2s)
```

**Notice the pattern:** Every mutation goes through `effects.apply()` → `setState()` → `save()`. This is the only way to change game state.

---

## State Management

### The GameState Object

`GameState` is a plain JavaScript object exported from `game/state.js`. It contains ALL game state. There is no other state store.

```js
// Importing state
import { GameState, setState, save, load, reset } from './game/state.js';

// Reading state (always safe)
const currentMoney = GameState.money;
const week = GameState.week;

// Writing state (ALWAYS go through effects.apply)
import { apply } from './game/effects.js';
const newState = apply({ money: 100 }, GameState, data);
setState(newState);
save();
```

### localStorage Keys

The game uses three localStorage keys:

| Key | Contents | Survives reset? |
|-----|----------|-----------------|
| `nyc_save` | Full serialized GameState | No |
| `nyc_version` | Save format version string (`"1.0"`) | No |
| `nyc_settings` | `{ textSpeed: 28 }` | Yes |

### What Happens When localStorage Fails

If localStorage is unavailable (private browsing, storage full, etc.):
- A yellow warning banner appears at the top of the page
- The game continues to work normally in memory
- Progress is not saved between sessions
- The game does **not** crash

---

## The Effects System

`effects.js` is the mutation layer. It is a pure function: it takes an effect object and a state, and returns a new state. It never modifies the input state.

### Effect Object Format

An effect object is a plain JavaScript object. Each key triggers a specific behavior:

```js
// Immediate stat changes (applied right now)
{ money: -50, happiness: +5 }

// NPC arc advancement (may trigger a scene)
{ npc: { id: 'carlos', delta: 1 } }

// Unlock a feature
{ unlock: 'freelance' }

// Chain another scene into the inbox
{ nextScene: 'scene_id' }

// Add a log entry
{ log: 'Something happened' }

// Deferred effects (processed during idle or next planner cycle)
{ energyDebuff: { delta: -5, weeks: 3 } }       // -5 energy/week for 3 weeks
{ happinessDebuff: { delta: -3, weeks: 2 } }     // -3 happiness/week for 2 weeks
{ moneyOverWeeks: { amount: 500, weeks: 4 } }    // +$125/week for 4 weeks
{ moneyNextSession: 200 }                         // +$200 next time game opens
{ moneyLoseDailyPay: true }                       // lose one day's pay
{ neighborhoodTemp: { id: 'williamsburg', weeks: 4 } }  // temp neighborhood
{ rentDeltaPermanent: 50 }                        // permanent rent increase
```

### How apply() Works Internally

```
1. Deep clone the state (JSON.parse/stringify)
2. Apply immediate stat deltas (money, energy, happiness, clout)
3. Clamp stats to valid ranges:
   - energy:    0 to 100
   - happiness: 0 to 50
   - clout:     0 to 50
   - money:     no floor (can go negative)
4. If NPC delta: call npcs.advanceArc() → may add scene to inbox
5. If unlock: add to state.unlocks[] (deduplicated)
6. If nextScene: prepend to state.inbox[]
7. If log: prepend to state.log[] (max 50 entries)
8. If any deferred effects: push to state._pendingEffects[]
9. Return the new state object
```

### Batch Apply

To apply multiple effect objects in sequence:

```js
import { applyAll } from './game/effects.js';
const newState = applyAll([fx1, fx2, fx3], currentState, data);
```

Each effect is applied to the result of the previous one.

---

## Module-by-Module Reference

### main.js

**Purpose:** Bootstrap only. No game logic.

**Exports:**
- `showStatDeltas(effectObj)` - Shows floating +/- numbers near the HUD stats

**Manages directly:**
- The HUD (`#hud`) - week number, neighborhood label, stat bars
- Settings modal - text speed slider, reset game button
- Help button - opens the coach codex
- Stat delta floaters (`#delta-container`)

**HUD update loop:** Runs every 2 seconds via `setInterval`. Reads `GameState` and updates the DOM. The money bar turns red when negative.

---

### game/state.js

**Purpose:** Single source of truth for all game state.

**Exports:**
- `GameState` - The live state object (null until loaded/created)
- `buildDefaultState(bgId, hoodId, jobId, startingStats, unlocks)` - Creates a fresh state
- `load()` - Reads from localStorage, returns null if no save
- `save()` - Writes GameState to localStorage
- `reset()` - Clears localStorage, sets GameState to null
- `setState(newState)` - Replaces the live GameState
- `isStorageAvailable()` - Returns boolean
- `loadSettings()` / `saveSettings(settings)` - Separate persistence for text speed

**Default routine:** When `buildDefaultState()` is called, it creates 21 routine slots (7 days x 3 slots). Weekday mornings and afternoons are pre-set to `'work'`. Everything else is `null`.

---

### game/effects.js

**Purpose:** Pure mutation function. Takes an effect object + state, returns a new state.

**Exports:**
- `apply(effectObject, state, data)` - Apply one effect, return new state
- `applyAll(effectObjects, state, data)` - Apply multiple effects in sequence

**Important:** This function deep-clones the state before modifying it. The original state is never mutated. This is critical for correctness since multiple effects might be applied in sequence and intermediate states need to be predictable.

---

### game/events.js

**Purpose:** Card draw and resolution. Does NOT apply effects - returns effect objects.

**Exports:**
- `draw(deckName, state, data)` - Weighted random card selection
- `resolve(card, choiceIndex)` - Returns the effect object for a choice
- `findCard(sceneId, data)` - Find a card by ID across both decks
- `recordDrawn(cardId, state)` - Mark a card as drawn (for cooldown tracking)

**Eligibility filtering (draw):**
1. Not already in inbox (no duplicates)
2. One-time cards not already drawn
3. Class matches eligibility list (or `'all'`)
4. Minimum week requirement met
5. Required unlock present in state
6. Required routine activity present (e.g., `extra_shift` for certain cards)
7. Cooldown period expired

**Weight modifiers (draw):**
- Low money (< $500): cost-heavy cards weighted 0.5x
- High clout (>= 25): opportunity cards weighted 1.5x
- Low happiness (< 30): negative-event cards weighted 1.3x
- Astoria neighborhood: clout-gaining cards weighted 0.4x

---

### game/idle.js

**Purpose:** Calculate what happened while the player was away. Called once at game open.

**Exports:**
- `calculate(state, data)` - Returns `{ state: newState, summary: idleSummary }`

**Summary object shape:**
```js
{
  gameDaysElapsed: 3,
  incomeEarned: 450,
  rentPaid: 0,
  rentIncrease: 0,
  energyGained: 60,
  newCards: 1,
  expiredCards: 0,
  logEntries: ['You earned $450 from work. Another week in the machine.'],
  happinessWarning: false,
}
```

**Idle calculation steps:**
1. Compute elapsed time (capped at 14 game days)
2. Add daily income (job.weeklyPay / 7 per day)
3. Add energy regen (20/day + neighborhood bonus)
4. Process `_pendingEffects` (debuffs, money over weeks, temp neighborhood)
5. Deduct rent for full real-world weeks away (not partial weeks)
6. Draw 1-3 city cards spaced through the idle period
7. Mark expired inbox cards (based on `ttlDays`)
8. Check happiness warning threshold

---

### game/npcs.js

**Purpose:** NPC relationship progression.

**Exports:**
- `advanceArc(npcId, delta, state, npcData)` - Returns `{ state, triggeredSceneId }`
- `getStatus(npcId, state, npcData)` - Returns `{ arc, relationship, stage, nextStage, scenesPlayed }`
- `findArcScene(sceneId, npcArcsData)` - Search arc scenes across all NPCs

**Arc progression:**
- Arc score ranges from 0 to 10
- Each NPC has stage thresholds (e.g., Carlos: 0, 1, 3, 6, 9)
- When arc crosses a threshold, the corresponding scene is triggered
- Each scene can only trigger once (tracked in `scenesPlayed[]`)
- Only one scene triggers per `advanceArc()` call

**Relationship labels:** `stranger` → `acquaintance` → `neighbor` → `ally`

---

### game/coach.js

**Purpose:** Contextual tutorial tips shown once per topic, plus a "How to Play" codex.

**Exports:**
- `init()` - Wire up dismiss button and codex close
- `trigger(tipId)` - Show a tip if not yet seen
- `dismiss()` - Dismiss current tip
- `dismissSilent()` - Dismiss without animation (used on navigation)
- `reset()` - Clear all seen tips
- `openCodex()` / `closeCodex()` - Toggle the codex modal

**Tip IDs:** `creation_class`, `creation_hood`, `planner_overview`, `planner_evening`, `planner_weekend`, `event_interrupt`, `inbox_intro`, `explore_intro`

**Codex:** A comprehensive "How to Play" page built dynamically using game data. Shows stats explanation, activity list, neighborhood info, class abilities, scoring formula, and strategy tips.

---

### utils/loader.js

**Purpose:** Fetch all JSON data files and cache them in memory.

**Exports:**
- `fetchData()` - Fetch all 7 JSON files in parallel, returns cached data object
- `getData()` - Return cached data (throws if `fetchData()` not called)
- `preloadAssets(scenes)` - Preload background/portrait images

**Data files fetched:**
```
public/data/classes.json
public/data/neighborhoods.json
public/data/jobs.json
public/data/activities.json
public/data/city_cards.json
public/data/opportunity_cards.json
public/data/npc_arcs.json
```

**Error handling:** If any single file fails to load, that key gets an empty array and a console warning is logged. The rest of the game continues. This means the game is resilient to partial data loading failures.

**Caching:** Data is fetched once and cached in a module-level variable. Subsequent calls to `fetchData()` return the cached copy instantly.

---

### utils/router.js

**Purpose:** Screen navigation. No URL hash routing - this is a single-session game.

**Exports:**
- `register(name, module)` - Register a screen with its init/show/hide functions
- `setData(data)` - Store data for init() calls
- `initAll()` - Call init(data) on all registered screens
- `go(screenName, params)` - Navigate: hide current, show target
- `current()` - Return active screen name
- `onNavigate(callback)` - Register a callback for navigation events

**Navigation flow:**
```
router.go('planner')
  1. Fire all onNavigate callbacks
  2. Call current screen's hide()
  3. Set _currentScreen = 'planner'
  4. Call planner.show(params)
```

**Screens are never destroyed.** They are created once during `initAll()` and toggled between visible/hidden using the CSS class `active`.

---

### engine/vne.js

**Purpose:** Renders visual novel scenes. Stateless - knows nothing about game state.

See [docs/vne/README.md](../vne/README.md) for complete documentation.

---

## Common Patterns

### Reading Game Data

```js
import { getData } from '../utils/loader.js';

const data = getData();
const job = (data.jobs || []).find(j => j.id === GameState.job);
const hood = (data.neighborhoods || []).find(n => n.id === GameState.neighborhood);
```

Always use `|| []` when accessing data arrays to handle missing data gracefully.

### Applying Effects and Saving

```js
import { GameState, setState, save } from '../game/state.js';
import * as effects from '../game/effects.js';
import { getData } from '../utils/loader.js';

const data = getData();
const newState = effects.apply({ money: 100, happiness: 5 }, GameState, data);
setState(newState);
save();
```

### Navigating Between Screens

```js
import * as router from '../utils/router.js';

router.go('explore', { weekSummary: { startMoney: 1000, endMoney: 800 } });
```

The params object is passed to the target screen's `show(params)` function.

### Playing a VNE Scene

```js
import * as VNE from '../engine/vne.js';

VNE.play(sceneObject, (choiceIndex) => {
  // choiceIndex is 0-based, or -1 if the scene had no choices
  if (choiceIndex >= 0) {
    const effectObj = sceneObject.choices[choiceIndex].effects;
    // apply effects...
  }
});
```

---

## Common Mistakes

### 1. Writing directly to GameState

```js
// WRONG
GameState.money += 100;

// RIGHT
const newState = effects.apply({ money: 100 }, GameState, data);
setState(newState);
save();
```

### 2. Forgetting to save after mutation

```js
// WRONG - state changes are lost on page refresh
setState(newState);

// RIGHT
setState(newState);
save();
```

### 3. Touching another module's DOM

```js
// WRONG - vne-container belongs to engine/vne.js
document.getElementById('vne-container').innerHTML = '';

// RIGHT - use the VNE module's API
VNE.play(scene, callback);
```

### 4. Adding game logic to main.js

`main.js` is bootstrap only. Game logic goes in `game/` modules. Screen rendering goes in `screens/` modules.

### 5. Using frameworks or TypeScript

This project is intentionally vanilla JS. Do not add React, Vue, Svelte, jQuery, TypeScript, or any other framework. See CLAUDE.md "Hard Rules".

### 6. Using absolute asset paths

```js
// WRONG
img.src = '/assets/bg/apartment_day.jpg';

// RIGHT
img.src = './assets/bg/apartment_day.jpg';
```

Absolute paths break when the game is deployed to a subpath (e.g., `/nyc-lyfe/`).

### 7. Forgetting the data parameter in effects.apply

```js
// WRONG - NPC arc scenes won't trigger
effects.apply({ npc: { id: 'carlos', delta: 1 } }, GameState);

// RIGHT
effects.apply({ npc: { id: 'carlos', delta: 1 } }, GameState, getData());
```

The third parameter (`data`) is needed for NPC arc lookups and other data-dependent effects.
