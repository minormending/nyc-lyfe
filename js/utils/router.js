/**
 * utils/router.js
 * Screen navigation. Maintains screen lifecycle (init/show/hide).
 * No URL hash routing — single-session game.
 */

/** @type {Map<string, object>} registered screen modules */
const _screens = new Map();

/** @type {string|null} currently active screen name */
let _currentScreen = null;

/** @type {Function[]} callbacks invoked on every navigation */
const _navCallbacks = [];

/** @type {object|null} data passed to init() calls */
let _appData = null;

/**
 * Registers a screen module. Each module must export init(data), show(params), hide().
 * @param {string} name
 * @param {object} module - { init, show, hide }
 */
export function register(name, module) {
  _screens.set(name, module);
}

/**
 * Stores the app-level data so screens can access it at init time.
 * @param {object} data
 */
export function setData(data) {
  _appData = data;
}

/**
 * Calls init(data) on all registered screens.
 * Should be called once at app startup after all screens are registered.
 */
export function initAll() {
  for (const [, module] of _screens) {
    if (typeof module.init === 'function') {
      module.init(_appData);
    }
  }
}

/**
 * Navigates to a screen.
 * Hides the current screen, shows the target screen.
 * @param {string} screenName
 * @param {object} [params] - passed to the target screen's show()
 */
export function go(screenName, params = {}) {
  const target = _screens.get(screenName);
  if (!target) {
    console.warn(`router.go: unknown screen '${screenName}'`);
    return;
  }

  for (const cb of _navCallbacks) cb(screenName);

  // Hide current screen
  if (_currentScreen && _currentScreen !== screenName) {
    const current = _screens.get(_currentScreen);
    if (current && typeof current.hide === 'function') {
      current.hide();
    }
  }

  _currentScreen = screenName;

  // Show target screen
  if (typeof target.show === 'function') {
    target.show(params);
  }
}

/**
 * Returns the name of the currently active screen.
 * @returns {string|null}
 */
export function current() {
  return _currentScreen;
}

/**
 * Registers a callback invoked on every navigation.
 * @param {Function} fn
 */
export function onNavigate(fn) {
  _navCallbacks.push(fn);
}
