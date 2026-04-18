/**
 * screens/explore.js
 * Free explore — NPC panel, progress panel, city pulse panel.
 * Primary exit point of each session.
 * Owns #screen-explore.
 */

import * as router from '../utils/router.js';
import { GameState, save } from '../game/state.js';
import { getData } from '../utils/loader.js';
import * as npcsMod from '../game/npcs.js';
import * as coach from '../game/coach.js';

const CITY_HEADLINES = [
  "MTA Promises Signal Upgrades By 2027. Again.",
  "Williamsburg Gains Third Matcha Bar, Loses Last Laundromat",
  "City Council Debates Adding 'Emotional Toll' To Bridge Fares",
  "Bodega Cat Named Official Borough Mascot, Queens Rejoices",
  "Midtown Office Tower Converts To Luxury Condos, No One Surprised",
  "Record Number Of New Yorkers Claim To Be 'Just Visiting'",
  "Subway Rat Reportedly On Second Term, Sources Say",
  "Man On L Train Has Not Made Eye Contact Since 2019",
  "Queens Residents Ask If They Can Have A Fourth Borough President",
  "Con Edison Raises Rates, Cites 'The Vibes'",
  "Prospect Park Jogger Logs Fastest Half-Marathon In History, Still Late For Work",
  "Landlord Installs 'Artisanal' Mailboxes, Raises Rent 18%",
  "City Adds 400 New Citi Bikes. All Of Them In Already Bike-Heavy Areas.",
  "New Yorkers Report Strange Sensation Of Being In Good Mood, Attribute To Weather",
  "SoHo Pop-Up Closes After Two Weeks, Opens As Different Pop-Up",
  "Astoria Diner Menu Unchanged Since 1987, Owner 'Not Seeing The Problem'",
  "Tourists Mistake Film Crew For Actual Emergency, Film Crew Not Sure Either",
  "Study Finds New Yorkers Walk 23% Faster When They Have Nowhere To Be",
  "Local Man Insists His Neighborhood Is 'Still Affordable' While Paying $3,200",
  "JFK Runway Delay Blamed On Geese. Geese Unavailable For Comment.",
];

const SEASONS = ['Winter', 'Early spring', 'Spring', 'Late spring', 'Early summer', 'Summer',
                 'Late summer', 'Early autumn', 'Autumn', 'Late autumn', 'Early winter', 'Winter'];

const WEATHER_LINES = [
  "It's getting crisp.",
  "The sun is doing what it can.",
  "Rain is expected. Rain is always expected.",
  "The humidity has opinions.",
  "Perfect hoodie weather.",
  "The kind of day that makes you forget you have problems. Briefly.",
];

const TIPS = [
  "Rest slots don't cost money. They cost pride.",
  "Social hangouts boost happiness more than you'd think.",
  "Don't ignore your inbox — expired cards resolve badly.",
  "Carlos remembers when you're kind. So does Jordan.",
  "Freelance work is good money but watch your energy.",
  "Your neighborhood bonus applies every week, quietly.",
  "Promotions require time and meeting stat thresholds.",
  "The gym is an investment. The returns come next week.",
];

let _el = null;
let _npcModalEl = null;

export function init() {
  _el = document.getElementById('screen-explore');
  _el.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'explore';
  wrapper.innerHTML = `
    <h1 class="explore__header" id="explore-header"></h1>
    <div class="explore__panels" id="explore-panels"></div>
    <div class="explore__footer" id="explore-footer"></div>
  `;
  _el.appendChild(wrapper);

  // NPC detail modal
  _npcModalEl = document.createElement('div');
  _npcModalEl.className = 'npc-modal npc-modal--hidden';
  document.body.appendChild(_npcModalEl);
}

let _weekSummary = null;

export function show(params = {}) {
  _el.classList.add('active');
  _weekSummary = params.weekSummary || null;

  // Show HUD
  document.getElementById('hud').classList.remove('hud--hidden');
  document.body.classList.add('hud-visible');

  _render();

  setTimeout(() => coach.trigger('explore_intro'), 200);
}

export function hide() {
  _el.classList.remove('active');
}

function _render() {
  if (!GameState) return;
  const data = getData();
  const neighborhood = (data.neighborhoods || []).find(n => n.id === GameState.neighborhood);
  const hoodLabel = neighborhood ? neighborhood.label : GameState.neighborhood;

  _el.querySelector('#explore-header').innerHTML =
    `${hoodLabel} <span>— WEEK ${GameState.week}</span>`;

  const panelsEl = _el.querySelector('#explore-panels');
  panelsEl.innerHTML = '';

  if (_weekSummary) {
    panelsEl.appendChild(_buildWeekSummary(_weekSummary, data));
  }
  panelsEl.appendChild(_buildNpcPanel(data));
  panelsEl.appendChild(_buildProgressPanel(data));
  panelsEl.appendChild(_buildPulsePanel(data, neighborhood));

  // Footer buttons
  const footerEl = _el.querySelector('#explore-footer');
  footerEl.innerHTML = '';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn-primary';
  nextBtn.textContent = 'NEXT WEEK';
  nextBtn.addEventListener('click', () => {
    router.go('planner');
  });
  footerEl.appendChild(nextBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-ghost';
  closeBtn.textContent = 'SAVE & QUIT';
  closeBtn.addEventListener('click', () => {
    save();
    document.getElementById('hud').classList.add('hud--hidden');
    document.body.classList.remove('hud-visible');
    router.go('title');
  });
  footerEl.appendChild(closeBtn);
}

// ---- NPC Panel ----
// ---- Week Summary Panel ----
function _buildWeekSummary(summary, data) {
  const panel = document.createElement('div');
  panel.className = 'card';
  panel.style.gridColumn = '1 / -1'; // full width

  const netChange = summary.endMoney - summary.startMoney;
  const sign = netChange >= 0 ? '+' : '';
  const color = netChange >= 0 ? 'var(--color-money)' : '#e05555';

  panel.innerHTML = `
    <div class="progress-panel__title">WEEK ${Math.max(1, GameState.week - 1)} RECAP</div>
    <div class="progress-row">
      <span class="progress-row__label">Started with</span>
      <span class="progress-row__value" style="color:var(--color-text-primary)">$${summary.startMoney.toLocaleString()}</span>
    </div>
    <div class="progress-row">
      <span class="progress-row__label">Ended with</span>
      <span class="progress-row__value" style="color:${GameState.money < 0 ? '#e05555' : 'var(--color-money)'}">$${summary.endMoney.toLocaleString()}</span>
    </div>
    <div class="progress-row" style="border-top:1px solid var(--color-border);padding-top:var(--space-sm);margin-top:var(--space-sm)">
      <span class="progress-row__label" style="font-weight:bold">Net change</span>
      <span class="progress-row__value" style="color:${color};font-size:16px">${sign}$${netChange.toLocaleString()}</span>
    </div>
  `;

  return panel;
}

// ---- NPC Panel ----
function _buildNpcPanel(data) {
  const panel = document.createElement('div');
  panel.className = 'card';
  panel.innerHTML = '<div class="npc-panel__title">YOUR PEOPLE</div>';

  const npcArcs = data.npc_arcs || [];
  for (const npc of npcArcs) {
    const status = npcsMod.getStatus(npc.id, GameState, npc);

    const row = document.createElement('div');
    row.className = 'npc-row';

    const avatarColor = npc.accentColor || '#F4A623';
    const initial = (npc.label || npc.id).charAt(0).toUpperCase();

    row.innerHTML = `
      <div class="npc-row__avatar" style="background:${avatarColor}">${initial}</div>
      <div class="npc-row__info">
        <div class="npc-row__name">${npc.label} <span class="rel-pill rel-pill--${status.relationship}">${status.relationship.toUpperCase()}</span></div>
        <div class="npc-row__role">${npc.role}</div>
        ${status.nextStage ? `<div class="npc-row__hint">Next: ${status.nextStage.relationship} (stage ${status.nextStage.threshold})</div>` : ''}
      </div>
    `;

    row.addEventListener('click', () => _showNpcModal(npc, status));
    panel.appendChild(row);
  }

  return panel;
}

// ---- Progress Panel ----
function _buildProgressPanel(data) {
  const panel = document.createElement('div');
  panel.className = 'card';

  const job = (data.jobs || []).find(j => j.id === GameState.job);
  const neighborhood = (data.neighborhoods || []).find(n => n.id === GameState.neighborhood);
  const weekPct = Math.round((GameState.week / 52) * 100);

  const recentLog = (GameState.log || []).slice(0, 5);

  panel.innerHTML = `
    <div class="progress-panel__title">YOUR STORY</div>
    <div class="progress-row">
      <span class="progress-row__label">${GameState.week} of 52 weeks in NYC</span>
    </div>
    <div class="progress-bar">
      <div class="progress-bar__fill" style="width:${weekPct}%"></div>
    </div>
    <div class="progress-row">
      <span class="progress-row__label">Job</span>
      <span class="progress-row__value">${job ? job.label : '—'} ${job ? `($${job.weeklyPay}/wk)` : ''}</span>
    </div>
    <div class="progress-row">
      <span class="progress-row__label">Neighborhood</span>
      <span class="progress-row__value">${neighborhood ? neighborhood.label : '—'} ${neighborhood ? `($${neighborhood.weeklyRent}/wk)` : ''}</span>
    </div>
    <div class="progress-row">
      <span class="progress-row__label">Savings</span>
      <span class="progress-row__value" style="color:${GameState.money >= 0 ? 'var(--color-money)' : '#e05555'}">$${GameState.money.toLocaleString()}</span>
    </div>
    <div class="progress-log">
      ${recentLog.map(entry => `<div class="progress-log__entry">Wk ${entry.week}: ${entry.text}</div>`).join('')}
    </div>
  `;

  return panel;
}

// ---- City Pulse Panel ----
function _buildPulsePanel(data, neighborhood) {
  const panel = document.createElement('div');
  panel.className = 'card';

  const week = GameState ? GameState.week : 1;
  const seasonIdx = Math.floor(((week - 1) / 52) * 12) % 12;
  const season = SEASONS[seasonIdx];
  const weather = WEATHER_LINES[week % WEATHER_LINES.length];

  const observations = neighborhood?.neighborhoodObservations || [];
  const observation = observations.length > 0
    ? observations[week % observations.length]
    : 'The city hums along.';

  const headline = CITY_HEADLINES[week % CITY_HEADLINES.length];

  // Contextual tip
  let tip = TIPS[week % TIPS.length];
  if (GameState && GameState.energy < 30) tip = "Rest slots don't cost money. They cost pride.";
  if (GameState && GameState.money < 200) tip = "Extra shifts are always available. Your body will have opinions.";

  panel.innerHTML = `
    <div class="pulse-panel__title">THE CITY</div>
    <div class="pulse-item">
      <div class="pulse-item__label">Weather</div>
      <div class="pulse-item__text">${season}. ${weather}</div>
    </div>
    <div class="pulse-item">
      <div class="pulse-item__label">Neighborhood</div>
      <div class="pulse-item__text pulse-item__text--italic">${observation}</div>
    </div>
    <div class="pulse-item">
      <div class="pulse-item__label">Headlines</div>
      <div class="pulse-item__text">${headline}</div>
    </div>
    <div class="pulse-item">
      <div class="pulse-item__label">Tip</div>
      <div class="pulse-item__text pulse-item__text--italic">${tip}</div>
    </div>
  `;

  return panel;
}

// ---- NPC Modal ----
function _showNpcModal(npc, status) {
  const scenesPlayed = status.scenesPlayed || [];
  const allScenes = npc.scenes || [];

  let scenesHtml = '';
  for (const sceneEntry of allScenes) {
    const played = scenesPlayed.includes(sceneEntry.sceneId);
    scenesHtml += `<div class="npc-modal__scene ${played ? '' : 'npc-modal__scene--locked'}">
      ${played ? sceneEntry.sceneId.replace(/_/g, ' ') : `??? (stage ${sceneEntry.stageRequired})`}
    </div>`;
  }

  _npcModalEl.innerHTML = `
    <div class="npc-modal__panel">
      <button class="npc-modal__close" id="npc-modal-close">✕</button>
      <div class="npc-modal__name">${npc.label}</div>
      <div class="npc-modal__role">${npc.role} · Arc: ${status.arc}/10 · <span class="rel-pill rel-pill--${status.relationship}">${status.relationship.toUpperCase()}</span></div>
      <div class="npc-modal__scenes-title">History</div>
      ${scenesHtml || '<div class="npc-modal__scene npc-modal__scene--locked">No interactions yet.</div>'}
    </div>
  `;

  _npcModalEl.classList.remove('npc-modal--hidden');

  _npcModalEl.querySelector('#npc-modal-close').addEventListener('click', () => {
    _npcModalEl.classList.add('npc-modal--hidden');
  });

  _npcModalEl.addEventListener('click', (e) => {
    if (e.target === _npcModalEl) _npcModalEl.classList.add('npc-modal--hidden');
  });
}
