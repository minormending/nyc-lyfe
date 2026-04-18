/**
 * screens/inbox.js
 * Decision inbox — list of pending event cards.
 * Each card resolution launches a VNE scene.
 * Owns #screen-inbox.
 */

import * as router from '../utils/router.js';
import { GameState, setState, save } from '../game/state.js';
import { getData } from '../utils/loader.js';
import * as events from '../game/events.js';
import * as effects from '../game/effects.js';
import * as npcs from '../game/npcs.js';
import * as VNE from '../engine/vne.js';
import * as coach from '../game/coach.js';

let _el = null;
let _nextScreen = 'planner'; // where to go after inbox is cleared

export function init() {
  _el = document.getElementById('screen-inbox');
  _el.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'inbox';
  wrapper.innerHTML = `
    <div class="inbox__header">
      <h1 class="inbox__title">YOUR INBOX</h1>
      <span class="inbox__count" id="inbox-count">0</span>
    </div>
    <p class="inbox__subheader">Resolve everything before you can plan your week.</p>
    <div class="inbox__list" id="inbox-list"></div>
    <div class="center" id="inbox-actions"></div>
  `;
  _el.appendChild(wrapper);
}

export function show(params = {}) {
  _el.classList.add('active');
  _nextScreen = params.nextScreen || 'planner';

  // Show HUD
  document.getElementById('hud').classList.remove('hud--hidden');
  document.body.classList.add('hud-visible');

  _render();

  setTimeout(() => coach.trigger('inbox_intro'), 200);
}

export function hide() {
  _el.classList.remove('active');
}

function _render() {
  const data = getData();
  const inbox = GameState ? GameState.inbox : [];
  const pendingItems = inbox.filter(item => !item.expired && !item.resolved);

  _el.querySelector('#inbox-count').textContent = pendingItems.length;

  const listEl = _el.querySelector('#inbox-list');
  listEl.innerHTML = '';

  const actionsEl = _el.querySelector('#inbox-actions');
  actionsEl.innerHTML = '';

  if (pendingItems.length === 0) {
    listEl.innerHTML = `
      <div class="inbox__empty">
        All clear. The city's been kind. ☮
      </div>
    `;
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = _nextScreen === 'explore' ? 'CONTINUE' : 'PLAN YOUR WEEK';
    btn.addEventListener('click', () => router.go(_nextScreen));
    actionsEl.appendChild(btn);
    return;
  }

  for (const item of pendingItems) {
    const card = _findSceneObject(item.sceneId, data);
    const cardEl = document.createElement('div');
    cardEl.className = 'inbox-card';

    const deckBadge = item.deck === 'opportunity'
      ? '<span class="badge badge--opportunity">OPPORTUNITY</span>'
      : '<span class="badge badge--city">CITY EVENT</span>';

    let ttlBadge = '';
    if (item.ttlDays) {
      const ageMs = Date.now() - item.arrivedAt;
      const daysLeft = Math.max(0, Math.ceil(item.ttlDays - (ageMs / 86400000)));
      ttlBadge = `<span class="badge badge--expiring">EXPIRES IN ${daysLeft} DAY${daysLeft !== 1 ? 'S' : ''}</span>`;
    }

    const title = card ? card.title || card.id : item.sceneId;
    const teaser = card ? (card.teaser || (card.dialogue && card.dialogue[0]?.text) || '') : '';

    cardEl.innerHTML = `
      <div class="inbox-card__top">
        ${deckBadge}
        <span class="inbox-card__title">${title}</span>
        ${ttlBadge}
      </div>
      <div class="inbox-card__teaser">${teaser}</div>
      <div class="inbox-card__resolve">
        <button class="btn-primary">RESOLVE →</button>
      </div>
    `;

    cardEl.querySelector('button').addEventListener('click', () => {
      _resolveCard(item, card);
    });

    listEl.appendChild(cardEl);
  }
}

function _findSceneObject(sceneId, data) {
  // Search event cards first
  let card = events.findCard(sceneId, data);
  if (card) return card;

  // Search NPC arc scenes
  const arcScene = npcs.findArcScene(sceneId, data.npc_arcs || []);
  if (arcScene) return arcScene;

  return null;
}

function _resolveCard(inboxItem, card) {
  if (!card) {
    // No scene data found — just remove from inbox
    _removeFromInbox(inboxItem.sceneId);
    _render();
    return;
  }

  hide();

  // Hide HUD during VNE
  document.getElementById('hud').classList.add('hud--hidden');
  document.body.classList.remove('hud-visible');

  VNE.play(card, (choiceIndex) => {
    const data = getData();

    // Apply effects from chosen option
    if (choiceIndex >= 0 && card.choices && card.choices[choiceIndex]) {
      const effectObj = card.choices[choiceIndex].effects || {};
      const newState = effects.apply(effectObj, GameState, data);
      setState(newState);
    }

    // Apply non-choice scene effects (like arc scenes with auto-effects)
    if (card.onComplete === 'npcArcComplete') {
      // Arc completion effects are handled by the effects in choices
      // or are automatic (like clout +5 for carlos_arc_3)
    }

    // Record card as drawn
    events.recordDrawn(inboxItem.sceneId, GameState);

    // Remove from inbox
    _removeFromInbox(inboxItem.sceneId);
    save();

    // Show HUD again
    document.getElementById('hud').classList.remove('hud--hidden');
    document.body.classList.add('hud-visible');

    // Show inbox again
    show();
  });
}

function _removeFromInbox(sceneId) {
  if (!GameState) return;
  GameState.inbox = GameState.inbox.filter(item => item.sceneId !== sceneId);
}
