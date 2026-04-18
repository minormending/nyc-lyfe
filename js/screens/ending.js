/**
 * screens/ending.js
 * Year-end summary. Shows how the player's year in NYC went.
 * Owns #screen-ending.
 */

import * as router from '../utils/router.js';
import { GameState, reset } from '../game/state.js';
import { getData } from '../utils/loader.js';
import * as npcsMod from '../game/npcs.js';

let _el = null;

const VERDICTS = [
  { minScore: 80, text: "You didn't just survive — you made a life here. The city noticed." },
  { minScore: 60, text: "It wasn't easy. But you're still standing, and the city respects that." },
  { minScore: 40, text: "Some weeks were good. Some were hard. You kept going. That counts." },
  { minScore: 20, text: "It's been a rough year. But you're still here. That's not nothing." },
  { minScore: 0,  text: "The city chewed you up. But you didn't leave. There's next year." },
];

export function init() {
  _el = document.getElementById('screen-ending');
}

export function show() {
  _el.classList.add('active');

  // Hide HUD for the ending
  document.getElementById('hud').classList.add('hud--hidden');
  document.body.classList.remove('hud-visible');

  _render();
}

export function hide() {
  _el.classList.remove('active');
}

function _render() {
  if (!GameState) return;
  const data = getData();
  const job = (data.jobs || []).find(j => j.id === GameState.job);
  const neighborhood = (data.neighborhoods || []).find(n => n.id === GameState.neighborhood);
  const npcArcs = data.npc_arcs || [];

  // Calculate a rough score
  let score = 0;
  score += Math.min(30, Math.floor(GameState.money / 200)); // up to 30 from savings
  score += GameState.happiness;                              // up to 50
  score += Math.floor(GameState.clout / 2);                  // up to 25

  // NPC relationships
  let alliesCount = 0;
  const npcSummaries = [];
  for (const npc of npcArcs) {
    const status = npcsMod.getStatus(npc.id, GameState, npc);
    npcSummaries.push({ label: npc.label, relationship: status.relationship, arc: status.arc });
    if (status.relationship === 'ally') {
      alliesCount++;
      score += 10;
    }
  }

  score = Math.min(100, Math.max(0, score));
  const verdict = VERDICTS.find(v => score >= v.minScore) || VERDICTS[VERDICTS.length - 1];

  _el.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'ending';

  wrapper.innerHTML = `
    <h1 class="ending__title">ONE YEAR IN NEW YORK</h1>
    <p class="ending__verdict">${verdict.text}</p>

    <div class="ending__stats">
      <div class="ending__stat">
        <span class="ending__stat-label">Final savings</span>
        <span class="ending__stat-value" style="color:${GameState.money >= 0 ? 'var(--color-money)' : '#e05555'}">$${GameState.money.toLocaleString()}</span>
      </div>
      <div class="ending__stat">
        <span class="ending__stat-label">Job</span>
        <span class="ending__stat-value">${job ? job.label : '—'}</span>
      </div>
      <div class="ending__stat">
        <span class="ending__stat-label">Neighborhood</span>
        <span class="ending__stat-value">${neighborhood ? neighborhood.label : '—'}</span>
      </div>
      <div class="ending__stat">
        <span class="ending__stat-label">Happiness</span>
        <span class="ending__stat-value" style="color:var(--color-happiness)">${GameState.happiness} / 50</span>
      </div>
      <div class="ending__stat">
        <span class="ending__stat-label">Clout</span>
        <span class="ending__stat-value" style="color:var(--color-clout)">${GameState.clout} / 50</span>
      </div>
      <div class="ending__stat">
        <span class="ending__stat-label">Allies</span>
        <span class="ending__stat-value">${alliesCount} / 4</span>
      </div>
    </div>

    <div class="ending__people">
      <h2 class="ending__section-title">YOUR PEOPLE</h2>
      ${npcSummaries.map(n => `
        <div class="ending__npc">
          <span class="ending__npc-name">${n.label}</span>
          <span class="rel-pill rel-pill--${n.relationship}">${n.relationship.toUpperCase()}</span>
        </div>
      `).join('')}
    </div>

    <div class="ending__score">
      <div class="ending__score-label">YOUR YEAR</div>
      <div class="ending__score-value">${score}<span class="ending__score-max"> / 100</span></div>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'ending__actions';

  const againBtn = document.createElement('button');
  againBtn.className = 'btn-primary';
  againBtn.textContent = 'PLAY AGAIN';
  againBtn.addEventListener('click', () => {
    reset();
    router.go('title');
  });
  actions.appendChild(againBtn);

  wrapper.appendChild(actions);
  _el.appendChild(wrapper);
}
