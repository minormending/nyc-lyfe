/**
 * screens/title.js
 * Title screen with new game / continue logic.
 * Owns #screen-title.
 */

import * as router from '../utils/router.js';
import { GameState, reset } from '../game/state.js';
import * as coach from '../game/coach.js';

const FLAVOR_TEXTS = [
  "The city doesn't care about your five-year plan.",
  "Eight million people. You are one of them.",
  "Rent is due Sunday.",
  "The bodega is always open.",
  "You said you'd leave after two years. That was four years ago.",
  "The L train is delayed. The L train is always delayed.",
];

let _el = null;

export function init() {
  _el = document.getElementById('screen-title');
  _el.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'title';

  wrapper.innerHTML = `
    <div class="title__wordmark">NYC</div>
    <div class="title__subtitle">Slice of Life</div>
    <div class="title__flavor text-italic"></div>
    <div class="title__actions"></div>
    <div class="title__version">v1.0.0</div>
  `;

  _el.appendChild(wrapper);
}

export function show() {
  _el.classList.add('active');

  // Random flavor text
  const flavorEl = _el.querySelector('.title__flavor');
  flavorEl.textContent = FLAVOR_TEXTS[Math.floor(Math.random() * FLAVOR_TEXTS.length)];

  // Build action buttons based on save state
  const actionsEl = _el.querySelector('.title__actions');
  actionsEl.innerHTML = '';

  if (GameState) {
    // Returning player
    const continueBtn = document.createElement('button');
    continueBtn.className = 'btn-primary';
    continueBtn.textContent = 'CONTINUE';
    continueBtn.addEventListener('click', () => {
      router.go('digest');
    });

    const newBtn = document.createElement('button');
    newBtn.className = 'btn-ghost';
    newBtn.textContent = 'NEW GAME';
    newBtn.addEventListener('click', _confirmNewGame);

    actionsEl.appendChild(continueBtn);
    actionsEl.appendChild(newBtn);
  } else {
    // Fresh run
    const startBtn = document.createElement('button');
    startBtn.className = 'btn-primary';
    startBtn.textContent = 'START YOUR STORY';
    startBtn.addEventListener('click', () => {
      router.go('creation');
    });

    actionsEl.appendChild(startBtn);
  }

  const helpBtn = document.createElement('button');
  helpBtn.className = 'btn-ghost';
  helpBtn.textContent = 'HOW TO PLAY';
  helpBtn.addEventListener('click', () => coach.openCodex());
  actionsEl.appendChild(helpBtn);
}

export function hide() {
  _el.classList.remove('active');
}

function _confirmNewGame() {
  // Confirmation dialog
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-box__title">Start Over?</div>
      <div class="confirm-box__body">This will erase your current save. There is no undo.</div>
      <div class="confirm-box__actions">
        <button class="btn-ghost" id="confirm-cancel">CANCEL</button>
        <button class="btn-danger" id="confirm-reset">ERASE & START</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#confirm-cancel').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('#confirm-reset').addEventListener('click', () => {
    overlay.remove();
    reset();
    router.go('creation');
  });
}
