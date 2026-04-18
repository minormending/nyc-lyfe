/**
 * screens/digest.js
 * City digest — summarises what happened while the player was away.
 * Owns #screen-digest.
 */

import * as router from '../utils/router.js';
import { GameState } from '../game/state.js';

let _el = null;

const ICON_MAP = {
  income:  { class: 'digest-card__icon--income',  text: '$' },
  rent:    { class: 'digest-card__icon--rent',     text: '↓' },
  energy:  { class: 'digest-card__icon--energy',   text: '⚡' },
  card:    { class: 'digest-card__icon--card',      text: '✉' },
  expired: { class: 'digest-card__icon--expired',   text: '✕' },
  warning: { class: 'digest-card__icon--warning',   text: '!' },
};

export function init() {
  _el = document.getElementById('screen-digest');
  _el.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'digest';
  wrapper.innerHTML = `
    <h1 class="digest__header">WHILE YOU WERE GONE</h1>
    <p class="digest__elapsed" id="digest-elapsed"></p>
    <div class="digest__cards" id="digest-cards"></div>
    <div class="center" id="digest-actions"></div>
  `;
  _el.appendChild(wrapper);
}

export function show(params = {}) {
  _el.classList.add('active');

  const summary = params.summary || {};
  const days = summary.gameDaysElapsed || 0;

  _el.querySelector('#digest-elapsed').textContent =
    days > 0 ? `You were away for ${days} day${days > 1 ? 's' : ''}.` : 'Welcome back.';

  const cardsEl = _el.querySelector('#digest-cards');
  cardsEl.innerHTML = '';

  // Build summary cards from log entries + summary data
  const entries = [];

  if (summary.incomeEarned > 0) {
    entries.push({ type: 'income', text: summary.logEntries?.find(l => l.includes('earned')) || `You earned $${summary.incomeEarned} from work.` });
  }

  if (summary.rentPaid > 0) {
    entries.push({ type: 'rent', text: summary.logEntries?.find(l => l.includes('Rent') || l.includes('rent') || l.includes('landlord')) || `Rent paid: $${summary.rentPaid}.` });
  }

  if (summary.energyGained > 0) {
    entries.push({ type: 'energy', text: `You got some rest. +${summary.energyGained} energy.` });
  }

  if (summary.newCards > 0) {
    entries.push({ type: 'card', text: 'Something happened while you were out. Check your inbox.' });
  }

  if (summary.expiredCards > 0) {
    entries.push({ type: 'expired', text: 'That opportunity passed. You missed a decision.' });
  }

  if (summary.happinessWarning) {
    entries.push({ type: 'warning', text: 'Your happiness dropped below 20. Things are rough.' });
  }

  // If nothing happened
  if (entries.length === 0) {
    entries.push({ type: 'energy', text: 'The city was quiet. Nothing much happened.' });
  }

  for (const entry of entries) {
    const icon = ICON_MAP[entry.type] || ICON_MAP.card;
    const card = document.createElement('div');
    card.className = 'digest-card';
    card.innerHTML = `
      <div class="digest-card__icon ${icon.class}">${icon.text}</div>
      <div class="digest-card__text">${entry.text}</div>
    `;
    cardsEl.appendChild(card);
  }

  // Action button
  const actionsEl = _el.querySelector('#digest-actions');
  actionsEl.innerHTML = '';

  const hasInbox = GameState && GameState.inbox && GameState.inbox.filter(i => !i.expired && !i.resolved).length > 0;
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = hasInbox ? "SEE WHAT'S WAITING" : 'GOT IT';
  btn.addEventListener('click', () => {
    if (hasInbox) {
      router.go('inbox', { nextScreen: 'explore' });
    } else {
      router.go('explore');
    }
  });
  actionsEl.appendChild(btn);
}

export function hide() {
  _el.classList.remove('active');
}
