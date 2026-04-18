# Game Mechanics

This document explains every mechanical system in the game. Read this before changing any balance values, adding new activities, or modifying stat formulas.

---

## Table of Contents

- [The Four Stats](#the-four-stats)
- [The Weekly Loop](#the-weekly-loop)
- [Work and Income](#work-and-income)
- [Activities](#activities)
- [Daily Stat Drains](#daily-stat-drains)
- [Overnight Regen](#overnight-regen)
- [Neighborhood Effects](#neighborhood-effects)
- [Class Abilities](#class-abilities)
- [Happiness Thresholds](#happiness-thresholds)
- [Clout Gates](#clout-gates)
- [Event Cards](#event-cards)
- [NPC Relationships](#npc-relationships)
- [Job Promotions](#job-promotions)
- [Idle Progression](#idle-progression)
- [Rent](#rent)
- [Unlock System](#unlock-system)
- [Scoring and Ending](#scoring-and-ending)
- [Balance Tuning Guide](#balance-tuning-guide)

---

## The Four Stats

| Stat | Range | Decay | Purpose |
|------|-------|-------|---------|
| **Money** | No floor (can go negative) | Weekly rent | Economic survival |
| **Energy** | 0 to 100 | Work shifts | Activity gating |
| **Happiness** | 0 to 50 | -2/day | Quality of life, burnout risk |
| **Clout** | 0 to 50 | -1/day | Opportunity access |

Money is the only stat with no cap and no floor. A player can have -$500 or $10,000. Going negative triggers extra happiness drain (-3/day on top of the base -2).

Energy, happiness, and clout are clamped by `effects.js` after every mutation. You cannot have 105 energy or -3 happiness.

---

## The Weekly Loop

Each game week follows this structure:

```
WEEK START
  └── Planner: show week overview (job, rent, projected net)
       └── Player clicks "START THE WEEK"

DAY 1 (Monday)
  ├── (No overnight effects on day 1)
  ├── Check for mid-week event → if triggered, play event scene
  ├── Auto-simulate work (morning + afternoon shifts)
  └── Render evening activity choice

DAY 2-5 (Tuesday-Friday)
  ├── Apply overnight effects:
  │   ├── +20 energy (overnight regen)
  │   ├── -2 happiness (daily drain)
  │   ├── -1 clout (daily drain)
  │   ├── -3 happiness if money < 0 (debt penalty)
  │   ├── Neighborhood vibe bonus (daily fraction)
  │   └── Process deferred "nextWeek" effects (gym, running)
  ├── Day transition animation
  ├── Check for mid-week event
  ├── Auto-simulate work
  └── Render evening activity choice

DAY 6-7 (Saturday-Sunday)
  ├── Apply overnight effects (same as above)
  ├── Day transition animation
  ├── Check for mid-week event
  └── Render ALL slots as free choice (morning, afternoon, evening)

WEEK END
  ├── Deduct rent
  ├── Check job promotion eligibility
  ├── Advance week counter (GameState.week++)
  ├── Reset routine slots
  ├── Check safety net (Legacy class)
  ├── Save game
  └── Navigate:
      ├── If week >= 52 → ending screen
      ├── If inbox has pending cards → inbox screen
      └── Otherwise → explore screen
```

---

## Work and Income

Work is auto-simulated during weekday mornings and afternoons. The player has no choice about whether to work.

**Per shift (morning or afternoon):**
- Pay: `Math.floor(job.dailyPay / 2)` (or `Math.floor(job.weeklyPay / 5 / 2)` if no `dailyPay`)
- Energy drain: `Math.floor(job.energyCostPerShift / 2)`

Since there are 2 shifts per day, a full work day gives the full `dailyPay` and costs the full `energyCostPerShift`.

**Work recap:** After auto-simulating work on a weekday, the planner shows a brief summary:
```
[Job Label]  +$[earned]  -[energy] energy
```

---

## Activities

Activities are available during free time slots (weekday evenings, all weekend slots).

Each activity has:
- **Energy cost**: Subtracted immediately. Modified by happiness state and neighborhood
- **Effects**: Applied immediately or deferred to next week
- **Unlock requirement**: Some activities need an unlock key in `GameState.unlocks`
- **Flavor text**: Shown as a toast on completion

### Activity List

| ID | Label | Energy Cost | Effects | Notes |
|----|-------|------------|---------|-------|
| `rest` | Rest | -30 (refund) | +30 energy | Always available, even during crisis |
| `cook_at_home` | Cook at Home | -10 | +8 happiness, +15 money | Saves money vs going out |
| `go_out` | Go Out | -20 | +18 happiness, +5 clout, -45 money | Money gated |
| `social_hangout` | Social Hangout | -15 | +12 happiness, +3 clout | Advances random NPC +1 |
| `extra_shift` | Extra Shift | -25 | +120 money | High energy cost |
| `freelance_hustle` | Freelance Hustle | -20 | +150 money | Requires `freelance` unlock |
| `gym` | Gym | -20 | +5 energy, +5 happiness (next week) | Delayed effects |
| `running` | Running | -15 | +3 energy, +3 happiness (next week) | Delayed effects |
| `museum` | Museum | -10 | +15 happiness, +5 clout | |
| `post_content` | Post Content | -5 | +8 clout | Low cost, clout-focused |
| `explore_hood` | Explore Your Hood | -10 | +5 happiness, +3 clout | |

### Energy Cost Modifiers

The base energy cost is modified by the player's current state:

1. **Burnout (happiness < 10):** energy costs are multiplied by **1.5x** (rounded up)
2. **Flow (happiness >= 40):** energy costs are multiplied by **0.8x** (rounded down)
3. **Williamsburg penalty:** social activities (`go_out`, `social_hangout`) cost **10% more** energy (rounded up)

These stack multiplicatively. A social activity in Williamsburg during burnout costs: `base * 1.5 * 1.1`.

### Money Gating

An activity is "too expensive" if: `GameState.money + activity.effects.money < 0`. The button is grayed out with "Can't afford" text.

### Deferred Effects

Activities with `effectDelay: "nextWeek"` (gym, running) store their effects in `GameState._deferredEffects`. These are applied during the next day's overnight effects processing.

---

## Daily Stat Drains

Applied at the start of each day (except day 1 of each week):

| Drain | Amount | Condition |
|-------|--------|-----------|
| Happiness | -2 | Always |
| Clout | -1 | Always |
| Happiness (debt) | -3 extra | Only if `GameState.money < 0` |

These drains are processed through `_applyClassAbility()`, which means:
- **Grinder class:** drains are reduced by 30% → -1.4 happiness (rounds to -1), -0.7 clout (rounds to -1)
- **Ladder class:** no change to drains (only boosts clout gains)
- **Legacy class:** no change to drains

---

## Overnight Regen

Applied at the start of each day (except day 1):

- **Base energy regen:** +20 energy per night
- **Neighborhood vibe bonus:** If the neighborhood has an energy-type bonus, a daily fraction is added: `Math.floor(vibeBonus.delta / 7)`
  - Astoria: +10/week → +1/day
  - Others: bonus is clout-type, not energy

---

## Neighborhood Effects

Each neighborhood has three effects:

### Astoria (Queens)
- **Rent:** $450/week
- **Vibe bonus:** +10 energy/week (+1/day)
- **Penalty flag:** `reduced_clout_events` — cards with clout gains have their draw weight reduced to 0.4x

### Williamsburg (Brooklyn)
- **Rent:** $750/week
- **Vibe bonus:** +8 clout/week (+1/day)
- **Penalty flag:** `high_energy_social` — social activities (`go_out`, `social_hangout`) cost 10% more energy

### Upper East Side (Manhattan)
- **Rent:** $1,100/week
- **Vibe bonus:** +15 clout/week (+2/day)
- **Penalty flag:** `low_community_happiness` — happiness gains from activities reduced by 30%

---

## Class Abilities

Applied automatically by `_applyClassAbility()` in `planner.js`:

### The Grinder (`immigrant`)
All negative stat effects (energy, happiness, clout) are multiplied by **0.7** (rounded). This applies to:
- Daily stat drains
- Event card negative effects
- Activity negative effects

Does NOT apply to: money costs, rent, energy costs for activities.

### The Ladder (`middle`)
All positive clout gains are multiplied by **1.2** (rounded). This applies to:
- Activity clout gains
- Event card clout gains

### The Legacy (`rich`)
After every stat mutation sequence (activity, event, overnight), `_checkSafetyNet()` runs. If `GameState.money < 500`, the difference is topped up and logged: "Safety net: $X transferred. Family money."

---

## Happiness Thresholds

| Threshold | State | Effect |
|-----------|-------|--------|
| happiness = 0 | **Crisis** | Forced rest. No activity choice. "Your body is making the decision for you." |
| happiness < 10 | **Burnout** | All activity energy costs +50%. Warning: "Running on fumes." |
| happiness >= 40 | **Flow** | All activity energy costs -20%. Message: "Feeling good." |

These thresholds affect the planner screen's behavior:
- **Crisis:** Activity list is replaced with a single "REST" button
- **Burnout:** Activity buttons show modified energy costs with strikethrough original
- **Flow:** Activity buttons show reduced energy costs

---

## Clout Gates

| Threshold | Effect |
|-----------|--------|
| clout < 10 | Opportunity cards cannot be drawn. Warning: "No opportunities coming." |
| clout = 0 | Warning: "Nobody knows who you are. Opportunities locked." |
| clout >= 25 | Opportunity card draw weight multiplied by 1.5x |

---

## Event Cards

Events interrupt the weekly planner every 2-3 days.

### Draw Timing

A random gap is rolled: `EVENT_INTERVAL_MIN (2) + random(0, 1)` = 2 or 3 days. When `_currentDay >= _nextEventDay`, a card is drawn.

### Draw Priority

1. Try to draw from the `city` deck
2. If no eligible city card, try the `opportunity` deck
3. If no eligible card from either deck, re-roll the next event day

### Draw Mechanics

See `game/events.js` for full eligibility and weighting logic. Key points:
- Cards already in the inbox are excluded
- One-time cards already drawn are excluded
- Cards with cooldowns are excluded during the cooldown period
- Weights are modified by current stats (money pressure, clout level, happiness, neighborhood)

### Resolution Flow

```
Event interrupt shown → player clicks "SEE WHAT HAPPENED"
  → HUD hidden
  → VNE.play(card, callback)
  → Player reads dialogue, makes choice
  → callback(choiceIndex)
  → Apply effects (with class ability modifiers)
  → Check safety net
  → Record card as drawn (cooldown tracking)
  → Save
  → Continue day
```

---

## NPC Relationships

### The Four NPCs

| NPC | ID | Accent Color | Role |
|-----|----|-------------|------|
| Carlos | `carlos` | #A0522D (sienna) | Bodega owner |
| Priya | `priya` | #6090C0 (steel blue) | Coworker |
| Dima | `dima` | #4A7C59 (forest green) | Upstairs neighbor |
| Jordan | `jordan` | #9C5A3C (copper) | The broke friend |

### Arc Stages

Each NPC has 4 stages with increasing thresholds:

| Stage | Relationship | Typical Threshold |
|-------|-------------|-------------------|
| 1 | Stranger | 0 |
| 2 | Acquaintance | 1 |
| 3 | Neighbor | 3 |
| 4 | Ally | 6-9 |

When the arc score crosses a threshold, the corresponding scene is queued in the inbox and plays through the VNE.

### How Arcs Advance

1. **Social hangout activity:** Each hangout advances **one random NPC** by +1
2. **Event card effects:** Some card choices include `{ npc: { id: 'carlos', delta: 1 } }`
3. **NPC arc scene choices:** Some arc scenes have choices that affect the relationship

### Score at Game End

Each NPC at `ally` status = **+10 points** to the final score (max +40 from all 4).

---

## Job Promotions

Each class starts with a different job, and each job has one promotion:

| Class | Starting Job | Promotion | Weekly Pay Change |
|-------|-------------|-----------|-------------------|
| Grinder | Delivery | Kitchen Staff | Varies by data |
| Ladder | Office Clerk | Junior Manager | Varies by data |
| Legacy | Gallery Assistant | Gallery Manager | Varies by data |

### Promotion Conditions

Each job has a `promotionCondition` with:
- `weeks`: Minimum weeks played before eligible
- `minHappiness` or `minClout`: Stat threshold

### Unlock Accelerators

Two unlocks affect promotion timing:
- `job_interview`: Reduces weeks requirement by 3
- `job_promotion`: Reduces weeks requirement by 5 AND bypasses the clout check (from Priya's arc)

Promotions are checked at the start of each day during overnight processing in `planner.js`.

---

## Idle Progression

When the player returns to the game after being away, `idle.js` calculates what happened:

### What Accumulates

| Effect | Formula | Cap |
|--------|---------|-----|
| Time passed | Real elapsed hours → game days | 14 days max |
| Income | `job.weeklyPay / 7 * gameDays` | None |
| Energy | `(20 + neighborhoodBonus/7) * gameDays` | 100 max |
| New cards | 1-3 city cards, spaced 2-3 hours apart | 3 per session |

### What Is Deducted

| Effect | Formula | Condition |
|--------|---------|-----------|
| Rent | `weeklyRent * fullWeeksAway` | Only for full real-world weeks |
| Pending debuffs | Processed per-week | From `_pendingEffects` |

### What Expires

Inbox cards with a `ttlDays` value expire if `(now - arrivedAt) > ttlDays * 86400000`.

---

## Rent

Rent is deducted in two contexts:

1. **Active play:** Deducted at the end of each 7-day week in `planner.js._finishWeek()`
2. **Idle:** Deducted for each full real-world week the player was away

The rent amount is: `neighborhood.weeklyRent + GameState._pendingRentDelta`

`_pendingRentDelta` is a permanent increase applied by certain event cards (e.g., the rent increase event). It persists for the rest of the game.

---

## Unlock System

Unlocks are string keys stored in `GameState.unlocks[]`. They gate:

- **Activities:** e.g., `freelance` unlocks the Freelance Hustle activity
- **Event cards:** e.g., `requiresUnlock: 'carlos_website'` on certain cards
- **Job promotions:** `job_interview` and `job_promotion` accelerate promotion timing

Unlocks are added via the effects system: `{ unlock: 'freelance' }`.

### Known Unlock Keys

| Key | Source | What It Enables |
|-----|--------|----------------|
| `freelance` | Carlos website gig event | Freelance Hustle activity |
| `job_interview` | City card (Job Interview) | Faster promotion (-3 weeks) |
| `job_promotion` | Priya NPC arc | Faster promotion (-5 weeks) + bypass clout check |
| `carlos_website` | Carlos NPC arc | Triggers freelance opportunity card |

---

## Scoring and Ending

The game ends when `GameState.week >= 52`. The ending screen shows a composite score:

### Score Formula

```
score = 0

// Money contribution (up to 30 points)
score += min(30, floor(GameState.money / 200))

// Happiness (up to 50 points)
score += GameState.happiness

// Clout (up to 25 points)
score += floor(GameState.clout / 2)

// NPC allies (up to 40 points)
for each NPC with relationship === 'ally':
  score += 10

// Final clamp
score = clamp(score, 0, 100)
```

### Verdict Tiers

| Score Range | Verdict |
|-------------|---------|
| 80-100 | "You didn't just survive -- you made a life here. The city noticed." |
| 60-79 | "It wasn't easy. But you're still standing, and the city respects that." |
| 40-59 | "Some weeks were good. Some were hard. You kept going. That counts." |
| 20-39 | "It's been a rough year. But you're still here. That's not nothing." |
| 0-19 | "The city chewed you up. But you didn't leave. There's next year." |

---

## Balance Tuning Guide

If you need to adjust game balance, here are the key levers and where to find them:

| What to Tune | Where | File |
|-------------|-------|------|
| Starting stats per class | `startingStats` object | `public/data/classes.json` |
| Weekly rent per neighborhood | `weeklyRent` field | `public/data/neighborhoods.json` |
| Job pay and energy costs | `weeklyPay`, `energyCostPerShift` | `public/data/jobs.json` |
| Activity effects and costs | `energyCost`, `effects` | `public/data/activities.json` |
| Event card effects | `choices[].effects` | `public/data/city_cards.json`, `opportunity_cards.json` |
| Daily happiness drain | `DAILY_HAPPINESS_DRAIN` constant | `js/screens/planner.js` |
| Daily clout drain | `DAILY_CLOUT_DRAIN` constant | `js/screens/planner.js` |
| Debt happiness penalty | `DEBT_HAPPINESS_DRAIN` constant | `js/screens/planner.js` |
| Overnight energy regen | `OVERNIGHT_ENERGY_REGEN` constant | `js/screens/planner.js` |
| Burnout threshold | `BURNOUT_THRESHOLD` constant | `js/screens/planner.js` |
| Flow threshold | `FLOW_THRESHOLD` constant | `js/screens/planner.js` |
| Grinder damage reduction | `0.7` multiplier in `_applyClassAbility` | `js/screens/planner.js` |
| Ladder clout boost | `1.2` multiplier in `_applyClassAbility` | `js/screens/planner.js` |
| Legacy safety net floor | `500` in `_checkSafetyNet` | `js/screens/planner.js` |
| Event frequency | `EVENT_INTERVAL_MIN/MAX` constants | `js/screens/planner.js` |
| Idle card frequency | `CARD_INTERVAL_MIN/MAX`, `MAX_CARDS_PER_SESSION` | `js/game/idle.js` |
| Idle time cap | `MAX_IDLE_DAYS` constant | `js/game/idle.js` |
| Score formula | `_render()` function | `js/screens/ending.js` |
| Stat ranges (energy, happiness, clout) | `STAT_RANGES` constant | `js/game/effects.js` |
