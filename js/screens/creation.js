/**
 * screens/creation.js
 * Two-step character creation: choose class, then neighborhood.
 * Owns #screen-creation.
 */

import * as router from '../utils/router.js';
import { buildDefaultState, setState, save } from '../game/state.js';
import { getData } from '../utils/loader.js';
import * as VNE from '../engine/vne.js';
import * as coach from '../game/coach.js';

let _el = null;
let _step = 1;
let _selectedClass = null;
let _selectedHood = null;

const STAT_COLORS = {
  money:     'var(--color-money)',
  energy:    'var(--color-energy)',
  happiness: 'var(--color-happiness)',
  clout:     'var(--color-clout)',
};

const STAT_MAX = { money: 10000, energy: 100, happiness: 50, clout: 50 };

export function init() {
  _el = document.getElementById('screen-creation');
  _el.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'creation';
  wrapper.innerHTML = `
    <h1 class="creation__header" id="creation-header"></h1>
    <p class="creation__subheader" id="creation-subheader"></p>
    <div class="creation__cards" id="creation-cards"></div>
    <div class="creation__continue" id="creation-continue"></div>
  `;
  _el.appendChild(wrapper);
}

export function show() {
  _el.classList.add('active');
  _step = 1;
  _selectedClass = null;
  _selectedHood = null;
  _renderStep1();
}

export function hide() {
  _el.classList.remove('active');
}

function _renderStep1() {
  const data = getData();
  const classes = data.classes || [];

  _el.querySelector('#creation-header').textContent = 'WHERE ARE YOU FROM?';
  _el.querySelector('#creation-subheader').textContent =
    'Your background shapes your starting resources and hidden advantages.';

  const cardsEl = _el.querySelector('#creation-cards');
  cardsEl.innerHTML = '';

  for (const cls of classes) {
    const card = document.createElement('div');
    card.className = 'class-card';
    card.dataset.classId = cls.id;

    const stats = cls.startingStats;
    card.innerHTML = `
      <div class="class-card__accent-bar class-card__accent-bar--${cls.colorKey || cls.id}"></div>
      <div class="class-card__body">
        <div class="class-card__title">${cls.label}</div>
        <div class="class-card__subtitle">${cls.subtitle || ''}</div>
        <div class="class-card__stats">
          ${_statRow('Money', stats.money, STAT_MAX.money, STAT_COLORS.money)}
          ${_statRow('Energy', stats.energy, STAT_MAX.energy, STAT_COLORS.energy)}
          ${_statRow('Happy', stats.happiness, STAT_MAX.happiness, STAT_COLORS.happiness)}
          ${_statRow('Clout', stats.clout, STAT_MAX.clout, STAT_COLORS.clout)}
        </div>
        <div class="class-card__special">${cls.specialDescription}</div>
      </div>
    `;

    card.addEventListener('click', () => _selectClass(cls.id));
    cardsEl.appendChild(card);
  }

  const continueEl = _el.querySelector('#creation-continue');
  continueEl.innerHTML = '';
  continueEl.classList.remove('creation__continue--visible');

  setTimeout(() => coach.trigger('creation_class'), 200);
}

function _statRow(label, value, max, color) {
  const pct = Math.min(100, (value / max) * 100);
  const displayVal = label === 'Money' ? `$${value}` : value;
  return `
    <div class="class-card__stat">
      <span class="class-card__stat-label">${label}</span>
      <div class="class-card__stat-bar">
        <div class="class-card__stat-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="class-card__stat-value" style="color:${color}">${displayVal}</span>
    </div>
  `;
}

function _selectClass(classId) {
  _selectedClass = classId;
  const cards = _el.querySelectorAll('.class-card');
  cards.forEach(card => {
    if (card.dataset.classId === classId) {
      card.classList.add('class-card--selected');
      card.classList.remove('class-card--dimmed');
    } else {
      card.classList.remove('class-card--selected');
      card.classList.add('class-card--dimmed');
    }
  });

  const continueEl = _el.querySelector('#creation-continue');
  continueEl.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = 'CONTINUE';
  btn.addEventListener('click', () => {
    _step = 2;
    _renderStep2();
  });
  continueEl.appendChild(btn);
  continueEl.classList.add('creation__continue--visible');
}

function _renderStep2() {
  const data = getData();
  const hoods = data.neighborhoods || [];

  _el.querySelector('#creation-header').textContent = 'WHERE DO YOU LIVE?';
  _el.querySelector('#creation-subheader').textContent =
    'Each neighborhood shapes your weekly rhythm in different ways.';

  const cardsEl = _el.querySelector('#creation-cards');
  cardsEl.innerHTML = '';

  for (const hood of hoods) {
    const card = document.createElement('div');
    card.className = 'hood-card';
    card.dataset.hoodId = hood.id;

    const bonusText = `${hood.vibeBonus.stat} +${hood.vibeBonus.delta} / ${hood.vibeBonus.period}`;

    card.innerHTML = `
      <div class="hood-card__body">
        <div class="hood-card__name">${hood.label}</div>
        <div class="hood-card__borough">${hood.borough}</div>
        <div class="hood-card__rent">$${hood.weeklyRent} / week</div>
        <div class="hood-card__bonus">${bonusText}</div>
        <div class="hood-card__penalty">${hood.penalty.description}</div>
        <div class="hood-card__flavor">${hood.flavorText}</div>
      </div>
    `;

    card.addEventListener('click', () => _selectHood(hood.id));
    cardsEl.appendChild(card);
  }

  const continueEl = _el.querySelector('#creation-continue');
  continueEl.innerHTML = '';
  continueEl.classList.remove('creation__continue--visible');

  setTimeout(() => coach.trigger('creation_hood'), 200);
}

function _selectHood(hoodId) {
  _selectedHood = hoodId;
  const cards = _el.querySelectorAll('.hood-card');
  cards.forEach(card => {
    if (card.dataset.hoodId === hoodId) {
      card.classList.add('hood-card--selected');
      card.classList.remove('hood-card--dimmed');
    } else {
      card.classList.remove('hood-card--selected');
      card.classList.add('hood-card--dimmed');
    }
  });

  const continueEl = _el.querySelector('#creation-continue');
  continueEl.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = 'BEGIN YOUR STORY';
  btn.addEventListener('click', _beginGame);
  continueEl.appendChild(btn);
  continueEl.classList.add('creation__continue--visible');
}

function _beginGame() {
  const data = getData();
  const cls = (data.classes || []).find(c => c.id === _selectedClass);
  const hood = (data.neighborhoods || []).find(n => n.id === _selectedHood);

  if (!cls || !hood) return;

  const state = buildDefaultState(
    cls.id,
    hood.id,
    cls.startingJob,
    cls.startingStats,
    cls.unlocks
  );

  setState(state);
  save();

  // Play intro scene before first planner
  const introScene = {
    id: 'intro_arrival',
    background: 'apartment_day',
    characters: [],
    dialogue: [
      { speaker: 'narrator', text: 'The apartment is smaller than the photos.' },
      { speaker: 'narrator', text: "That's the first thing you notice. The second thing is the view — a brick wall, close enough to touch if the window opened all the way, which it doesn't." },
      { speaker: 'narrator', text: 'You found this place on a Thursday. You moved in on a Saturday. You had until Sunday to figure out the rest.' },
      { speaker: 'narrator', text: "Rent is due at the end of every week. The city doesn't do grace periods." },
      { speaker: 'narrator', text: "You have a job. You have a MetroCard. You have enough in your account to make this work, if you're careful." },
      { speaker: 'narrator', text: "You've been careful before." },
      { speaker: 'narrator', text: 'Welcome to New York.' },
    ],
    choices: null,
  };

  hide();

  VNE.play(introScene, () => {
    router.go('planner');
  });
}
