/**
 * main.js
 * Entry point. Bootstraps the app.
 * Contains no game logic — just a bootstrap sequence.
 * Manages the HUD directly.
 */

import * as loader from './utils/loader.js';
import * as router from './utils/router.js';
import * as state from './game/state.js';
import * as idle from './game/idle.js';
import * as VNE from './engine/vne.js';
import * as coach from './game/coach.js';

import * as titleScreen from './screens/title.js';
import * as creationScreen from './screens/creation.js';
import * as digestScreen from './screens/digest.js';
import * as inboxScreen from './screens/inbox.js';
import * as plannerScreen from './screens/planner.js';
import * as exploreScreen from './screens/explore.js';
import * as endingScreen from './screens/ending.js';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
(async function boot() {
  // 1. Check localStorage availability
  if (!state.isStorageAvailable()) {
    const warningEl = document.getElementById('storage-warning');
    if (warningEl) warningEl.classList.remove('storage-warning--hidden');
  }

  // 2. Fetch all JSON data
  const data = await loader.fetchData();

  // 3. Load persisted settings and apply text speed
  const settings = state.loadSettings();
  VNE.setTextSpeed(settings.textSpeed);

  // 4. Register screens
  router.register('title', titleScreen);
  router.register('creation', creationScreen);
  router.register('digest', digestScreen);
  router.register('inbox', inboxScreen);
  router.register('planner', plannerScreen);
  router.register('explore', exploreScreen);
  router.register('ending', endingScreen);

  router.setData(data);
  router.initAll();

  // 5. Wire HUD settings button + help button + coach
  _initSettings();
  _initHelp();
  coach.init();
  router.onNavigate(() => coach.dismissSilent());

  // 6. Determine starting screen
  const savedState = state.load();

  if (!savedState) {
    // Fresh run — hide HUD, go to title
    document.getElementById('hud').classList.add('hud--hidden');
    document.body.classList.remove('hud-visible');
    router.go('title');
  } else {
    // Returning player — run idle
    const result = idle.calculate(savedState, data);
    state.setState(result.state);
    state.save();

    _updateHUD();
    document.getElementById('hud').classList.remove('hud--hidden');
    document.body.classList.add('hud-visible');

    // Skip digest if nothing happened (quick reopen)
    if (result.summary.gameDaysElapsed === 0 && result.summary.newCards === 0) {
      const pendingInbox = (result.state.inbox || []).filter(i => !i.expired && !i.resolved);
      if (pendingInbox.length > 0) {
        router.go('inbox', { nextScreen: 'explore' });
      } else {
        router.go('explore');
      }
    } else {
      router.go('digest', { summary: result.summary });
    }
  }

  // 7. Start HUD update loop (updates every 2 seconds)
  setInterval(_updateHUD, 2000);
})();

// ---------------------------------------------------------------------------
// HUD management
// ---------------------------------------------------------------------------
function _updateHUD() {
  const gs = state.GameState;
  if (!gs) return;

  // Week
  const weekEl = document.getElementById('hud-week');
  if (weekEl) weekEl.textContent = `WEEK ${String(gs.week).padStart(2, '0')}`;

  // Neighborhood
  const hoodEl = document.getElementById('hud-neighborhood');
  if (hoodEl) {
    try {
      const data = loader.getData();
      const hood = (data.neighborhoods || []).find(n => n.id === gs.neighborhood);
      hoodEl.textContent = hood ? hood.label : gs.neighborhood;
    } catch (_) {
      hoodEl.textContent = gs.neighborhood;
    }
  }

  // Money
  const MONEY_CAP = 5000;
  _updateStatBar('money', gs.money, MONEY_CAP, `$${gs.money.toLocaleString()}`);

  // Energy, Happiness, Clout (0-100)
  _updateStatBar('energy', gs.energy, 100, String(gs.energy));
  _updateStatBar('happiness', gs.happiness, 50, String(gs.happiness));
  _updateStatBar('clout', gs.clout, 50, String(gs.clout));

  // Money negative state
  const moneyBar = document.querySelector('.stat-bar[data-stat="money"]');
  if (moneyBar) {
    if (gs.money < 0) moneyBar.classList.add('stat-bar--money-negative');
    else moneyBar.classList.remove('stat-bar--money-negative');
  }
}

function _updateStatBar(stat, value, max, displayText) {
  const fill = document.getElementById(`stat-fill-${stat}`);
  const valEl = document.getElementById(`stat-value-${stat}`);
  if (fill) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    fill.style.width = `${pct}%`;
  }
  if (valEl) valEl.textContent = displayText;
}

// ---------------------------------------------------------------------------
// Stat delta floaters
// ---------------------------------------------------------------------------
export function showStatDeltas(effectObj) {
  if (!effectObj) return;
  const container = document.getElementById('delta-container');
  if (!container) return;

  const deltas = [];
  if (effectObj.money)     deltas.push({ stat: 'money',     val: effectObj.money,     label: `${effectObj.money > 0 ? '+' : ''}$${effectObj.money}` });
  if (effectObj.energy)    deltas.push({ stat: 'energy',    val: effectObj.energy,    label: `${effectObj.energy > 0 ? '+' : ''}${effectObj.energy} energy` });
  if (effectObj.happiness) deltas.push({ stat: 'happiness', val: effectObj.happiness, label: `${effectObj.happiness > 0 ? '+' : ''}${effectObj.happiness} happiness` });
  if (effectObj.clout)     deltas.push({ stat: 'clout',     val: effectObj.clout,     label: `${effectObj.clout > 0 ? '+' : ''}${effectObj.clout} clout` });

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

// ---------------------------------------------------------------------------
// Help / Codex
// ---------------------------------------------------------------------------
function _initHelp() {
  const helpBtn = document.getElementById('hud-help-btn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => coach.openCodex());
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function _initSettings() {
  const settingsBtn = document.getElementById('hud-settings-btn');
  const modal = document.getElementById('settings-modal');
  const closeBtn = document.getElementById('settings-close-btn');
  const slider = document.getElementById('text-speed-slider');
  const sliderValue = document.getElementById('text-speed-value');
  const resetBtn = document.getElementById('reset-game-btn');

  if (!settingsBtn || !modal) return;

  settingsBtn.addEventListener('click', () => {
    modal.classList.remove('settings-modal--hidden');
    // Sync slider with current setting
    const settings = state.loadSettings();
    if (slider) slider.value = settings.textSpeed;
    if (sliderValue) sliderValue.textContent = settings.textSpeed;
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('settings-modal--hidden');
    });
  }

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('settings-modal--hidden');
  });

  if (slider) {
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      if (sliderValue) sliderValue.textContent = val;
      VNE.setTextSpeed(val);
      state.saveSettings({ textSpeed: val });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // Show confirmation
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML = `
        <div class="confirm-box">
          <div class="confirm-box__title">Reset Game?</div>
          <div class="confirm-box__body">This will erase all save data. There is no undo.</div>
          <div class="confirm-box__actions">
            <button class="btn-ghost" id="reset-cancel">CANCEL</button>
            <button class="btn-danger" id="reset-confirm">ERASE EVERYTHING</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#reset-cancel').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#reset-confirm').addEventListener('click', () => {
        overlay.remove();
        modal.classList.add('settings-modal--hidden');
        state.reset();
        coach.reset();
        document.getElementById('hud').classList.add('hud--hidden');
        document.body.classList.remove('hud-visible');
        router.go('title');
      });
    });
  }
}
