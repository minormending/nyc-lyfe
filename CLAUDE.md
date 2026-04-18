# NYC: Slice of Life — Claude Code Context

This file is read automatically by Claude Code at the start of every session.
Do not delete it. Do not move it from the repo root.

---

## What This Project Is

A browser-based idle/visual novel hybrid game about surviving and thriving
in New York City. Players choose a background class and neighborhood, manage
money, energy, happiness, and clout over a 52-week game year, resolve event
cards through visual novel scenes, and build relationships with four NPCs.

Deployed as a Docker container (Caddy) behind a shared gateway on a
DigitalOcean droplet. No backend server. Built with Vite.
No framework. Vanilla JS, CSS, and JSON data files only.
Capacitor is configured for future Android/iOS builds.

---

## Specification Documents

All design decisions live in `/docs`. Read the relevant document before
making any decision it covers. Do not rely on memory of a previous session —
re-read the relevant section when in doubt.

| File | What it covers |
|---|---|
| `Technical_Architecture.docx` | Repo structure, module contracts, data schemas, localStorage, session flow, deploy |
| `VNE_Spec.docx` | Visual novel engine: layout, scene format, behavior, asset specs |
| `Asset_Manifest.docx` | Every background and portrait needed, style guide, generation prompts |
| `UI_Screens_Spec.docx` | Design system (CSS variables, typography), all non-VNE screens |
| `Content_Bible.docx` | Every event card, NPC arc scene, and flavor text line as final dialogue |

**When a spec and this file conflict, the spec wins.**

---

## Repository Structure

```
nyc-slice-of-life/
├── index.html
├── CLAUDE.md
├── package.json            ← pnpm, Vite, Capacitor
├── pnpm-lock.yaml
├── vite.config.js
├── capacitor.config.json   ← future Android/iOS builds
├── Dockerfile              ← multi-stage: Vite build → Caddy
├── Caddyfile               ← static file server for container
├── .gitignore
├── .dockerignore
├── .github/workflows/
│   ├── ci.yml              ← build on PR
│   └── deploy.yml          ← build → GHCR → droplet
├── css/
│   ├── reset.css
│   ├── main.css            ← design system lives here
│   ├── vne.css
│   └── ui.css
├── js/
│   ├── main.js             ← bootstrap only
│   ├── engine/vne.js
│   ├── game/
│   │   ├── state.js        ← single source of truth
│   │   ├── idle.js
│   │   ├── events.js
│   │   ├── effects.js
│   │   └── npcs.js
│   ├── screens/
│   │   ├── title.js
│   │   ├── creation.js
│   │   ├── digest.js
│   │   ├── inbox.js
│   │   ├── planner.js
│   │   ├── explore.js
│   │   └── ending.js
│   └── utils/
│       ├── loader.js
│       └── router.js
├── public/                 ← copied verbatim to dist/ by Vite
│   ├── data/               ← JSON only, no JS
│   │   ├── classes.json
│   │   ├── neighborhoods.json
│   │   ├── jobs.json
│   │   ├── activities.json
│   │   ├── city_cards.json
│   │   ├── opportunity_cards.json
│   │   └── npc_arcs.json
│   └── assets/
│       ├── bg/             ← 960×540 jpg, naming: [location]_[time].jpg
│       ├── portraits/      ← 320×420 png, naming: [character_id]_[expression].png
│       └── ui/
├── deploy/
│   └── nyc-lyfe/
│       └── docker-compose.yml
└── docs/
    ├── Technical_Architecture.docx
    ├── VNE_Spec.docx
    ├── Asset_Manifest.docx
    ├── UI_Screens_Spec.docx
    └── Content_Bible.docx
```

---

## Module Ownership Rules

Each module owns its DOM section. No other module touches it.

| Module | Owns |
|---|---|
| `engine/vne.js` | `#vne-container` |
| `screens/title.js` | `#screen-title` |
| `screens/creation.js` | `#screen-creation` |
| `screens/digest.js` | `#screen-digest` |
| `screens/inbox.js` | `#screen-inbox` |
| `screens/planner.js` | `#screen-planner` |
| `screens/explore.js` | `#screen-explore` |

The HUD (`#hud`) is managed by `main.js` directly.

---

## State Rules

- `game/state.js` is the single source of truth for all game state
- **No module writes directly to GameState properties**
- All mutations go through `effects.js apply(effectObject, state)`
- `state.save()` is called after every player action that mutates state
- `state.load()` returns `null` on a fresh run (no save data)

### localStorage Keys

| Key | Contents |
|---|---|
| `nyc_save` | Full serialised GameState |
| `nyc_settings` | Text speed and accessibility settings |
| `nyc_version` | Save format version string (current: `"1.0"`) |

---

## Session Flow

```
onAppOpen()
  → loader.fetchData()          fetch all /data/*.json
  → state.load()                read localStorage
  → if no save: router.go('title')
  → if save:
      idle.calculate()          compute elapsed time
      state.save()              persist idle changes
      router.go('digest')       show what happened
      → router.go('inbox')      resolve pending cards
      → router.go('planner')    plan upcoming week
      → router.go('explore')    free explore / exit
```

---

## Screen Lifecycle Contract

Every screen module exports exactly three functions:

```js
init(data)      // called once at startup — build DOM, attach listeners
show(params)    // called when navigating to screen — populate and reveal
hide()          // called when navigating away — hide, do not destroy
```

---

## VNE Scene Format (quick reference)

```js
{
  id: 'scene_id',
  background: 'location_key',       // maps to assets/bg/[key].jpg
  characters: [
    { id: 'character_id', position: 'left'|'right', expression: 'neutral' }
  ],
  dialogue: [
    { speaker: 'character_id'|'narrator', text: 'Line of dialogue.' }
  ],
  choices: [                         // optional — if absent, scene auto-ends
    { label: 'Choice text', effects: { money: -50, happiness: +5 } }
  ],
  onComplete: 'functionName'         // optional — called after scene resolves
}
```

Full spec: `VNE_Spec.docx` sections 4 and 5.

---

## Design System (quick reference)

Full spec: `UI_Screens_Spec.docx` section 2. Key values:

```css
--color-night:      #1A1A2E;   /* primary dark */
--color-accent:     #F4A623;   /* subway orange — primary actions */
--color-text-primary: #F0EAD6; /* warm off-white */
--color-money:      #4CAF50;
--color-energy:     #F4A623;
--color-happiness:  #E91E8C;
--color-clout:      #9C27B0;
--font-display:     'Courier New', monospace;
--font-body:        system-ui, sans-serif;
```

---

## Asset Fallbacks

Image assets may not be present. The game must never crash on a missing asset.

- Missing background → fill `var(--color-night)` (`#1A1A2E`)
- Missing portrait → colored circle with character's initial
  - Character accent colors: carlos=#A0522D, priya=#6090C0,
    dima=#4A7C59, jordan=#9C5A3C, player=#F4A623

---

## Hard Rules

These are non-negotiable. Do not deviate without explicit instruction.

1. **No frameworks.** No React, Vue, Svelte, or similar. Vanilla JS only.
2. **Vite is the only build tool.** No webpack, Rollup, etc.
   Use `pnpm dev` for local development, `pnpm build` for production.
3. **No TypeScript.** Plain JS with JSDoc comments where helpful.
4. **No inline styles in JS.** All styling through CSS classes.
5. **All asset paths are relative.** `./assets/bg/...` not `/assets/bg/...`
6. **All stat mutations go through effects.js.** Never write directly to state.
7. **state.save() after every mutation.**
8. **The game must not crash on missing assets.**
9. **localStorage failure shows a warning banner, not a crash.**
10. **Data files are JSON only.** No JS logic in `/public/data/`.
11. **Static assets live in `public/`.** `data/` and `assets/` are under
    `public/` so Vite copies them verbatim to `dist/`.

---

## Content Is Final

All event card dialogue, NPC arc scenes, and flavor text in `Content_Bible.docx`
are written as final copy. Do not paraphrase, shorten, or rewrite dialogue
when converting to JSON. Transcribe it exactly.

The only acceptable deviation: fixing a clear typo.

---

## When You Are Unsure

**Minor and cosmetic** (exact pixel padding, an animation curve, a z-index,
a transition duration not specified): use your judgment. Add a brief
`// assumed:` comment so it can be reviewed.

**Structural** (a module boundary, a data relationship, a screen flow edge
case, anything that would require refactoring if wrong): **stop and ask**
before proceeding. Wrong structural decisions compound quickly.

---

## Current Build Status

Update this section as phases complete.

- [x] Phase A — Foundation (state, effects, idle, events, NPCs, loader, router)
- [x] Phase B — Visual Novel Engine
- [x] Phase C — Screens (title, creation, digest, inbox, planner, explore, ending)
- [x] Phase D — HUD, settings, deploy workflow
- [x] Phase E — Vite build + Capacitor config + Docker/Caddy deploy (mirrors emblem-cards)
- [ ] Phase F — Capacitor native builds (android/ + ios/ generation)
- [ ] Assets — backgrounds and portraits (separate production pipeline)

### Mechanical systems wired:
- [x] Daily stat drains (happiness -2, clout -1, debt -3 extra)
- [x] Overnight energy regen (+20/night)
- [x] Work pay + energy drain per shift
- [x] Class abilities (Grinder 30% dmg reduction, Ladder 20% clout boost, Legacy $500 safety net)
- [x] Job promotions (accelerated by job_interview and job_promotion unlocks)
- [x] Social hangout → random NPC arc advancement
- [x] Mid-week event interrupts (every 2-3 days from city/opportunity decks)
- [x] Happiness burnout/crisis/flow thresholds
- [x] Clout gates on opportunity cards
- [x] Money gates on activities
- [x] Freelance unlock chain (Carlos website gig → freelance activities + side hustle event)
- [x] Week 52 ending with score
- [x] Stat delta floaters on activities and events
- [x] Activity flavor text toasts
- [x] Day transitions
- [x] Weekly financial recap on explore screen
