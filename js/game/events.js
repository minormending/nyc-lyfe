/**
 * game/events.js
 * Event card draw and resolution logic.
 * Does not apply effects — returns effect objects to the caller.
 */

/**
 * Selects an appropriate card from the given deck using weighted random draw.
 * Considers: class eligibility, cooldown, required unlocks, current week.
 *
 * @param {'city'|'opportunity'} deckName
 * @param {object} state - GameState
 * @param {object} data  - full data cache
 * @returns {object|null} card object, or null if no eligible card
 */
export function draw(deckName, state, data) {
  // Clout gates opportunity cards
  // Clout gates opportunity cards (max 50)
  if (deckName === 'opportunity' && state.clout < 10) return null;

  const deckKey = deckName === 'city' ? 'city_cards' : 'opportunity_cards';
  const deck = data[deckKey] || [];

  // IDs already in inbox (don't add duplicates)
  const inboxIds = new Set((state.inbox || []).map(i => i.sceneId));

  // Build a record of recently-drawn cards from the log
  // (assumed: log entries with sceneId tracking are stored in state._cardHistory)
  const cardHistory = state._cardHistory || {};

  const eligible = deck.filter(card => {
    // Already in inbox
    if (inboxIds.has(card.id)) return false;

    // One-time cards already seen
    if (card.oneTime && cardHistory[card.id]) return false;

    // Class eligibility
    const classes = card.eligibility?.classes || ['all'];
    if (!classes.includes('all') && !classes.includes(state.background)) return false;

    // Min week
    if (card.eligibility?.minWeek && state.week < card.eligibility.minWeek) return false;

    // Required unlock
    if (card.eligibility?.requiresUnlock && !(state.unlocks || []).includes(card.eligibility.requiresUnlock)) return false;

    // Required routine activity
    if (card.eligibility?.requiresRoutineActivity) {
      const hasActivity = (state.routine || []).some(r => r.activity === card.eligibility.requiresRoutineActivity);
      if (!hasActivity) return false;
    }

    // Cooldown
    if (card.cooldownWeeks && cardHistory[card.id]) {
      const weeksAgo = state.week - cardHistory[card.id].week;
      if (weeksAgo < card.cooldownWeeks) return false;
    }

    return true;
  });

  if (eligible.length === 0) return null;

  // Look up neighborhood penalty flag
  const neighborhood = (data.neighborhoods || []).find(n => n.id === state.neighborhood);
  const penaltyFlag = neighborhood?.penalty?.flag || '';

  // Weighted random selection — apply stat pressure + neighborhood modifiers
  const weights = eligible.map(card => {
    let w = card.weight || 1.0;

    // Money pressure: reduce cost-heavy cards when broke
    if (card.choices && card.choices.some(c => (c.effects?.money || 0) < 0)) {
      if (state.money < 500) w *= 0.5;
    }

    // High clout boosts opportunity card draw weight
    if (deckName === 'opportunity' && state.clout >= 25) {
      w *= 1.5;
    }

    // Low happiness increases negative-event weight (the city piles on)
    if (state.happiness < 30) {
      const hasNegative = card.choices && card.choices.every(c => {
        const e = c.effects || {};
        return (e.happiness || 0) < 0 || (e.money || 0) < 0 || (e.energy || 0) < 0;
      });
      if (hasNegative) w *= 1.3;
    }

    // Neighborhood penalty: reduced_clout_events (Astoria)
    // Cards with clout rewards appear less often
    if (penaltyFlag === 'reduced_clout_events') {
      const hasCloutGain = card.choices && card.choices.some(c => (c.effects?.clout || 0) > 0);
      if (hasCloutGain) w *= 0.4;
    }

    return w;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let rand = Math.random() * totalWeight;

  for (let i = 0; i < eligible.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return eligible[i];
  }

  return eligible[eligible.length - 1];
}

/**
 * Returns the effect object for the chosen choice on a card.
 * Does not apply effects. Caller passes to effects.apply().
 *
 * @param {object} card - card object (from data)
 * @param {number} choiceIndex - 0-based index of chosen option, or -1 if no choices
 * @returns {object|null} effects object
 */
export function resolve(card, choiceIndex) {
  if (!card) return null;
  if (!card.choices || card.choices.length === 0) return null;
  if (choiceIndex < 0 || choiceIndex >= card.choices.length) return null;

  return card.choices[choiceIndex].effects || null;
}

/**
 * Looks up a card by scene id across both decks.
 * @param {string} sceneId
 * @param {object} data
 * @returns {object|null}
 */
export function findCard(sceneId, data) {
  const cityCard = (data.city_cards || []).find(c => c.id === sceneId);
  if (cityCard) return cityCard;
  const oppCard = (data.opportunity_cards || []).find(c => c.id === sceneId);
  if (oppCard) return oppCard;
  return null;
}

/**
 * Records that a card was drawn this week (updates state._cardHistory in-place).
 * Called after a card is resolved.
 * @param {string} cardId
 * @param {object} state - GameState (mutated directly, call state.save() after)
 */
export function recordDrawn(cardId, state) {
  if (!state._cardHistory) state._cardHistory = {};
  state._cardHistory[cardId] = { week: state.week };
}
