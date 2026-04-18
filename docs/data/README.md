# JSON Data Files

All game content lives in `public/data/` as JSON files. These files contain no JavaScript logic. They are fetched at startup by `utils/loader.js` and cached in memory.

This document covers the schema of each file and explains how to add new content.

---

## Table of Contents

- [Overview](#overview)
- [classes.json](#classesjson)
- [neighborhoods.json](#neighborhoodsjson)
- [jobs.json](#jobsjson)
- [activities.json](#activitiesjson)
- [city_cards.json](#city_cardsjson)
- [opportunity_cards.json](#opportunity_cardsjson)
- [npc_arcs.json](#npc_arcsjson)
- [How to Add a New Event Card](#how-to-add-a-new-event-card)
- [How to Add a New Activity](#how-to-add-a-new-activity)
- [How to Add a New NPC](#how-to-add-a-new-npc)
- [Content Bible Reference](#content-bible-reference)

---

## Overview

| File | Records | Purpose |
|------|---------|---------|
| `classes.json` | 3 | Background classes (Grinder, Ladder, Legacy) |
| `neighborhoods.json` | 3 | Neighborhoods (Astoria, Williamsburg, UES) |
| `jobs.json` | 6 | Jobs with promotion chains |
| `activities.json` | 11 | Activities for free time slots |
| `city_cards.json` | ~20 | City event cards with dialogue |
| `opportunity_cards.json` | ~10 | Opportunity cards (clout-gated) |
| `npc_arcs.json` | 4 | NPC relationship arcs with scenes |

All files are arrays of objects at the top level (`[{...}, {...}, ...]`).

---

## classes.json

Each entry defines a player background class with starting stats and special ability.

```json
{
  "id": "immigrant",
  "label": "The Grinder",
  "subtitle": "You came here with nothing but work ethic",
  "colorKey": "immigrant",
  "startingStats": {
    "money": 800,
    "energy": 85,
    "happiness": 28,
    "clout": 5
  },
  "startingJob": "delivery",
  "specialStat": "resilience",
  "specialDescription": "Negative effects hit 30% softer. The city can't break what's already been tested.",
  "unlocks": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal identifier. Used in `GameState.background` |
| `label` | string | Display name shown to the player |
| `subtitle` | string | Flavor text on the class card |
| `colorKey` | string | Maps to CSS variable `--color-[colorKey]` for accent bar |
| `startingStats` | object | Initial values for money, energy, happiness, clout |
| `startingJob` | string | ID of the starting job (references `jobs.json`) |
| `specialStat` | string | Label for the special ability |
| `specialDescription` | string | Human-readable description of the class ability |
| `unlocks` | string[] | Starting unlocks (usually empty) |

**To add a new class:** Add a new object to the array. Also add a corresponding starting job in `jobs.json`, a CSS color variable in `main.css`, and handle the new ability in `planner.js._applyClassAbility()`.

---

## neighborhoods.json

Each entry defines a neighborhood with rent, bonuses, and flavor.

```json
{
  "id": "astoria",
  "label": "Astoria",
  "borough": "Queens",
  "weeklyRent": 450,
  "vibeBonus": {
    "stat": "energy",
    "delta": 10,
    "period": "week"
  },
  "penalty": {
    "description": "Fewer networking events reach you out here",
    "flag": "reduced_clout_events"
  },
  "flavorText": "Diners that never close. Trains that sometimes don't come.",
  "neighborhoodObservations": [
    "The gyro place on Steinway is packed at 2am again.",
    "Someone left a couch on the sidewalk. It was gone by morning."
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal identifier |
| `label` | string | Display name |
| `borough` | string | NYC borough |
| `weeklyRent` | number | Rent deducted each week |
| `vibeBonus` | object | Weekly stat bonus. `stat` is which stat, `delta` is total per week |
| `penalty` | object | `description` shown to player, `flag` used in code for mechanical effects |
| `flavorText` | string | Shown on the creation card |
| `neighborhoodObservations` | string[] | Rotated weekly on the explore screen's city pulse panel |

**Penalty flags used in code:**
- `reduced_clout_events` - Clout-gaining cards weighted 0.4x in `events.js`
- `high_energy_social` - Social activities cost 10% more energy in `planner.js`
- `low_community_happiness` - Happiness gains from activities reduced 30% in `planner.js`

**To add a new neighborhood:** Add the object to the array. If the penalty flag is new, add handling in `planner.js._effectiveEnergyCost()` and `planner.js._doActivity()`.

---

## jobs.json

Each entry defines a job with pay, energy costs, and promotion path.

```json
{
  "id": "delivery",
  "label": "Delivery Runner",
  "availableTo": ["immigrant"],
  "weeklyPay": 600,
  "dailyPay": 120,
  "energyCostPerShift": 20,
  "promotionPath": "kitchen_staff",
  "promotionCondition": {
    "weeks": 12,
    "minHappiness": 15
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal identifier. Stored in `GameState.job` |
| `label` | string | Display name |
| `availableTo` | string[] | Which class IDs can start with this job |
| `weeklyPay` | number | Total weekly pay (Mon-Fri) |
| `dailyPay` | number | Pay per full work day (2 shifts). If absent: `weeklyPay / 5` |
| `energyCostPerShift` | number | Energy cost per work day (split across 2 shifts) |
| `promotionPath` | string or null | ID of the next job. Null if no promotion |
| `promotionCondition` | object or null | Requirements: `weeks` (minimum game weeks), plus `minHappiness` or `minClout` |

**Promotion chain:** Each class has a 2-job chain (starter → promotion). The promotion is checked daily in `planner.js._checkPromotion()`.

**To add a new job:** Add the object. If it's a promotion target, set the previous job's `promotionPath` to the new job's ID.

---

## activities.json

Each entry defines an activity the player can choose during free time slots.

```json
{
  "id": "go_out",
  "label": "Go Out",
  "slotCost": 1,
  "energyCost": 20,
  "effects": {
    "happiness": 18,
    "clout": 5,
    "money": -45
  },
  "effectDelay": "immediate",
  "unlockRequired": null,
  "flavorCompleted": "The city at night hits different when you're not working.",
  "flavorSkipped": "Maybe next time.",
  "isWork": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal identifier |
| `label` | string | Display name on the activity button |
| `slotCost` | number | How many time slots this takes (always 1 currently) |
| `energyCost` | number | Base energy cost (negative value = energy refund, e.g., rest is -30) |
| `effects` | object | Stat deltas: `{ money, energy, happiness, clout }`. Positive = gain, negative = cost |
| `effectDelay` | string | `"immediate"` or `"nextWeek"`. NextWeek effects are stored in `_deferredEffects` |
| `unlockRequired` | string or null | Unlock key needed to access this activity |
| `flavorCompleted` | string | Toast message shown after completing the activity |
| `flavorSkipped` | string | Toast message shown if the activity is skipped |
| `isWork` | boolean | If true, this activity is the auto-work activity (special handling) |

**To add a new activity:** Add the object to the array. It will automatically appear in the planner's activity list. If it has an `unlockRequired`, make sure that unlock is granted somewhere (event card, NPC arc, etc.).

---

## city_cards.json

City event cards are drawn every 2-3 days during active play and during idle time. Each card is a full VNE scene.

```json
{
  "id": "subway_delay",
  "deck": "city",
  "title": "Signal Problems",
  "teaser": "The MTA has opinions about your commute today.",
  "eligibility": {
    "classes": ["all"],
    "minWeek": 1,
    "requiresUnlock": null,
    "requiresRoutineActivity": null
  },
  "weight": 1.0,
  "cooldownWeeks": 4,
  "ttlDays": null,
  "oneTime": false,
  "background": "subway_platform",
  "characters": [],
  "dialogue": [
    { "speaker": "narrator", "text": "The board says 8 minutes. It has said 8 minutes for 20 minutes." },
    { "speaker": "narrator", "text": "A pigeon walks across the platform with more purpose than anyone here." }
  ],
  "choices": [
    {
      "label": "Wait it out",
      "effects": { "energy": -10 }
    },
    {
      "label": "Take a cab ($15)",
      "effects": { "money": -15 }
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier. Also used as `sceneId` in inbox items |
| `deck` | string | Always `"city"` for city cards |
| `title` | string | Displayed in inbox and event interrupt |
| `teaser` | string | Short preview text |
| `eligibility.classes` | string[] | `["all"]` or specific class IDs like `["immigrant"]` |
| `eligibility.minWeek` | number | Card cannot appear before this week |
| `eligibility.requiresUnlock` | string or null | Unlock key needed |
| `eligibility.requiresRoutineActivity` | string or null | Activity must be in current routine |
| `weight` | number | Base draw weight (1.0 = normal, higher = more likely) |
| `cooldownWeeks` | number | Weeks before this card can be drawn again |
| `ttlDays` | number or null | Days before card expires from inbox. Null = no expiry |
| `oneTime` | boolean | If true, card can only be drawn once per game |
| `background` | string | Background key → `assets/bg/[key].jpg` |
| `characters` | array | Character portraits: `[{ id, position, expression }]` |
| `dialogue` | array | Dialogue lines: `[{ speaker, text }]` |
| `choices` | array | Branching choices: `[{ label, effects }]` |

### Character Object

```json
{
  "id": "carlos",
  "position": "left",
  "expression": "neutral"
}
```

- `id` maps to portrait file: `assets/portraits/[id]_[expression].png`
- `position`: `"left"` or `"right"`
- `expression`: `"neutral"`, `"amused"`, `"concerned"`, etc.

### Dialogue Object

```json
{ "speaker": "carlos", "text": "Hey. You want coffee?" }
```

- `speaker`: character ID, or `"narrator"` for narrator text, or `"player"` for player dialogue

### Choice Object

```json
{
  "label": "Accept the deal",
  "effects": {
    "money": -200,
    "happiness": 10,
    "npc": { "id": "jordan", "delta": 2 },
    "unlock": "freelance"
  }
}
```

Effects can include any key supported by `effects.apply()` (see [docs/js/README.md](../js/README.md#the-effects-system)).

---

## opportunity_cards.json

Same format as city cards, but with `"deck": "opportunity"`. These are gated by clout (minimum 10 to draw).

Opportunity cards typically have higher-stakes effects than city cards and often feature NPCs.

---

## npc_arcs.json

Each entry defines an NPC with their relationship stages and story scenes.

```json
{
  "id": "carlos",
  "label": "Carlos",
  "role": "Bodega owner on your block",
  "accentColor": "#A0522D",
  "stages": [
    { "threshold": 0, "relationship": "stranger" },
    { "threshold": 1, "relationship": "acquaintance" },
    { "threshold": 3, "relationship": "neighbor" },
    { "threshold": 6, "relationship": "ally" }
  ],
  "scenes": [
    { "stageRequired": 1, "sceneId": "carlos_arc_1" },
    { "stageRequired": 3, "sceneId": "carlos_arc_2" },
    { "stageRequired": 6, "sceneId": "carlos_arc_3" },
    { "stageRequired": 9, "sceneId": "carlos_arc_4" }
  ],
  "arcScenes": [
    {
      "id": "carlos_arc_1",
      "background": "bodega_day",
      "characters": [
        { "id": "carlos", "position": "left", "expression": "neutral" }
      ],
      "dialogue": [
        { "speaker": "carlos", "text": "You're the new one, right? 4B?" },
        { "speaker": "player", "text": "That's me." }
      ],
      "choices": null
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | NPC identifier. Matches key in `GameState.npcs` |
| `label` | string | Display name |
| `role` | string | One-line description |
| `accentColor` | string | Hex color used for portrait placeholder circle |
| `stages` | array | Arc thresholds: `[{ threshold, relationship }]` |
| `scenes` | array | Scene trigger mapping: `[{ stageRequired, sceneId }]` |
| `arcScenes` | array | Full VNE scene objects embedded inline |

### How Stages Work

The NPC's arc score (0-10) is compared to stage thresholds:
- Arc 0 → `stranger` (threshold 0)
- Arc 1 → `acquaintance` (threshold 1)
- Arc 3 → `neighbor` (threshold 3)
- Arc 6+ → `ally` (threshold 6)

When `advanceArc()` causes the score to cross a threshold, the matching scene from `scenes[]` is triggered.

### How Scenes Work

Arc scenes are stored in the `arcScenes` array. Each scene is a standard VNE scene object (same format as event cards). The `scenes` array maps thresholds to scene IDs, and `arcScenes` contains the actual scene data.

---

## How to Add a New Event Card

1. **Write the dialogue.** All dialogue must match the Content Bible exactly. If it's a new card, write the dialogue first and get it approved.

2. **Choose eligibility.** Decide which classes can see it, what week it appears, and any unlock requirements.

3. **Add the JSON object** to `city_cards.json` or `opportunity_cards.json`:

```json
{
  "id": "your_new_card",
  "deck": "city",
  "title": "Your Card Title",
  "teaser": "A one-line preview.",
  "eligibility": {
    "classes": ["all"],
    "minWeek": 1,
    "requiresUnlock": null,
    "requiresRoutineActivity": null
  },
  "weight": 1.0,
  "cooldownWeeks": 4,
  "ttlDays": null,
  "oneTime": false,
  "background": "location_key",
  "characters": [],
  "dialogue": [
    { "speaker": "narrator", "text": "Your dialogue here." }
  ],
  "choices": [
    {
      "label": "Choice A",
      "effects": { "money": -50 }
    },
    {
      "label": "Choice B",
      "effects": { "happiness": -5 }
    }
  ]
}
```

4. **Test it.** Start a new game and play until the card appears. Check:
   - Does the VNE render correctly?
   - Are the effects applied?
   - Does the cooldown work?
   - Does it appear in the inbox if drawn during idle?

**No code changes are needed.** The event system reads from the JSON data dynamically.

---

## How to Add a New Activity

1. **Add the JSON object** to `activities.json`:

```json
{
  "id": "your_activity",
  "label": "Your Activity",
  "slotCost": 1,
  "energyCost": 15,
  "effects": { "happiness": 10 },
  "effectDelay": "immediate",
  "unlockRequired": null,
  "flavorCompleted": "That was nice.",
  "flavorSkipped": null,
  "isWork": false
}
```

2. **No code changes needed** unless:
   - The activity needs special handling (like `social_hangout` advancing NPCs)
   - The activity has a new type of effect

3. **Test it** by playing a game and checking the planner screen during a free slot.

---

## How to Add a New NPC

Adding a new NPC requires both data and code changes:

1. **Add to `npc_arcs.json`:** Add a new object with stages, scenes, and arcScenes.

2. **Update `game/state.js`:** Add the NPC to `buildDefaultState()`:
```js
npcs: {
  carlos: { arc: 0, scenesPlayed: [] },
  // ... existing NPCs ...
  your_npc: { arc: 0, scenesPlayed: [] },
}
```

3. **Update `engine/vne.js`:** Add the NPC's accent color to `CHAR_COLORS`:
```js
const CHAR_COLORS = {
  carlos: '#A0522D',
  // ... existing ...
  your_npc: '#hexcolor',
};
```

4. **Update `screens/ending.js`:** The ending screen automatically reads from `npc_arcs` data, so no changes needed if the data format is correct.

5. **Update the score formula** if you want more NPCs to affect the final score.

---

## Content Bible Reference

All dialogue in the JSON data files is transcribed exactly from `docs/Content_Bible.docx`. When editing dialogue:

- **Do not paraphrase or shorten.**
- **Do not rewrite for style.**
- **Fix only clear typos.**
- If you need new dialogue, write it in the Content Bible style and get it approved before adding to JSON.

This rule exists because the dialogue was carefully written as a cohesive narrative voice. Inconsistent rewrites break the tone.
