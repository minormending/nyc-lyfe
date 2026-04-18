/**
 * game/state.js
 * Single source of truth for all game state.
 * No module writes directly to GameState properties.
 * All mutations go through effects.js.
 */

const VERSION = '1.0';

const LS_SAVE_KEY    = 'nyc_save';
const LS_SETTINGS_KEY = 'nyc_settings';
const LS_VERSION_KEY  = 'nyc_version';

/** @type {boolean} whether localStorage is available this session */
let _storageAvailable = false;

function _checkStorage() {
  try {
    const t = '__test__';
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    _storageAvailable = true;
  } catch (_) {
    _storageAvailable = false;
  }
}

_checkStorage();

/**
 * Returns true if localStorage is usable.
 * @returns {boolean}
 */
export function isStorageAvailable() {
  return _storageAvailable;
}

/**
 * Builds the default GameState for a fresh run.
 * @param {string} backgroundId  - class id ('immigrant'|'middle'|'rich')
 * @param {string} neighborhoodId
 * @param {string} jobId
 * @param {object} startingStats  - { money, energy, happiness, clout }
 * @param {string[]} unlocks
 * @returns {object} GameState
 */
export function buildDefaultState(backgroundId, neighborhoodId, jobId, startingStats, unlocks = []) {
  const now = Date.now();

  // Default routine: work Mon-Fri morning, rest of slots empty
  const routine = [];
  for (let day = 1; day <= 7; day++) {
    for (const slot of ['morning', 'afternoon', 'evening']) {
      routine.push({
        day,
        slot,
        activity: (day <= 5 && (slot === 'morning' || slot === 'afternoon')) ? 'work' : null,
      });
    }
  }

  return {
    version: VERSION,
    background: backgroundId,
    neighborhood: neighborhoodId,
    job: jobId,
    unlocks: [...unlocks],

    money:     startingStats.money,
    energy:    startingStats.energy,
    happiness: startingStats.happiness,
    clout:     startingStats.clout,

    week:          1,
    lastLogin:     now,
    lastRentTick:  now,

    routine,
    inbox: [],

    npcs: {
      carlos: { arc: 0, scenesPlayed: [] },
      priya:  { arc: 0, scenesPlayed: [] },
      dima:   { arc: 0, scenesPlayed: [] },
      jordan: { arc: 0, scenesPlayed: [] },
    },

    log: [],
    textSpeed: 28,
  };
}

/**
 * The live GameState object shared across the session.
 * Initialised to null; populated by load() or reset().
 * @type {object|null}
 */
export let GameState = null;

/**
 * Reads GameState from localStorage.
 * Returns null on a fresh run or version mismatch.
 * @returns {object|null}
 */
export function load() {
  if (!_storageAvailable) return null;

  try {
    const savedVersion = localStorage.getItem(LS_VERSION_KEY);
    if (savedVersion !== VERSION) return null;

    const raw = localStorage.getItem(LS_SAVE_KEY);
    if (!raw) return null;

    GameState = JSON.parse(raw);
    return GameState;
  } catch (e) {
    console.warn('state.load: failed to parse save data', e);
    return null;
  }
}

/**
 * Serialises current GameState to localStorage.
 */
export function save() {
  if (!_storageAvailable || !GameState) return;

  try {
    localStorage.setItem(LS_VERSION_KEY, VERSION);
    localStorage.setItem(LS_SAVE_KEY, JSON.stringify(GameState));
  } catch (e) {
    console.warn('state.save: failed to write to localStorage', e);
  }
}

/**
 * Clears localStorage and returns a blank GameState placeholder.
 * Callers should call buildDefaultState() + setState() then save().
 */
export function reset() {
  if (_storageAvailable) {
    try {
      localStorage.removeItem(LS_SAVE_KEY);
      localStorage.removeItem(LS_VERSION_KEY);
    } catch (_) {}
  }
  GameState = null;
  return null;
}

/**
 * Replaces the live GameState with a new object.
 * Used after buildDefaultState or after effects.apply returns a new state.
 * @param {object} newState
 */
export function setState(newState) {
  GameState = newState;
}

/**
 * Loads persisted settings (text speed, etc.) independent of save data.
 * @returns {object}
 */
export function loadSettings() {
  const defaults = { textSpeed: 28 };
  if (!_storageAvailable) return defaults;

  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch (_) {
    return defaults;
  }
}

/**
 * Persists settings.
 * @param {object} settings
 */
export function saveSettings(settings) {
  if (!_storageAvailable) return;
  try {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
  } catch (_) {}
}
