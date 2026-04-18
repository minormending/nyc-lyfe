# NYC: Slice of Life

A browser-based idle/visual novel hybrid game about surviving and thriving in New York City. Players choose a background class and neighborhood, manage money, energy, happiness, and clout over a 52-week game year, resolve event cards through visual novel scenes, and build relationships with four NPCs.

---

## Quick Start

```bash
# Prerequisites: Node.js 22+, pnpm 9.12.3+
pnpm install
pnpm dev          # starts Vite dev server on http://localhost:5173
```

Open your browser to the URL shown in the terminal. The game runs entirely in the browser with no backend.

### Other Commands

```bash
pnpm build        # production build -> dist/
pnpm preview      # preview the production build locally
```

---

## Tech Stack

| Layer       | Technology                      |
|-------------|---------------------------------|
| Language    | Vanilla JavaScript (ES Modules) |
| Build       | Vite 6                          |
| Styling     | Plain CSS (no preprocessor)     |
| Data        | Static JSON files               |
| Persistence | localStorage                    |
| Deploy      | Docker (Caddy) on DigitalOcean  |
| Native      | Capacitor 7 (future Android/iOS)|

**No frameworks.** No React, Vue, Svelte, or TypeScript. This is intentional and non-negotiable. See CLAUDE.md "Hard Rules" for the full list.

---

## Project Structure

```
nyc-slice-of-life/
├── index.html              <- single HTML file (all screens, HUD, modals)
├── CLAUDE.md               <- AI assistant context (also good human reference)
├── package.json
├── vite.config.js
├── Dockerfile / Caddyfile  <- deployment
│
├── css/                    <- all styles
│   ├── reset.css
│   ├── main.css            <- design system + base
│   ├── vne.css             <- visual novel engine
│   └── ui.css              <- HUD, screens, modals
│
├── js/                     <- all game code
│   ├── main.js             <- bootstrap only
│   ├── engine/vne.js       <- visual novel engine
│   ├── game/               <- core systems (state, effects, events, idle, npcs, coach)
│   ├── screens/            <- UI screens (title, creation, digest, inbox, planner, explore, ending)
│   └── utils/              <- loader, router
│
├── public/                 <- static assets (copied to dist/ by Vite)
│   ├── data/               <- JSON game data
│   └── assets/             <- images (bg/, portraits/, ui/)
│
├── deploy/                 <- docker-compose for production
├── .github/workflows/      <- CI + deploy pipelines
└── docs/                   <- design spec documents (.docx) + developer READMEs
```

---

## Developer Documentation

This project has multiple detailed README files organized by area. **Start here**, then dive into the one relevant to your task:

| Document | What it covers |
|----------|---------------|
| [docs/js/README.md](docs/js/README.md) | JavaScript architecture, module contracts, data flow, state management |
| [docs/game-mechanics/README.md](docs/game-mechanics/README.md) | Game mechanics, stat systems, class abilities, scoring |
| [docs/data/README.md](docs/data/README.md) | JSON data file schemas, how to add new cards/activities/NPCs |
| [docs/screens/README.md](docs/screens/README.md) | Screen lifecycle, each screen's purpose, navigation flow |
| [docs/vne/README.md](docs/vne/README.md) | Visual novel engine, scene format, dialogue/choices system |
| [docs/css/README.md](docs/css/README.md) | Design system, CSS variables, component classes |
| [docs/deploy/README.md](docs/deploy/README.md) | Build process, Docker, CI/CD, deployment to DigitalOcean |

---

## How to Play (Quick Summary)

1. **Create a character** - Choose a background class (Grinder, Ladder, or Legacy) and a neighborhood (Astoria, Williamsburg, or Upper East Side)
2. **Plan your week** - Work happens automatically Mon-Fri. Choose activities for free time slots (evenings, weekends)
3. **Respond to events** - Every 2-3 days the city throws something at you. Read the scene, make a choice
4. **Build relationships** - Social hangouts advance random NPC arcs. Each NPC has a 4-stage storyline
5. **Survive 52 weeks** - Manage your stats, avoid burnout, earn a final score

---

## Three Key Concepts

### 1. Module Ownership

Each module owns a specific DOM element. No other module touches it. For example, `engine/vne.js` owns `#vne-container` and `screens/planner.js` owns `#screen-planner`. If you need to change how something renders, find the module that owns that DOM section.

### 2. State is Sacred

All game state lives in `game/state.js` as a single object (`GameState`). You never write to it directly. Instead, you create an effect object and pass it through `effects.apply()`, which returns a **new** state object. Then call `setState()` and `save()`.

```js
// WRONG - never do this
GameState.money += 100;

// RIGHT - always go through effects
const newState = effects.apply({ money: 100 }, GameState, data);
setState(newState);
save();
```

### 3. Screen Lifecycle

Every screen module exports exactly three functions:

- `init(data)` - Called once at startup. Build DOM, attach listeners
- `show(params)` - Called when navigating to the screen. Populate and reveal
- `hide()` - Called when navigating away. Hide, do not destroy

---

## Design Spec Documents

The `docs/` folder contains `.docx` specification documents that are the source of truth for all design decisions:

| File | Covers |
|------|--------|
| `Technical_Architecture.docx` | Repo structure, module contracts, data schemas, deploy |
| `VNE_Spec.docx` | Visual novel engine layout, scene format, behavior |
| `Asset_Manifest.docx` | Background and portrait specs, style guide |
| `UI_Screens_Spec.docx` | Design system, all non-VNE screens |
| `Content_Bible.docx` | All dialogue, event text, NPC arcs (final copy) |

**When a spec and code conflict, the spec wins.** Read the relevant spec before making structural changes.
