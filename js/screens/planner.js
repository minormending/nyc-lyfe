/**
 * screens/planner.js
 * Day planner — plays through a 7-day week.
 *
 * Work days auto-simulate (pay, energy drain, overnight regen, stat decay).
 * The game only stops for:
 *   - Free time slots (weekday evenings, all weekend slots)
 *   - Mid-week events (every 2-3 days)
 *   - Burnout/crisis states
 *
 * Players can also set a "default evening" to auto-fill weekday evenings,
 * reducing a typical work week to just event responses.
 *
 * Owns #screen-planner.
 */

import * as router from '../utils/router.js';
import { GameState, setState, save } from '../game/state.js';
import { getData } from '../utils/loader.js';
import * as effects from '../game/effects.js';
import * as events from '../game/events.js';
import * as npcs from '../game/npcs.js';
import * as VNE from '../engine/vne.js';
import * as coach from '../game/coach.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOTS = ['morning', 'afternoon', 'evening'];
const SLOT_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const SLOT_ICONS = { morning: '☀', afternoon: '⛅', evening: '🌙' };

const EVENT_INTERVAL_MIN = 2;
const EVENT_INTERVAL_MAX = 3;

const BURNOUT_THRESHOLD = 10;
const CRISIS_THRESHOLD = 0;
const FLOW_THRESHOLD = 40;

const DAILY_HAPPINESS_DRAIN = 2;
const DAILY_CLOUT_DRAIN = 1;
const DEBT_HAPPINESS_DRAIN = 3;
const OVERNIGHT_ENERGY_REGEN = 20;
const SOCIAL_HANGOUT_NPC_DELTA = 1;

// ---------------------------------------------------------------------------
// Helpers (stat mechanics)
// ---------------------------------------------------------------------------

/**
 * Returns the neighborhood's penalty flag, or empty string.
 */
function _getPenaltyFlag() {
  if (!GameState) return '';
  const data = getData();
  const hood = (data.neighborhoods || []).find(n => n.id === GameState.neighborhood);
  return hood?.penalty?.flag || '';
}

function _effectiveEnergyCost(baseCost, actId) {
  if (!GameState || baseCost <= 0) return baseCost;
  let cost = baseCost;

  // Happiness modifiers
  if (GameState.happiness <= CRISIS_THRESHOLD) return cost;
  if (GameState.happiness < BURNOUT_THRESHOLD) cost = Math.ceil(cost * 1.5);
  else if (GameState.happiness >= FLOW_THRESHOLD) cost = Math.floor(cost * 0.8);

  // Williamsburg penalty: social activities cost 10% more energy
  const socialActivities = ['go_out', 'social_hangout'];
  if (_getPenaltyFlag() === 'high_energy_social' && socialActivities.includes(actId)) {
    cost = Math.ceil(cost * 1.1);
  }

  return cost;
}

function _cantAfford(act) {
  if (!act.effects || typeof act.effects.money !== 'number') return false;
  if (act.effects.money >= 0) return false;
  return GameState.money + act.effects.money < 0;
}

function _applyClassAbility(fx) {
  if (!fx || !GameState) return fx;
  const out = { ...fx };
  const bg = GameState.background;
  if (bg === 'immigrant') {
    for (const key of ['energy', 'happiness', 'clout']) {
      if (typeof out[key] === 'number' && out[key] < 0) out[key] = Math.round(out[key] * 0.7);
    }
  } else if (bg === 'middle') {
    if (typeof out.clout === 'number' && out.clout > 0) out.clout = Math.round(out.clout * 1.2);
  }
  return out;
}

function _checkSafetyNet() {
  if (!GameState || GameState.background !== 'rich') return;
  if (GameState.money < 500) {
    const topUp = 500 - GameState.money;
    const newState = effects.apply({ money: topUp }, GameState, getData());
    setState(newState);
    GameState.log.unshift({ week: GameState.week, text: `Safety net: $${topUp} transferred. Family money.` });
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _el = null;
let _currentDay = 1;
let _currentSlotIdx = 0;
let _nextEventDay = 0;
let _pendingEvent = null;

/** Tracks money at start of week for the weekly summary */
let _weekStartMoney = 0;

/** Tracks stats before auto-work to show a summary */
let _preWorkStats = null;

export function init() {
  _el = document.getElementById('screen-planner');
}

export function show() {
  _el.classList.add('active');
  document.getElementById('hud').classList.remove('hud--hidden');
  document.body.classList.add('hud-visible');

  _currentDay = 1;
  _currentSlotIdx = 0;
  _pendingEvent = null;
  _weekStartMoney = GameState ? GameState.money : 0;
  _rollNextEventDay();

  // Show the week overview first, then start day-by-day
  _renderWeekStart();
}

export function hide() {
  _el.classList.remove('active');
}

// ---------------------------------------------------------------------------
// Event system
// ---------------------------------------------------------------------------

function _rollNextEventDay() {
  const gap = EVENT_INTERVAL_MIN + Math.floor(Math.random() * (EVENT_INTERVAL_MAX - EVENT_INTERVAL_MIN + 1));
  _nextEventDay = _currentDay + gap;
}

function _checkForEvent() {
  if (_currentDay < _nextEventDay) return false;
  const data = getData();
  let card = events.draw('city', GameState, data);
  if (!card) card = events.draw('opportunity', GameState, data);
  if (!card) { _rollNextEventDay(); return false; }
  _pendingEvent = card;
  return true;
}

function _playPendingEvent() {
  const card = _pendingEvent;
  _pendingEvent = null;
  hide();
  document.getElementById('hud').classList.add('hud--hidden');
  document.body.classList.remove('hud-visible');

  VNE.play(card, (choiceIndex) => {
    const data = getData();
    if (choiceIndex >= 0 && card.choices && card.choices[choiceIndex]) {
      let effectObj = card.choices[choiceIndex].effects || {};
      effectObj = _applyClassAbility(effectObj);
      const newState = effects.apply(effectObj, GameState, data);
      setState(newState);
      _showStatDeltas(effectObj);
    }
    _checkSafetyNet();
    events.recordDrawn(card.id, GameState);
    save();
    _rollNextEventDay();

    document.getElementById('hud').classList.remove('hud--hidden');
    document.body.classList.add('hud-visible');
    _el.classList.add('active');

    // Continue the day after the event
    _continueAfterEvent();
  });
}

// ---------------------------------------------------------------------------
// Week start overview
// ---------------------------------------------------------------------------

function _renderWeekStart() {
  _el.innerHTML = '';
  const data = getData();
  const job = (data.jobs || []).find(j => j.id === GameState.job);
  const neighborhood = (data.neighborhoods || []).find(n => n.id === GameState.neighborhood);
  const rent = (neighborhood ? neighborhood.weeklyRent : 0) + (GameState._pendingRentDelta || 0);

  const wrapper = document.createElement('div');
  wrapper.className = 'planner';

  wrapper.innerHTML = `
    <div class="planner__header">
      <h1 class="planner__title">Week ${GameState.week}</h1>
      <span class="planner__week">OF 52</span>
    </div>
    <div class="planner__week-overview card">
      <div class="planner__overview-row">
        <span>Job</span>
        <span style="color:var(--color-text-primary)">${job ? job.label : '—'}</span>
      </div>
      <div class="planner__overview-row">
        <span>Weekly pay</span>
        <span style="color:var(--color-money)">+$${job ? job.weeklyPay : 0}</span>
      </div>
      <div class="planner__overview-row">
        <span>Rent</span>
        <span style="color:#e05555">-$${rent}</span>
      </div>
      <div class="planner__overview-row">
        <span>Work energy</span>
        <span style="color:var(--color-energy)">-${job ? job.energyCostPerShift || 0 : 0}/day × 5 days</span>
      </div>
      <div class="planner__overview-row">
        <span>Overnight regen</span>
        <span style="color:var(--color-energy)">+${OVERNIGHT_ENERGY_REGEN}/night</span>
      </div>
      <div class="planner__overview-row planner__overview-row--net">
        <span>Projected net</span>
        <span style="color:${(job ? job.weeklyPay : 0) - rent >= 0 ? 'var(--color-money)' : '#e05555'}">${(job ? job.weeklyPay : 0) - rent >= 0 ? '+' : ''}$${(job ? job.weeklyPay : 0) - rent}</span>
      </div>
      <div class="planner__overview-stats">
        <span style="color:${GameState.money < 0 ? '#e05555' : 'var(--color-money)'}">$${GameState.money.toLocaleString()}</span>
        <span style="color:var(--color-energy)">Energy: ${GameState.energy}</span>
        <span style="color:var(--color-happiness)">Happy: ${GameState.happiness}</span>
        <span style="color:var(--color-clout)">Clout: ${GameState.clout}</span>
      </div>
    </div>
  `;

  // Warnings
  const warnings = _getWarnings();
  if (warnings.length > 0) {
    const warningEl = document.createElement('div');
    warningEl.className = 'planner__warnings';
    for (const w of warnings) {
      const p = document.createElement('div');
      p.className = `planner__warning planner__warning--${w.type}`;
      p.textContent = w.text;
      warningEl.appendChild(p);
    }
    wrapper.appendChild(warningEl);
  }

  const actions = document.createElement('div');
  actions.className = 'planner__content';

  const startBtn = document.createElement('button');
  startBtn.className = 'btn-primary';
  startBtn.textContent = 'START THE WEEK';
  startBtn.addEventListener('click', () => {
    _startDay();
  });
  actions.appendChild(startBtn);

  wrapper.appendChild(actions);
  _el.appendChild(wrapper);

  setTimeout(() => coach.trigger('planner_overview'), 200);
}

// ---------------------------------------------------------------------------
// Day flow
// ---------------------------------------------------------------------------

/**
 * Begins a new day. Applies overnight regen + drains, checks for events,
 * auto-simulates work, then renders the first free slot (or advances).
 */
function _startDay() {
  if (_currentDay > 1) {
    _applyOvernightEffects();

    // Brief day transition
    _showDayTransition(DAY_NAMES[_currentDay - 1], () => {
      _afterDayTransition();
    });
    return;
  }

  _afterDayTransition();
}

function _afterDayTransition() {
  if (_checkForEvent()) {
    _renderEventInterrupt();
    return;
  }
  _autoSimulateWork();
  _findNextFreeSlot();
}

function _applyOvernightEffects() {
  const data = getData();

  // Daily stat drains
  let drain = { happiness: -DAILY_HAPPINESS_DRAIN, clout: -DAILY_CLOUT_DRAIN };
  if (GameState.money < 0) drain.happiness -= DEBT_HAPPINESS_DRAIN;
  drain = _applyClassAbility(drain);
  setState(effects.apply(drain, GameState, data));

  // Overnight energy regen
  setState(effects.apply({ energy: OVERNIGHT_ENERGY_REGEN }, GameState, data));

  // Neighborhood vibe bonus (applied once per day)
  const neighborhood = (data.neighborhoods || []).find(n => n.id === GameState.neighborhood);
  if (neighborhood && neighborhood.vibeBonus) {
    const vb = neighborhood.vibeBonus;
    const dailyBonus = Math.floor(vb.delta / 7);
    if (dailyBonus > 0) {
      setState(effects.apply({ [vb.stat]: dailyBonus }, GameState, data));
    }
  }

  // Apply deferred "nextWeek" effects (gym, running)
  if (GameState._deferredEffects && GameState._deferredEffects.length > 0) {
    for (const fx of GameState._deferredEffects) {
      setState(effects.apply(fx, GameState, data));
    }
    GameState._deferredEffects = [];
  }

  _checkSafetyNet();
  _checkPromotion(data);
  save();
}

function _autoSimulateWork() {
  _preWorkStats = null;
  if (_currentDay > 5) return; // weekends — no auto-work

  const data = getData();
  const job = (data.jobs || []).find(j => j.id === GameState.job);

  // Snapshot stats before work
  _preWorkStats = {
    money: GameState.money,
    energy: GameState.energy,
    jobLabel: job ? job.label : 'Job',
  };

  // Morning + afternoon are work
  for (const slot of ['morning', 'afternoon']) {
    _payForWork(job);
    _setActivity(_currentDay, slot, 'work');
  }
  _currentSlotIdx = 2; // jump to evening

  // Capture deltas
  _preWorkStats.earnedMoney = GameState.money - _preWorkStats.money;
  _preWorkStats.usedEnergy = _preWorkStats.energy - GameState.energy;

  save();
}

/**
 * Finds the next slot that needs player input.
 * If all slots are done, advances to next day.
 */
function _findNextFreeSlot() {
  while (_currentSlotIdx < SLOTS.length) {
    const slot = SLOTS[_currentSlotIdx];
    const isWorkSlot = _currentDay <= 5 && (slot === 'morning' || slot === 'afternoon');
    if (!isWorkSlot) break; // free slot found
    _currentSlotIdx++;
  }

  if (_currentSlotIdx >= SLOTS.length) {
    _finishDay();
    return;
  }

  _render();
}

/** Called after a VNE event resolves — continue from where we were */
function _continueAfterEvent() {
  // If we hadn't started the day's slots yet, start fresh
  if (_currentSlotIdx === 0) {
    _autoSimulateWork();
  }
  _findNextFreeSlot();
}

function _finishDay() {
  _currentDay++;
  _currentSlotIdx = 0;

  if (_currentDay > 7) {
    _finishWeek();
    return;
  }

  _startDay();
}

function _finishWeek() {
  _deductRent();
  GameState.week = Math.min(52, GameState.week + 1);
  GameState.lastLogin = Date.now();
  _resetRoutine();
  _checkSafetyNet();
  save();

  if (GameState.week >= 52) {
    router.go('ending');
    return;
  }

  const pendingInbox = (GameState.inbox || []).filter(i => !i.expired && !i.resolved);
  if (pendingInbox.length > 0) {
    router.go('inbox', { nextScreen: 'explore' });
  } else {
    router.go('explore', { weekSummary: { startMoney: _weekStartMoney, endMoney: GameState.money } });
  }
}

// ---------------------------------------------------------------------------
// Render — only called for free slots (evenings, weekends)
// ---------------------------------------------------------------------------

function _render() {
  if (!GameState) return;

  const data = getData();
  const slot = SLOTS[_currentSlotIdx];
  const dayName = DAY_NAMES[_currentDay - 1];
  const isWeekend = _currentDay > 5;

  _el.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'planner';

  wrapper.innerHTML = `
    <div class="planner__header">
      <h1 class="planner__title">${dayName}</h1>
      <span class="planner__week">WEEK ${GameState.week} OF 52</span>
    </div>
    <div class="planner__slot-label">
      <span class="planner__slot-icon">${SLOT_ICONS[slot]}</span>
      <span class="planner__slot-name">${SLOT_LABELS[slot]}</span>
    </div>
    <div class="planner__quick-stats">
      <span style="color:${GameState.money < 0 ? '#e05555' : 'var(--color-money)'}">$${GameState.money.toLocaleString()}</span>
      <span style="color:var(--color-energy)">Energy: ${GameState.energy}</span>
      <span style="color:var(--color-happiness)">Happy: ${GameState.happiness}</span>
      <span style="color:var(--color-clout)">Clout: ${GameState.clout}</span>
    </div>
  `;

  // Warnings
  const warnings = _getWarnings();
  if (warnings.length > 0) {
    const warningEl = document.createElement('div');
    warningEl.className = 'planner__warnings';
    for (const w of warnings) {
      const p = document.createElement('div');
      p.className = `planner__warning planner__warning--${w.type}`;
      p.textContent = w.text;
      warningEl.appendChild(p);
    }
    wrapper.appendChild(warningEl);
  }

  // Timeline
  const timeline = document.createElement('div');
  timeline.className = 'planner__timeline';
  for (let i = 0; i < SLOTS.length; i++) {
    const s = SLOTS[i];
    const item = _getRoutineItem(_currentDay, s);
    const actId = item ? item.activity : null;
    const pill = document.createElement('div');
    if (i < _currentSlotIdx) {
      const actData = actId ? (data.activities || []).find(a => a.id === actId) : null;
      const label = actId === 'work' ? 'Work' : (actData ? actData.label : 'Free');
      pill.className = 'planner__timeline-slot planner__timeline-slot--done';
      pill.textContent = `${SLOT_LABELS[s]}: ${label}`;
    } else if (i === _currentSlotIdx) {
      pill.className = 'planner__timeline-slot planner__timeline-slot--current';
      pill.textContent = `${SLOT_LABELS[s]}: Now`;
    } else {
      pill.className = 'planner__timeline-slot';
      pill.textContent = SLOT_LABELS[s];
    }
    timeline.appendChild(pill);
  }
  wrapper.appendChild(timeline);

  // Work summary (shown on weekday evenings after auto-work)
  if (_preWorkStats && !isWeekend && slot === 'evening') {
    const ws = _preWorkStats;
    const summaryEl = document.createElement('div');
    summaryEl.className = 'planner__work-recap';
    summaryEl.innerHTML = `
      <span class="planner__work-recap-label">${ws.jobLabel}</span>
      <span style="color:var(--color-money)">+$${ws.earnedMoney}</span>
      <span style="color:var(--color-energy)">-${ws.usedEnergy} energy</span>
    `;
    wrapper.appendChild(summaryEl);
    _preWorkStats = null; // show only once
  }

  // Content
  const content = document.createElement('div');
  content.className = 'planner__content';

  if (GameState.happiness <= CRISIS_THRESHOLD) {
    // Burnout — forced rest
    content.innerHTML = `
      <div class="planner__work-notice card">
        <div class="planner__work-title" style="color:var(--color-happiness)">Burnout</div>
        <div class="planner__work-detail">You can't do anything. Your body is making the decision for you.</div>
        <div class="planner__work-flavor text-muted text-italic">You stare at the ceiling. The ceiling stares back. It's not unsympathetic.</div>
      </div>
    `;
    const restBtn = document.createElement('button');
    restBtn.className = 'btn-primary';
    restBtn.textContent = 'REST';
    restBtn.addEventListener('click', () => {
      const restAct = (data.activities || []).find(a => a.id === 'rest');
      if (restAct) _doActivity(restAct, data);
      else { _setActivity(_currentDay, slot, null); _advanceSlot(); }
    });
    content.appendChild(restBtn);
  } else {
    // Activity choices
    const activities = (data.activities || []).filter(a => !a.isWork);
    const listEl = document.createElement('div');
    listEl.className = 'planner__activity-list';

    for (const act of activities) {
      const locked = act.unlockRequired && !(GameState.unlocks || []).includes(act.unlockRequired);
      const effectiveCost = _effectiveEnergyCost(act.energyCost, act.id);
      const tooExpensive = effectiveCost > 0 && effectiveCost > GameState.energy;
      const tooPoor = _cantAfford(act);
      const disabled = locked || tooExpensive || tooPoor;

      const btn = document.createElement('button');
      btn.className = 'planner__activity-btn card' + (disabled ? ' planner__activity-btn--disabled' : '');

      let costParts = [];
      if (effectiveCost > 0) {
        const costStr = effectiveCost !== act.energyCost ? `<s>${act.energyCost}</s> ${effectiveCost}` : `${effectiveCost}`;
        costParts.push(`<span style="color:var(--color-energy)">-${costStr} energy</span>`);
      }
      if (act.effects) {
        for (const [key, val] of Object.entries(act.effects)) {
          if (key === 'energy' && val > 0) costParts.push(`<span style="color:var(--color-energy)">+${val} energy</span>`);
          if (key === 'money' && val > 0) costParts.push(`<span style="color:var(--color-money)">+$${val}</span>`);
          if (key === 'money' && val < 0) costParts.push(`<span style="color:#e05555">$${val}</span>`);
          if (key === 'happiness' && val > 0) costParts.push(`<span style="color:var(--color-happiness)">+${val} happy</span>`);
          if (key === 'happiness' && val < 0) costParts.push(`<span style="color:#e05555">${val} happy</span>`);
          if (key === 'clout' && val > 0) costParts.push(`<span style="color:var(--color-clout)">+${val} clout</span>`);
        }
      }
      if (act.id === 'social_hangout') costParts.push(`<span style="color:#4CAF50">Random NPC +1</span>`);

      let statusText = '';
      if (locked) statusText = '<span class="planner__activity-locked">Locked</span>';
      else if (tooPoor) statusText = '<span class="planner__activity-locked">Can\'t afford</span>';
      else if (tooExpensive) statusText = '<span class="planner__activity-locked">Not enough energy</span>';

      btn.innerHTML = `
        <div class="planner__activity-name">${act.label}</div>
        <div class="planner__activity-costs">${costParts.join(' · ')}${statusText ? ' · ' + statusText : ''}</div>
      `;

      if (!disabled) {
        btn.addEventListener('click', () => _doActivity(act, data));
      }
      listEl.appendChild(btn);
    }
    content.appendChild(listEl);

    // Skip
    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn-ghost';
    skipBtn.textContent = 'DO NOTHING';
    skipBtn.style.marginTop = 'var(--space-md)';
    skipBtn.addEventListener('click', () => {
      _setActivity(_currentDay, slot, null);
      _advanceSlot();
    });
    content.appendChild(skipBtn);
  }

  wrapper.appendChild(content);

  // Call it a day (skip remaining free slots)
  const endBtn = document.createElement('button');
  endBtn.className = 'btn-ghost';
  endBtn.textContent = 'SKIP TO NEXT DAY';
  endBtn.style.marginTop = 'var(--space-lg)';
  endBtn.addEventListener('click', () => {
    for (let i = _currentSlotIdx; i < SLOTS.length; i++) _setActivity(_currentDay, SLOTS[i], null);
    save();
    _finishDay();
  });
  wrapper.appendChild(endBtn);

  _el.appendChild(wrapper);

  if (isWeekend) {
    setTimeout(() => coach.trigger('planner_weekend'), 200);
  } else if (slot === 'evening') {
    setTimeout(() => coach.trigger('planner_evening'), 200);
  }
}

function _renderEventInterrupt() {
  const card = _pendingEvent;
  const dayName = DAY_NAMES[_currentDay - 1];
  _el.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'planner';
  const deckLabel = card.deck === 'opportunity' ? 'OPPORTUNITY' : 'CITY EVENT';
  const deckClass = card.deck === 'opportunity' ? 'badge--opportunity' : 'badge--city';

  wrapper.innerHTML = `
    <div class="planner__header">
      <h1 class="planner__title">${dayName}</h1>
      <span class="planner__week">WEEK ${GameState.week} OF 52</span>
    </div>
    <div class="planner__event-interrupt card">
      <span class="badge ${deckClass}">${deckLabel}</span>
      <div class="planner__event-title">${card.title || card.id}</div>
      <div class="planner__event-teaser text-muted text-italic">${card.teaser || ''}</div>
    </div>
  `;

  const resolveBtn = document.createElement('button');
  resolveBtn.className = 'btn-primary';
  resolveBtn.textContent = 'SEE WHAT HAPPENED';
  resolveBtn.addEventListener('click', () => _playPendingEvent());
  wrapper.appendChild(resolveBtn);
  _el.appendChild(wrapper);

  setTimeout(() => coach.trigger('event_interrupt'), 200);
}

// ---------------------------------------------------------------------------
// Activity execution
// ---------------------------------------------------------------------------

function _doActivity(act, data) {
  const slot = SLOTS[_currentSlotIdx];

  // Build a combined delta for the floater display
  const deltaSummary = {};
  const effectiveCost = _effectiveEnergyCost(act.energyCost, act.id);
  if (effectiveCost > 0) {
    deltaSummary.energy = -effectiveCost;
    setState(effects.apply({ energy: -effectiveCost }, GameState, data));
  }
  if (act.effects) {
    let modFx = _applyClassAbility(act.effects);

    // UES penalty: happiness gains from activities reduced 30%
    if (_getPenaltyFlag() === 'low_community_happiness' && typeof modFx.happiness === 'number' && modFx.happiness > 0) {
      modFx = { ...modFx, happiness: Math.floor(modFx.happiness * 0.7) };
    }

    if (act.effectDelay === 'nextWeek') {
      if (!GameState._deferredEffects) GameState._deferredEffects = [];
      GameState._deferredEffects.push(modFx);
    } else {
      for (const [k, v] of Object.entries(modFx)) {
        if (typeof v === 'number') deltaSummary[k] = (deltaSummary[k] || 0) + v;
      }
      setState(effects.apply(modFx, GameState, data));
    }
  }
  if (act.id === 'social_hangout') _advanceRandomNpc(data);
  _checkSafetyNet();
  _setActivity(_currentDay, slot, act.id);
  save();

  // Visual feedback
  _showStatDeltas(deltaSummary);
  _showFlavorToast(act.flavorCompleted);
  _advanceSlot();
}

function _advanceSlot() {
  _currentSlotIdx++;
  _findNextFreeSlot();
}

function _advanceRandomNpc(data) {
  const npcIds = Object.keys(GameState.npcs || {});
  if (npcIds.length === 0) return;
  const randomId = npcIds[Math.floor(Math.random() * npcIds.length)];
  const npcData = (data.npc_arcs || []).find(n => n.id === randomId);
  const result = npcs.advanceArc(randomId, SOCIAL_HANGOUT_NPC_DELTA, GameState, npcData);
  setState(result.state);
  if (result.triggeredSceneId) {
    GameState.inbox.unshift({ sceneId: result.triggeredSceneId, arrivedAt: Date.now(), ttlDays: null, isNpcArc: true });
  }
}

/**
 * Shows a brief day name overlay, then calls the callback.
 */
function _showDayTransition(dayName, callback) {
  _el.innerHTML = '';
  const overlay = document.createElement('div');
  overlay.className = 'planner__day-transition';
  overlay.innerHTML = `<div class="planner__day-transition-name">${dayName}</div>`;
  _el.appendChild(overlay);

  setTimeout(() => {
    overlay.classList.add('planner__day-transition--fade');
    setTimeout(callback, 300);
  }, 500);
}

const STAT_DELTA_COLORS = {
  money: 'var(--color-money)', energy: 'var(--color-energy)',
  happiness: 'var(--color-happiness)', clout: 'var(--color-clout)',
};

/**
 * Shows floating stat change indicators near the HUD.
 */
function _showStatDeltas(fx) {
  if (!fx) return;
  const container = document.getElementById('delta-container');
  if (!container) return;

  const deltas = [];
  if (fx.money && fx.money !== 0) deltas.push({ stat: 'money', label: `${fx.money > 0 ? '+' : ''}$${fx.money}` });
  if (fx.energy && fx.energy !== 0) deltas.push({ stat: 'energy', label: `${fx.energy > 0 ? '+' : ''}${fx.energy} energy` });
  if (fx.happiness && fx.happiness !== 0) deltas.push({ stat: 'happiness', label: `${fx.happiness > 0 ? '+' : ''}${fx.happiness} happy` });
  if (fx.clout && fx.clout !== 0) deltas.push({ stat: 'clout', label: `${fx.clout > 0 ? '+' : ''}${fx.clout} clout` });

  deltas.forEach((d, i) => {
    setTimeout(() => {
      const floater = document.createElement('div');
      floater.className = `delta-floater delta-floater--${d.stat}`;
      floater.textContent = d.label;
      container.appendChild(floater);
      setTimeout(() => floater.remove(), 1300);
    }, i * 200);
  });
}

function _showFlavorToast(text) {
  if (!text) return;
  const toast = document.createElement('div');
  toast.className = 'planner__flavor-toast';
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('planner__flavor-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('planner__flavor-toast--visible');
    setTimeout(() => toast.remove(), 400);
  }, 2200);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _getWarnings() {
  const warnings = [];
  if (GameState.happiness <= CRISIS_THRESHOLD) warnings.push({ type: 'danger', text: "You're burnt out. You can only rest." });
  else if (GameState.happiness < BURNOUT_THRESHOLD) warnings.push({ type: 'warn', text: `Running on fumes. Activities cost 50% more energy. (Happy: ${GameState.happiness})` });
  if (GameState.happiness >= FLOW_THRESHOLD) warnings.push({ type: 'good', text: "Feeling good. Activities cost 20% less energy." });
  if (GameState.money < 0) warnings.push({ type: 'danger', text: `In debt ($${GameState.money}). Happiness drains faster.` });
  if (GameState.clout < 10 && GameState.clout > 0) warnings.push({ type: 'warn', text: `Low clout (${GameState.clout}). No opportunities coming.` });
  if (GameState.clout <= 0) warnings.push({ type: 'danger', text: `Nobody knows who you are. Opportunities locked.` });
  return warnings;
}

function _payForWork(job) {
  if (!job || !GameState) return;
  const data = getData();
  const shiftPay = Math.floor((job.dailyPay || Math.floor(job.weeklyPay / 5)) / 2);
  const shiftEnergy = -Math.floor((job.energyCostPerShift || 0) / 2);
  const fx = {};
  if (shiftPay > 0) fx.money = shiftPay;
  if (shiftEnergy < 0) fx.energy = shiftEnergy;
  if (Object.keys(fx).length > 0) setState(effects.apply(fx, GameState, data));
}

function _checkPromotion(data) {
  const currentJob = (data.jobs || []).find(j => j.id === GameState.job);
  if (!currentJob || !currentJob.promotionPath || !currentJob.promotionCondition) return;
  const cond = currentJob.promotionCondition;
  const unlocks = GameState.unlocks || [];

  // job_interview unlock: been exploring options, reduces time requirement by 3 weeks
  let weeksNeeded = cond.weeks;
  if (unlocks.includes('job_interview')) weeksNeeded = Math.max(1, weeksNeeded - 3);

  // job_promotion unlock: Priya put in a word — reduces by 5 weeks + bypasses clout check
  const hasPriyaBoost = unlocks.includes('job_promotion');
  if (hasPriyaBoost) weeksNeeded = Math.max(1, weeksNeeded - 5);

  if (GameState.week < weeksNeeded) return;
  if (cond.minHappiness && GameState.happiness < cond.minHappiness) return;
  if (cond.minClout && !hasPriyaBoost && GameState.clout < cond.minClout) return;

  const newJob = (data.jobs || []).find(j => j.id === currentJob.promotionPath);
  if (!newJob) return;
  GameState.job = newJob.id;
  GameState.log.unshift({ week: GameState.week, text: `Promoted to ${newJob.label}! Weekly pay: $${newJob.weeklyPay}.` });

  // Remove consumed unlocks
  GameState.unlocks = unlocks.filter(u => u !== 'job_interview' && u !== 'job_promotion');
}

function _setActivity(day, slot, activityId) {
  if (!GameState) return;
  const item = GameState.routine.find(r => r.day === day && r.slot === slot);
  if (item) item.activity = activityId;
}

function _getRoutineItem(day, slot) {
  if (!GameState) return null;
  return GameState.routine.find(r => r.day === day && r.slot === slot) || null;
}

function _resetRoutine() {
  if (!GameState) return;
  GameState.routine = [];
  for (let day = 1; day <= 7; day++) {
    for (const slot of SLOTS) {
      GameState.routine.push({
        day, slot,
        activity: (day <= 5 && (slot === 'morning' || slot === 'afternoon')) ? 'work' : null,
      });
    }
  }
}

function _deductRent() {
  if (!GameState) return;
  const data = getData();
  const neighborhood = (data.neighborhoods || []).find(n => n.id === GameState.neighborhood);
  const rent = (neighborhood ? neighborhood.weeklyRent : 0) + (GameState._pendingRentDelta || 0);
  if (rent > 0) {
    setState(effects.apply({ money: -rent }, GameState, data));
    GameState.log.unshift({ week: GameState.week, text: `Rent paid: $${rent}.` });
    GameState.lastRentTick = Date.now();
  }
}
