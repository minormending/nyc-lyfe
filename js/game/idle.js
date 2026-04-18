/**
 * game/idle.js
 * Calculates what happened while the player was away.
 * Returns an IdleSummary object. Does not show any UI.
 * Does not mutate state directly — caller applies returned state.
 */

import * as events from './events.js';

const MS_PER_HOUR = 3600000;
const MS_PER_DAY  = 86400000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

const MAX_IDLE_DAYS = 14;
const BASE_ENERGY_REGEN = 20; // per game day — matches active play overnight regen
const CARD_INTERVAL_MIN = 2; // real hours between cards
const CARD_INTERVAL_MAX = 3;
const MAX_CARDS_PER_SESSION = 3;

/**
 * Calculates idle progression since last login.
 * Mutates and returns a new state object plus an IdleSummary.
 *
 * @param {object} state - current GameState
 * @param {object} data  - full data cache from loader
 * @returns {{ state: object, summary: object }}
 */
export function calculate(state, data) {
  const now = Date.now();
  const elapsedMs = now - state.lastLogin;

  // Cap idle at 14 game days
  const elapsedHours = elapsedMs / MS_PER_HOUR;
  const rawGameDays  = Math.floor(elapsedHours);
  const gameDays     = Math.min(rawGameDays, MAX_IDLE_DAYS);

  let s = JSON.parse(JSON.stringify(state)); // deep clone

  const summary = {
    gameDaysElapsed: gameDays,
    incomeEarned:    0,
    rentPaid:        0,
    rentIncrease:    0,
    energyGained:    0,
    newCards:        0,
    expiredCards:    0,
    logEntries:      [],
  };

  // --- Find current neighborhood and job ---
  const neighborhood = (data.neighborhoods || []).find(n => n.id === s.neighborhood);
  const job          = (data.jobs || []).find(j => j.id === s.job);

  // Process any pending permanent rent delta
  if (s._pendingEffects) {
    const rentDeltaEffect = s._pendingEffects.find(e => e.type === 'rentDeltaPermanent');
    if (rentDeltaEffect) {
      s._pendingRentDelta = (s._pendingRentDelta || 0) + rentDeltaEffect.delta;
      s._pendingEffects = s._pendingEffects.filter(e => e.type !== 'rentDeltaPermanent');
    }
  }

  const weeklyRent = (neighborhood ? neighborhood.weeklyRent : 0) + (s._pendingRentDelta || 0);
  const neighborhoodEnergyBonus = neighborhood?.vibeBonus?.stat === 'energy' ? neighborhood.vibeBonus.delta : 0;

  // --- Per-day calculations ---
  if (gameDays > 0) {
    const dailyIncome = job ? (job.weeklyPay / 7) : 0;
    const totalIncome = Math.floor(dailyIncome * gameDays);
    s.money += totalIncome;
    summary.incomeEarned = totalIncome;

    const energyPerDay = BASE_ENERGY_REGEN + Math.floor(neighborhoodEnergyBonus / 7);
    const totalEnergy  = energyPerDay * gameDays;
    s.energy = Math.min(100, s.energy + totalEnergy);
    summary.energyGained = totalEnergy;

    if (totalIncome > 0) {
      const suffix = _incomeFlavorSuffix();
      summary.logEntries.push(`You earned $${totalIncome} from work. ${suffix}`);
    }
    summary.logEntries.push(`${gameDays} day${gameDays > 1 ? 's' : ''} passed.`);
  }

  // --- Process pending debuffs ---
  if (s._pendingEffects) {
    const remaining = [];
    for (const effect of s._pendingEffects) {
      if (effect.type === 'energyDebuff') {
        s.energy = Math.max(0, s.energy + effect.delta);
        if (effect.weeksLeft > 1) remaining.push({ ...effect, weeksLeft: effect.weeksLeft - 1 });
      } else if (effect.type === 'happinessDebuff') {
        s.happiness = Math.max(0, s.happiness + effect.delta);
        if (effect.weeksLeft > 1) remaining.push({ ...effect, weeksLeft: effect.weeksLeft - 1 });
      } else if (effect.type === 'moneyOverWeeks') {
        const share = Math.floor(effect.amount / effect.weeksLeft);
        s.money += share;
        if (effect.weeksLeft > 1) remaining.push({ ...effect, amount: effect.amount - share, weeksLeft: effect.weeksLeft - 1 });
      } else if (effect.type === 'moneyNextSession') {
        s.money += effect.amount;
        // one-time, not re-added
      } else if (effect.type === 'moneyLoseDailyPay') {
        if (job) s.money -= Math.floor(job.weeklyPay / 7);
      } else if (effect.type === 'neighborhoodTemp') {
        // Track the temp neighborhood for HUD display
        if (!s._tempNeighborhood) s._tempNeighborhood = { id: effect.id, weeksLeft: effect.weeksLeft };
        if (effect.weeksLeft > 1) remaining.push({ ...effect, weeksLeft: effect.weeksLeft - 1 });
        else s._tempNeighborhood = null;
      } else {
        remaining.push(effect);
      }
    }
    s._pendingEffects = remaining;
  }

  // --- Rent check ---
  // Rent is now handled by the planner at end-of-week during active play.
  // Idle only deducts rent for full weeks the player was completely away.
  const msSinceRent = now - s.lastRentTick;
  if (msSinceRent >= MS_PER_WEEK) {
    const weeksOwed = Math.floor(msSinceRent / MS_PER_WEEK);
    const totalRent = weeklyRent * weeksOwed;
    s.money -= totalRent;
    s.lastRentTick = s.lastRentTick + weeksOwed * MS_PER_WEEK;
    summary.rentPaid = totalRent;

    if (totalRent > 0) {
      summary.logEntries.push(_rentFlavor(totalRent));
    }

    // Only advance weeks for full real weeks the player was away.
    // Do NOT advance for partial weeks — the planner handles in-game week flow.
    s.week = Math.min(52, s.week + weeksOwed);
  }

  // --- Draw city cards ---
  const cardIntervalMs = _randomBetween(CARD_INTERVAL_MIN, CARD_INTERVAL_MAX) * MS_PER_HOUR;
  const cardsToAdd = Math.min(
    MAX_CARDS_PER_SESSION,
    Math.floor(elapsedMs / cardIntervalMs)
  );

  for (let i = 0; i < cardsToAdd; i++) {
    const card = events.draw('city', s, data);
    if (card) {
      s.inbox.push({
        sceneId:   card.id,
        arrivedAt: now - (cardsToAdd - i) * cardIntervalMs,
        ttlDays:   card.ttlDays || null,
        deck:      card.deck,
        title:     card.title,
        teaser:    card.teaser,
      });
      summary.newCards++;
    }
  }

  if (summary.newCards > 0) {
    summary.logEntries.push(`${summary.newCards} thing${summary.newCards > 1 ? 's' : ''} happened while you were out.`);
  }

  // --- Mark expired cards ---
  for (const item of s.inbox) {
    if (!item.ttlDays || item.expired) continue;
    const age = (now - item.arrivedAt) / MS_PER_DAY;
    if (age > item.ttlDays) {
      item.expired = true;
      summary.expiredCards++;
    }
  }

  if (summary.expiredCards > 0) {
    summary.logEntries.push(`${summary.expiredCards} decision${summary.expiredCards > 1 ? 's' : ''} expired while you were away.`);
  }

  // --- Warn on low happiness ---
  if (s.happiness < 10) {
    summary.happinessWarning = true;
  }

  // --- Update lastLogin ---
  s.lastLogin = now;

  return { state: s, summary };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

const INCOME_SUFFIXES = [
  "The city takes its cut.",
  "Not enough, but enough for now.",
  "You've earned worse.",
  "The number goes up. So does the rent.",
  "Another week in the machine.",
];

function _incomeFlavorSuffix() {
  return INCOME_SUFFIXES[Math.floor(Math.random() * INCOME_SUFFIXES.length)];
}

const RENT_FLAVORS = [
  amt => `Rent paid: $${amt}. Your landlord is very pleased with himself.`,
  amt => `Rent paid: $${amt}. Ouch.`,
  amt => `$${amt} to your landlord. As is tradition.`,
  amt => `Rent: $${amt}. The number doesn't get smaller.`,
];

function _rentFlavor(amt) {
  const fn = RENT_FLAVORS[Math.floor(Math.random() * RENT_FLAVORS.length)];
  return fn(amt);
}
