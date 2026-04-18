/**
 * game/effects.js
 * Applies an effect object to game state.
 * Returns a NEW state object — does not mutate in place.
 * Caller is responsible for calling state.save() after applying effects.
 */

import * as npcs from './npcs.js';

/**
 * Valid stat ranges.
 */
const STAT_RANGES = {
  energy:    { min: 0, max: 100 },
  happiness: { min: 0, max: 50 },
  clout:     { min: 0, max: 50 },
  // money: no floor (can go negative)
};

/**
 * Clamps a number to [min, max].
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Deep-clones a state object (simple JSON round-trip).
 * @param {object} state
 * @returns {object}
 */
function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Applies an effect object to game state.
 * Returns a new state object with all effects applied and stats clamped.
 *
 * Supported effect fields:
 *   money, energy, happiness, clout          — immediate stat deltas
 *   npc: { id, delta }                       — advances NPC arc
 *   unlock: string                           — adds to state.unlocks[]
 *   nextScene: string                        — prepends scene id to inbox
 *   log: string                              — appends a log entry
 *   rentDeltaPermanent: number               — not stored in state directly;
 *                                              caller must update neighborhood data
 *   energyDebuff / happinessDebuff: { delta, weeks } — stored for idle to process
 *   moneyOverWeeks: { amount, weeks }        — stored for idle to process
 *   moneyLoseDailyPay: boolean               — lose today's daily pay
 *   moneyNextSession: number                 — stored for next idle tick
 *   neighborhoodTemp: { id, weeks }          — temp neighborhood change
 *
 * @param {object} effectObject
 * @param {object} state - current GameState
 * @param {object} [data] - full data cache (needed for NPC arc lookup)
 * @returns {object} new state
 */
export function apply(effectObject, state, data) {
  if (!effectObject) return state;

  let s = cloneState(state);
  const e = effectObject;

  // --- Immediate stat deltas ---
  if (typeof e.money === 'number')     s.money     += e.money;
  if (typeof e.energy === 'number')    s.energy    = clamp(s.energy    + e.energy,    STAT_RANGES.energy.min,    STAT_RANGES.energy.max);
  if (typeof e.happiness === 'number') s.happiness = clamp(s.happiness + e.happiness, STAT_RANGES.happiness.min, STAT_RANGES.happiness.max);
  if (typeof e.clout === 'number')     s.clout     = clamp(s.clout     + e.clout,     STAT_RANGES.clout.min,     STAT_RANGES.clout.max);

  // --- NPC arc delta ---
  if (e.npc && e.npc.id && typeof e.npc.delta === 'number') {
    const npcData = data && data.npc_arcs ? data.npc_arcs.find(n => n.id === e.npc.id) : null;
    const result = npcs.advanceArc(e.npc.id, e.npc.delta, s, npcData);
    s = result.state;
    // If a new scene was triggered, prepend to inbox
    if (result.triggeredSceneId) {
      s.inbox.unshift({
        sceneId: result.triggeredSceneId,
        arrivedAt: Date.now(),
        ttlDays: null,
        isNpcArc: true,
      });
    }
  }

  // --- Unlock ---
  if (e.unlock && typeof e.unlock === 'string') {
    if (!s.unlocks.includes(e.unlock)) {
      s.unlocks.push(e.unlock);
    }
  }

  // --- Chain next scene into inbox ---
  if (e.nextScene && typeof e.nextScene === 'string') {
    s.inbox.unshift({
      sceneId: e.nextScene,
      arrivedAt: Date.now(),
      ttlDays: null,
    });
  }

  // --- Log entry ---
  if (e.log && typeof e.log === 'string') {
    s.log.unshift({ week: s.week, text: e.log });
    // Keep log to last 50 entries
    if (s.log.length > 50) s.log = s.log.slice(0, 50);
  }

  // --- Scheduled / deferred effects (stored for idle system) ---
  if (!s._pendingEffects) s._pendingEffects = [];

  if (e.energyDebuff && typeof e.energyDebuff.delta === 'number') {
    s._pendingEffects.push({ type: 'energyDebuff', delta: e.energyDebuff.delta, weeksLeft: e.energyDebuff.weeks || 1 });
  }

  if (e.happinessDebuff && typeof e.happinessDebuff.delta === 'number') {
    s._pendingEffects.push({ type: 'happinessDebuff', delta: e.happinessDebuff.delta, weeksLeft: e.happinessDebuff.weeks || 1 });
  }

  if (e.moneyOverWeeks && typeof e.moneyOverWeeks.amount === 'number') {
    s._pendingEffects.push({ type: 'moneyOverWeeks', amount: e.moneyOverWeeks.amount, weeksLeft: e.moneyOverWeeks.weeks || 1 });
  }

  if (e.moneyNextSession) {
    s._pendingEffects.push({ type: 'moneyNextSession', amount: e.moneyNextSession });
  }

  if (e.moneyLoseDailyPay) {
    // Will be resolved in idle using job data
    s._pendingEffects.push({ type: 'moneyLoseDailyPay' });
  }

  if (e.neighborhoodTemp) {
    s._pendingEffects.push({ type: 'neighborhoodTemp', id: e.neighborhoodTemp.id, weeksLeft: e.neighborhoodTemp.weeks || 4 });
  }

  if (e.rentDeltaPermanent) {
    s._pendingEffects.push({ type: 'rentDeltaPermanent', delta: e.rentDeltaPermanent });
  }

  return s;
}

/**
 * Applies a batch of effects in sequence.
 * @param {object[]} effectObjects
 * @param {object} state
 * @param {object} [data]
 * @returns {object} new state
 */
export function applyAll(effectObjects, state, data) {
  return effectObjects.reduce((s, e) => apply(e, s, data), state);
}
