# Screens

This document explains how the screen system works, what each screen does, and how navigation flows between them.

---

## Table of Contents

- [Screen Lifecycle](#screen-lifecycle)
- [Navigation Flow](#navigation-flow)
- [Screen Reference](#screen-reference)
  - [Title Screen](#title-screen)
  - [Creation Screen](#creation-screen)
  - [Digest Screen](#digest-screen)
  - [Inbox Screen](#inbox-screen)
  - [Planner Screen](#planner-screen)
  - [Explore Screen](#explore-screen)
  - [Ending Screen](#ending-screen)
- [HUD Management](#hud-management)
- [Adding a New Screen](#adding-a-new-screen)

---

## Screen Lifecycle

Every screen module exports exactly three functions:

```js
export function init(data) {
  // Called ONCE at app startup
  // - Get a reference to the screen's DOM element
  // - Build any static DOM structure
  // - Attach event listeners that don't change
  // The `data` parameter contains all loaded JSON game data
}

export function show(params) {
  // Called each time the screen becomes active
  // - Add the 'active' CSS class to make the screen visible
  // - Populate dynamic content (stats, lists, etc.)
  // - The `params` object contains data from the previous screen
}

export function hide() {
  // Called when navigating AWAY from this screen
  // - Remove the 'active' CSS class
  // - Do NOT destroy the DOM — the screen will be shown again
}
```

### The `active` Class

Screens are toggled using the CSS class `active`. In `css/ui.css`:

```css
.screen {
  display: none;
}
.screen.active {
  display: flex;  /* or block, depending on screen */
}
```

### DOM Ownership

Each screen owns a specific DOM element declared in `index.html`:

```html
<div id="screen-title" class="screen"></div>
<div id="screen-creation" class="screen"></div>
<div id="screen-digest" class="screen"></div>
<div id="screen-inbox" class="screen"></div>
<div id="screen-planner" class="screen"></div>
<div id="screen-explore" class="screen"></div>
<div id="screen-ending" class="screen"></div>
```

**Rule:** A screen module must ONLY modify its own DOM element. It must never reach into another screen's element or the VNE container.

---

## Navigation Flow

The router (`utils/router.js`) manages all navigation. Here is the complete flow:

```
                            ┌────────────┐
                    ┌──────▶│   TITLE    │◀─────────────────┐
                    │       └─────┬──────┘                  │
                    │             │ "NEW GAME"              │ "PLAY AGAIN"
                    │             ▼                         │
                    │       ┌────────────┐                  │
                    │       │  CREATION  │                  │
                    │       └─────┬──────┘                  │
                    │             │ plays intro VNE scene   │
                    │             ▼                         │
              "SAVE │       ┌────────────┐           ┌─────┴──────┐
              & QUIT│  ┌───▶│  PLANNER   │──week 52─▶│   ENDING   │
                    │  │    └─────┬──────┘           └────────────┘
                    │  │          │ week done
                    │  │          ▼
                    │  │    ┌────────────┐
                    │  │    │   INBOX    │ (only if pending cards)
                    │  │    └─────┬──────┘
                    │  │          │ all resolved
                    │  │          ▼
                    │  │    ┌────────────┐
                    │  └────│  EXPLORE   │
                    │       └─────┬──────┘
                    │             │
                    └─────────────┘

RETURNING PLAYER (has save data):
  idle.calculate() → DIGEST → INBOX (if cards) → EXPLORE
  OR (nothing happened): → EXPLORE directly
```

### Navigation in Code

```js
import * as router from '../utils/router.js';

// Navigate to a screen
router.go('explore');

// Navigate with parameters
router.go('inbox', { nextScreen: 'explore' });
router.go('explore', { weekSummary: { startMoney: 1000, endMoney: 800 } });
router.go('digest', { summary: idleSummary });
```

---

## Screen Reference

### Title Screen

**File:** `js/screens/title.js`
**DOM:** `#screen-title`
**HUD:** Hidden

**Purpose:** Entry point. Shows game title, random NYC flavor quote, and action buttons.

**Buttons:**
- **CONTINUE** - Only shown if a save exists. Goes to the returning player flow
- **NEW GAME** - Goes to creation screen
- **HOW TO PLAY** - Opens the coach codex modal

**Details:**
- Random flavor text from 6 NYC-themed quotes, displayed with a typewriter feel
- Shows version number at the bottom
- Checks for save data on every `show()` to decide whether to show CONTINUE

---

### Creation Screen

**File:** `js/screens/creation.js`
**DOM:** `#screen-creation`
**HUD:** Hidden

**Purpose:** Two-step character creation flow.

**Step 1: Choose Background Class**
- Shows 3 class cards: Grinder, Ladder, Legacy
- Each card has a colored accent bar, starting stats as bar charts, and special ability description
- Clicking a card selects it (highlight + dim others)
- CONTINUE button appears after selection

**Step 2: Choose Neighborhood**
- Shows 3 neighborhood cards: Astoria, Williamsburg, Upper East Side
- Each card shows rent, vibe bonus, penalty description, and flavor text
- BEGIN YOUR STORY button appears after selection

**After both selections:**
1. `buildDefaultState()` creates a fresh GameState
2. `setState()` and `save()` persist it
3. An intro VNE scene plays (narrator monologue about arriving in NYC)
4. On scene completion, navigates to `planner`

**Coach tips:** Triggers `creation_class` on step 1, `creation_hood` on step 2.

---

### Digest Screen

**File:** `js/screens/digest.js`
**DOM:** `#screen-digest`
**HUD:** Visible

**Purpose:** Shows what happened while the player was away (idle summary).

**Receives:** `{ summary: idleSummary }` from `main.js` boot sequence.

**Summary cards shown:**
- Days elapsed
- Income earned (if any)
- Rent paid (if full weeks passed)
- Energy gained
- New cards arrived
- Expired cards
- Happiness warning (if happiness < 10)
- Log entries with flavor text

**Exit button:** Goes to `inbox` if pending cards exist, otherwise to `explore`.

---

### Inbox Screen

**File:** `js/screens/inbox.js`
**DOM:** `#screen-inbox`
**HUD:** Visible

**Purpose:** List of pending event cards that must be resolved before planning the next week.

**Receives:** `{ nextScreen: 'planner' | 'explore' }` - where to go after inbox is empty.

**Card display:**
- Deck badge: "CITY EVENT" (blue) or "OPPORTUNITY" (gold)
- Card title and teaser text
- TTL countdown: "EXPIRES IN 2 DAYS" (for cards with `ttlDays`)
- RESOLVE button

**Resolution flow:**
1. Player clicks RESOLVE
2. HUD is hidden
3. VNE plays the card's scene
4. Player makes a choice (or scene auto-completes)
5. Effects are applied via `effects.apply()`
6. Card is recorded as drawn (cooldown tracking)
7. Card is removed from `GameState.inbox`
8. Save
9. HUD restored
10. Inbox re-renders (if more cards remain)
11. If all resolved: shows "All clear" and a button to `nextScreen`

**Searches for scene data in this order:**
1. Event cards (`events.findCard()` - checks both city and opportunity decks)
2. NPC arc scenes (`npcs.findArcScene()`)
3. If not found: card is silently removed from inbox

---

### Planner Screen

**File:** `js/screens/planner.js`
**DOM:** `#screen-planner`
**HUD:** Visible

**Purpose:** The core gameplay screen. Simulates a 7-day work week with activity choices.

This is the most complex screen in the game. It manages:
- Week overview (job, rent, projected income)
- Day-by-day simulation (auto-work, overnight effects, stat drains)
- Activity selection for free time slots
- Mid-week event interrupts
- Burnout/crisis states
- NPC social hangout advancement
- Job promotion checks
- Rent deduction
- Week advancement

**Week overview** (shown first):
- Job title and weekly pay
- Rent amount
- Work energy cost per day
- Overnight regen rate
- Projected net income
- Current stat values
- Warning messages (burnout, debt, low clout)

**Day flow:**

```
START DAY
  ├── Day 2+: apply overnight effects
  │   ├── +20 energy
  │   ├── -2 happiness, -1 clout
  │   ├── -3 happiness if in debt
  │   ├── Neighborhood vibe bonus
  │   ├── Deferred effects (gym, running)
  │   ├── Check safety net (Legacy)
  │   └── Check promotion
  │
  ├── Day transition animation (500ms name, 300ms fade)
  │
  ├── Check for mid-week event
  │   └── If triggered: show interrupt → play VNE → continue
  │
  ├── Weekday (Mon-Fri):
  │   ├── Auto-simulate morning + afternoon work
  │   ├── Show work recap (earned, energy used)
  │   └── Render evening activity choice
  │
  └── Weekend (Sat-Sun):
      └── Render all 3 slots as free activity choices
```

**Activity choice rendering:**
- Lists all available activities with energy costs and effect previews
- Grayed out if: locked (needs unlock), too expensive (money), not enough energy
- Modified energy costs shown with strikethrough (burnout/flow)
- "DO NOTHING" skip button
- "SKIP TO NEXT DAY" button

**Special states:**
- **Crisis (happiness = 0):** Only REST button shown, no activity choice
- **Burnout (happiness < 10):** Warning banner, 50% energy cost increase
- **Flow (happiness >= 40):** Positive banner, 20% energy cost reduction

**Social hangout special handling:** When the player picks Social Hangout, `_advanceRandomNpc()` picks a random NPC and advances their arc by 1. If a scene threshold is crossed, it's queued in the inbox.

**End of week:**
1. Deduct rent
2. `GameState.week++` (capped at 52)
3. Reset routine slots
4. Check safety net
5. Save
6. Navigate: ending (week 52), inbox (pending cards), or explore

**Coach tips:** `planner_overview` (first time), `planner_evening`, `planner_weekend`, `event_interrupt`

---

### Explore Screen

**File:** `js/screens/explore.js`
**DOM:** `#screen-explore`
**HUD:** Visible

**Purpose:** End-of-week hub. Review your progress, check NPC relationships, read city flavor.

**Receives:** `{ weekSummary: { startMoney, endMoney } }` (optional).

**Panels:**

1. **Week Summary** (only if weekSummary provided)
   - Start money, end money, net change
   - Full-width card spanning the grid

2. **Your People** (NPC panel)
   - 4 NPCs with colored avatar circles, name, role, relationship badge
   - Badge colors: stranger (gray), acquaintance (blue), neighbor (green), ally (gold)
   - Hint text: "Next: neighbor (stage 3)"
   - Click NPC → modal with full arc history

3. **Your Story** (progress panel)
   - Week X of 52 progress bar
   - Current job and pay
   - Current neighborhood and rent
   - Current savings
   - Last 5 log entries

4. **The City** (pulse panel)
   - Season (based on week number)
   - Weather flavor text (rotating)
   - Neighborhood observation (from JSON data, rotating)
   - Random headline (from 20 NYC headlines)
   - Contextual strategy tip

**NPC Modal:**
- Opened by clicking an NPC row
- Shows: name, role, arc score, relationship badge
- Lists all arc scenes (played = name shown, unplayed = "??? (stage X)")
- Closed by X button or backdrop click

**Footer buttons:**
- **NEXT WEEK** → navigate to `planner`
- **SAVE & QUIT** → save, hide HUD, navigate to `title`

**Coach tip:** `explore_intro` (first time)

---

### Ending Screen

**File:** `js/screens/ending.js`
**DOM:** `#screen-ending`
**HUD:** Hidden

**Purpose:** Year-end summary. Shows how the 52-week year went.

**Displays:**
- Title: "ONE YEAR IN NEW YORK"
- Verdict text (based on score tier)
- Stats grid: final savings, job, neighborhood, happiness, clout, ally count
- NPC relationship list with badges
- Score: X / 100

**Score calculation:**
```
money:     min(30, floor(money / 200))
happiness: direct value (0-50)
clout:     floor(clout / 2) → 0-25
allies:    10 per ally NPC → 0-40
           ────────────────
total:     clamped to 0-100
```

**PLAY AGAIN button:** Calls `state.reset()` and navigates to `title`.

---

## HUD Management

The HUD (`#hud`) is managed by `main.js`, not by any screen module.

**HUD visibility rules:**
- Hidden on: title, creation, ending, VNE scenes
- Visible on: digest, inbox, planner, explore

**Screens toggle HUD visibility themselves** using:
```js
document.getElementById('hud').classList.remove('hud--hidden');
document.body.classList.add('hud-visible');
```

The `hud-visible` class on `<body>` adjusts `min-height` calculations so screens account for HUD height.

**HUD update loop:** `main.js` runs `_updateHUD()` every 2 seconds to sync stat bars with current `GameState`.

**HUD elements:**
- Left: week number, neighborhood label
- Center: 4 stat bars (money, energy, happiness, clout)
- Right: help button (?), settings gear

---

## Adding a New Screen

1. **Add the DOM element** to `index.html`:
```html
<div id="screen-yourscreen" class="screen"></div>
```

2. **Create the module** at `js/screens/yourscreen.js`:
```js
let _el = null;

export function init(data) {
  _el = document.getElementById('screen-yourscreen');
}

export function show(params = {}) {
  _el.classList.add('active');
  // Show HUD if needed:
  document.getElementById('hud').classList.remove('hud--hidden');
  document.body.classList.add('hud-visible');
  // Render content...
}

export function hide() {
  _el.classList.remove('active');
}
```

3. **Register in `main.js`**:
```js
import * as yourScreen from './screens/yourscreen.js';
router.register('yourscreen', yourScreen);
```

4. **Add CSS** to `css/ui.css`:
```css
/* yourscreen */
#screen-yourscreen.active {
  display: flex;
  flex-direction: column;
}
```

5. **Add navigation** from another screen:
```js
router.go('yourscreen', { someParam: value });
```
