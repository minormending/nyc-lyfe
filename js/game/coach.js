/**
 * game/coach.js
 * Contextual tutorial system and codex reference.
 * Shows tips at key moments during a player's first playthrough.
 * Tracks seen tips via localStorage so each appears only once.
 */

const LS_KEY = 'nyc_coach';

// ---------------------------------------------------------------------------
// Tip definitions
// ---------------------------------------------------------------------------

const TIPS = {
  creation_class: {
    title: 'Choosing Your Background',
    body: [
      'Your background determines your starting stats \u2014 money, energy, happiness, and clout \u2014 plus a unique ability that lasts all year.',
      'The Grinder shrugs off bad luck (negative events hit 30% softer). The Ladder climbs the social scene faster (clout gains +20%). The Legacy has family money (balance never drops below $500).',
      'There\u2019s no wrong choice \u2014 just different play styles.',
    ],
    step: [1, 2],
  },
  creation_hood: {
    title: 'Picking a Neighborhood',
    body: [
      'Rent is your biggest weekly expense. Cheaper rent means more breathing room, but pricier neighborhoods give better stat bonuses.',
      'Every neighborhood also has a hidden drawback. Read the penalty text on each card before choosing.',
      'Astoria is forgiving. Williamsburg rewards the social. The Upper East Side is high\u2011risk, high\u2011reward.',
    ],
    step: [2, 2],
  },
  planner_overview: {
    title: 'Your Week Ahead',
    body: [
      'This is your weekly budget. Your job pays you automatically for working Monday through Friday. Rent is deducted every Sunday.',
      'The \u201cprojected net\u201d shows whether you\u2019ll gain or lose money this week \u2014 before any activities or events.',
      'Press \u201cStart the Week\u201d when you\u2019re ready.',
    ],
    next: 'planner_hud',
  },
  planner_hud: {
    title: 'The Status Bar',
    body: [
      'The four bars at the top of the screen are your lifeline:',
      '$ Money \u2014 pays rent and funds activities. Go negative and debt drains your happiness faster.',
      'Energy \u2014 spent on activities, recharges overnight (+20). Run out and your options vanish.',
      'Happy \u2014 drains every single day. Below 10 = burnout (everything costs more). Zero = crisis.',
      'Clout \u2014 your reputation. Reach 10+ to unlock opportunity events.',
    ],
  },
  planner_evening: {
    title: 'Your Free Time',
    body: [
      'Each free time slot lets you pick one activity. Every activity costs energy and gives different rewards.',
      'Cooking is cheap and cheerful. Going out builds clout but costs money. Rest is always free. Social hangouts advance NPC relationships.',
      'Watch the colored numbers on each button \u2014 they show exactly what you\u2019ll gain and lose.',
    ],
  },
  planner_weekend: {
    title: 'The Weekend',
    body: [
      'No work today \u2014 all three time slots are yours.',
      'Weekends are the best time to recover energy, build relationships, or earn extra cash with an extra shift.',
      'Plan carefully: weekday evenings only give you one free slot per day.',
    ],
  },
  event_interrupt: {
    title: 'Something Happened',
    body: [
      'Every few days, the city interrupts your routine with an event. You\u2019ll play a short scene and make a choice.',
      'Each option shows stat previews \u2014 green numbers are gains, red are costs. There are no free answers.',
      'Some events unlock new activities or advance NPC storylines.',
    ],
  },
  inbox_intro: {
    title: 'Your Inbox',
    body: [
      'Events you haven\u2019t resolved pile up here. Each one has a time limit \u2014 expired events can hurt.',
      'Clear everything before planning your next week. The city doesn\u2019t wait.',
    ],
  },
  explore_intro: {
    title: 'End of Week',
    body: [
      'This is your weekly checkpoint. See how your money changed, check on relationships, and read the city pulse.',
      'Click any character in \u201cYour People\u201d to see their full relationship history.',
      'When ready, press \u201cNext Week\u201d to continue \u2014 or \u201cSave & Quit\u201d to take a break.',
    ],
    next: 'explore_npcs',
  },
  explore_npcs: {
    title: 'Your People',
    body: [
      'Four New Yorkers can become part of your story. Choose \u201cSocial Hangout\u201d during free time to randomly advance one relationship.',
      'Relationships progress: Stranger \u2192 Acquaintance \u2192 Neighbor \u2192 Ally. Each stage unlocks a new story scene.',
      'At year\u2019s end, each Ally adds +10 to your final score.',
    ],
  },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _seen = new Set();
let _active = null;

let _overlayEl = null;
let _titleEl = null;
let _bodyEl = null;
let _stepEl = null;
let _dismissBtn = null;
let _codexEl = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function init() {
  _loadSeen();

  _overlayEl = document.getElementById('coach-overlay');
  _titleEl = document.getElementById('coach-title');
  _bodyEl = document.getElementById('coach-body');
  _stepEl = document.getElementById('coach-step');
  _dismissBtn = document.getElementById('coach-dismiss');
  _codexEl = document.getElementById('codex-modal');

  if (_dismissBtn) {
    _dismissBtn.addEventListener('click', dismiss);
  }

  if (_overlayEl) {
    _overlayEl.addEventListener('click', (e) => {
      if (e.target === _overlayEl) dismiss();
    });
  }

  if (_codexEl) {
    _buildCodex();
  }
}

/**
 * Shows a tip if the player hasn't seen it yet.
 * No-op if already seen or if the tip ID doesn't exist.
 */
export function trigger(tipId) {
  if (_seen.has(tipId)) return;
  const tip = TIPS[tipId];
  if (!tip) return;

  if (_active) dismissSilent();

  _active = tipId;
  _seen.add(tipId);
  _saveSeen();

  _titleEl.textContent = tip.title;

  _bodyEl.innerHTML = '';
  for (const para of tip.body) {
    const p = document.createElement('p');
    p.className = 'coach-overlay__para';
    p.textContent = para;
    _bodyEl.appendChild(p);
  }

  if (tip.step) {
    _stepEl.textContent = `${tip.step[0]} / ${tip.step[1]}`;
    _stepEl.classList.remove('coach-overlay__step--hidden');
  } else {
    _stepEl.textContent = '';
    _stepEl.classList.add('coach-overlay__step--hidden');
  }

  _overlayEl.classList.remove('coach-overlay--hidden');
}

/**
 * Dismiss the current tip. If it has a `next`, auto-trigger that tip after a delay.
 */
export function dismiss() {
  if (!_active) return;
  const tip = TIPS[_active];
  const nextId = tip?.next;
  _active = null;
  _overlayEl.classList.add('coach-overlay--hidden');

  if (nextId && !_seen.has(nextId)) {
    setTimeout(() => trigger(nextId), 350);
  }
}

/**
 * Dismiss without triggering any chained tip. Used on navigation.
 */
export function dismissSilent() {
  _active = null;
  if (_overlayEl) _overlayEl.classList.add('coach-overlay--hidden');
}

export function isActive() {
  return _active !== null;
}

/**
 * Clear all seen tips. Called on game reset so a fresh playthrough gets onboarding again.
 */
export function reset() {
  _seen.clear();
  _saveSeen();
  _active = null;
  if (_overlayEl) _overlayEl.classList.add('coach-overlay--hidden');
}

export function openCodex() {
  if (_codexEl) _codexEl.classList.remove('codex-modal--hidden');
}

export function closeCodex() {
  if (_codexEl) _codexEl.classList.add('codex-modal--hidden');
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function _loadSeen() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) _seen = new Set(JSON.parse(raw));
  } catch (_) { /* storage unavailable */ }
}

function _saveSeen() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([..._seen]));
  } catch (_) { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

function _buildCodex() {
  const panel = _codexEl.querySelector('.codex-modal__panel') || _codexEl;

  panel.innerHTML = `
    <button class="codex-modal__close" id="codex-close" aria-label="Close">\u2715</button>
    <h2 class="codex-modal__title">HOW TO PLAY</h2>
    <div class="codex-modal__content">

      <div class="codex-section">
        <h3 class="codex-section__title">The Basics</h3>
        <p>You have <strong>52 weeks</strong> to build a life in New York City. Each week, you work your job, choose how to spend your free time, and deal with whatever the city throws at you.</p>
        <p>Your goal: survive the year with your savings, happiness, reputation, and relationships intact. There\u2019s no single \u201cright\u201d way to play \u2014 just trade\u2011offs.</p>
      </div>

      <div class="codex-section">
        <h3 class="codex-section__title">Your Stats</h3>
        <div class="codex-stat">
          <span class="codex-stat__name codex-stat__name--money">$ Money</span>
          <span class="codex-stat__desc">Earned from work and side gigs. Rent is due every Sunday. If money goes negative, you\u2019re in debt \u2014 happiness drains 3 extra points per day.</span>
        </div>
        <div class="codex-stat">
          <span class="codex-stat__name codex-stat__name--energy">Energy (0\u2013100)</span>
          <span class="codex-stat__desc">Spent on activities. Regenerates +20 each night, plus your neighborhood bonus. At zero, you can only rest.</span>
        </div>
        <div class="codex-stat">
          <span class="codex-stat__name codex-stat__name--happiness">Happiness (0\u201350)</span>
          <span class="codex-stat__desc">Drains 2 points every day. Below 10: burnout (activities cost 50% more energy). At zero: crisis (forced rest only). Above 40: flow state (activities cost 20% less).</span>
        </div>
        <div class="codex-stat">
          <span class="codex-stat__name codex-stat__name--clout">Clout (0\u201350)</span>
          <span class="codex-stat__desc">Your reputation. Drains 1 point per day. Reach 10+ to start seeing opportunity events \u2014 higher risk, higher reward.</span>
        </div>
      </div>

      <div class="codex-section">
        <h3 class="codex-section__title">Your Week</h3>
        <p><strong>Monday\u2013Friday:</strong> You work mornings and afternoons automatically. Evenings are your free time.</p>
        <p><strong>Saturday\u2013Sunday:</strong> All three slots (morning, afternoon, evening) are free.</p>
        <p><strong>Events:</strong> Every 2\u20133 days, an event interrupts with a choice that affects your stats.</p>
        <p><strong>Rent:</strong> Deducted automatically every Sunday night.</p>
      </div>

      <div class="codex-section">
        <h3 class="codex-section__title">Activities</h3>
        <p>During each free time slot, choose one activity:</p>
        <div class="codex-list">
          <div class="codex-list__item"><strong>Rest</strong> \u2014 Recover energy. Free and reliable.</div>
          <div class="codex-list__item"><strong>Cook at Home</strong> \u2014 Small energy cost, gives happiness and a little money.</div>
          <div class="codex-list__item"><strong>Go Out</strong> \u2014 Costs money and energy. Big happiness and clout gains.</div>
          <div class="codex-list__item"><strong>Gym</strong> \u2014 Costs energy now, gives energy back next week.</div>
          <div class="codex-list__item"><strong>Museum</strong> \u2014 Costs energy, gives happiness and clout.</div>
          <div class="codex-list__item"><strong>Extra Shift</strong> \u2014 Costs energy, earns good money.</div>
          <div class="codex-list__item"><strong>Social Hangout</strong> \u2014 Happiness, clout, and advances a random NPC relationship.</div>
          <div class="codex-list__item"><strong>Freelance</strong> \u2014 Requires unlock. High energy cost, high payout.</div>
        </div>
        <p>Some activities unlock through events or NPC interactions.</p>
      </div>

      <div class="codex-section">
        <h3 class="codex-section__title">Events & Inbox</h3>
        <p>City events appear every 2\u20133 days during your week. Each plays as a short scene with choices. Stat previews show what you\u2019ll gain or lose.</p>
        <p>Unresolved events pile up in your inbox. Each has a time limit \u2014 expired events often have negative consequences.</p>
        <p><strong>Opportunity events</strong> only appear when clout is 10+. They\u2019re riskier but more rewarding.</p>
      </div>

      <div class="codex-section">
        <h3 class="codex-section__title">Relationships</h3>
        <p>Four NPCs can become part of your story:</p>
        <div class="codex-npc-list">
          <div class="codex-npc"><span class="codex-npc__name codex-npc__name--carlos">Carlos</span> \u2014 Bodega owner. Steady, generous, knows everyone on the block.</div>
          <div class="codex-npc"><span class="codex-npc__name codex-npc__name--priya">Priya</span> \u2014 Your coworker. Ambitious, connected, can accelerate your career.</div>
          <div class="codex-npc"><span class="codex-npc__name codex-npc__name--dima">Dima</span> \u2014 Musician neighbor. Creative and unpredictable.</div>
          <div class="codex-npc"><span class="codex-npc__name codex-npc__name--jordan">Jordan</span> \u2014 Bartender. Streetwise, always has a side hustle.</div>
        </div>
        <p>Choose <strong>Social Hangout</strong> during free time to advance a random NPC. Relationships grow through stages: Stranger \u2192 Acquaintance \u2192 Neighbor \u2192 Ally.</p>
        <p>Each Ally at year\u2019s end adds <strong>+10</strong> to your final score.</p>
      </div>

      <div class="codex-section">
        <h3 class="codex-section__title">Backgrounds</h3>
        <div class="codex-bg codex-bg--immigrant">
          <div class="codex-bg__name">The Grinder</div>
          <div>Starts tough. Negative events deal 30% less damage. Starting job: Delivery Driver.</div>
        </div>
        <div class="codex-bg codex-bg--middle">
          <div class="codex-bg__name">The Ladder</div>
          <div>Balanced start. Clout gains are 20% higher. Starting job: Office Coordinator.</div>
        </div>
        <div class="codex-bg codex-bg--rich">
          <div class="codex-bg__name">The Legacy</div>
          <div>High starting money. Safety net: balance never drops below $500. Starting job: Junior Associate.</div>
        </div>
      </div>

      <div class="codex-section">
        <h3 class="codex-section__title">Neighborhoods</h3>
        <div class="codex-hood">
          <strong>Astoria, Queens</strong> \u2014 $450/wk. Bonus: +10 energy/week. Drawback: fewer clout events.
        </div>
        <div class="codex-hood">
          <strong>Williamsburg, Brooklyn</strong> \u2014 $750/wk. Bonus: +8 clout/week. Drawback: social activities cost 10% more energy.
        </div>
        <div class="codex-hood">
          <strong>Upper East Side</strong> \u2014 $1,100/wk. Bonus: +15 clout/week. Drawback: community events give less happiness.
        </div>
      </div>

      <div class="codex-section">
        <h3 class="codex-section__title">Scoring</h3>
        <p>At week 52, your year is scored from 0 to 100:</p>
        <div class="codex-list">
          <div class="codex-list__item"><strong>Money</strong> \u2014 Up to 30 points ($200 per point)</div>
          <div class="codex-list__item"><strong>Happiness</strong> \u2014 Up to 50 points (direct value)</div>
          <div class="codex-list__item"><strong>Clout</strong> \u2014 Up to 25 points (half of clout value)</div>
          <div class="codex-list__item"><strong>Allies</strong> \u2014 +10 points per NPC at Ally status</div>
        </div>
      </div>

      <div class="codex-section">
        <h3 class="codex-section__title">Strategy Tips</h3>
        <div class="codex-list">
          <div class="codex-list__item">Happiness is the stat that kills you. Prioritize keeping it above 10.</div>
          <div class="codex-list__item">Cooking is one of the best early-game activities: cheap, cheerful, and profitable.</div>
          <div class="codex-list__item">Don\u2019t ignore your inbox. Expired events usually hurt.</div>
          <div class="codex-list__item">Social Hangout is the only way to advance NPC relationships during free time.</div>
          <div class="codex-list__item">The Gym pays off next week. Think of it as an energy investment.</div>
          <div class="codex-list__item">Going into debt isn\u2019t the end \u2014 but get out fast. The happiness drain compounds.</div>
          <div class="codex-list__item">Your neighborhood bonus applies every day, quietly. It adds up.</div>
        </div>
      </div>

    </div>
  `;

  const closeBtn = panel.querySelector('#codex-close');
  if (closeBtn) closeBtn.addEventListener('click', closeCodex);

  _codexEl.addEventListener('click', (e) => {
    if (e.target === _codexEl) closeCodex();
  });
}
