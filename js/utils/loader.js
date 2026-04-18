/**
 * utils/loader.js
 * Fetches all JSON data files and caches them in memory.
 * Handles fetch errors gracefully — logs warning, continues with empty array.
 */

const DATA_FILES = [
  'classes',
  'neighborhoods',
  'jobs',
  'activities',
  'city_cards',
  'opportunity_cards',
  'npc_arcs',
];

/** In-memory cache so we never fetch twice */
let _cache = null;

/**
 * Fetches all /data/*.json files in parallel.
 * Returns a single data object keyed by filename stem.
 * On any individual failure, that key is an empty array and a warning is logged.
 * @returns {Promise<object>}
 */
export async function fetchData() {
  if (_cache) return _cache;

  const results = await Promise.allSettled(
    DATA_FILES.map(name =>
      fetch(`./data/${name}.json`)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(data => ({ name, data }))
    )
  );

  const out = {};
  for (const result of results) {
    if (result.status === 'fulfilled') {
      out[result.value.name] = result.value.data;
    } else {
      const name = DATA_FILES[results.indexOf(result)];
      console.warn(`loader.fetchData: failed to load ${name}.json`, result.reason);
      out[name] = [];
    }
  }

  _cache = out;
  return out;
}

/**
 * Preloads background and portrait images for a list of upcoming scenes.
 * Failures are silently ignored — the game must not crash on missing assets.
 * @param {object[]} scenes - array of scene objects
 * @returns {Promise<void>}
 */
export async function preloadAssets(scenes) {
  const bgPaths = new Set();
  const portraitPaths = new Set();

  for (const scene of scenes) {
    if (scene.background) {
      bgPaths.add(`./assets/bg/${scene.background}.jpg`);
    }
    if (Array.isArray(scene.characters)) {
      for (const char of scene.characters) {
        portraitPaths.add(`./assets/portraits/${char.id}_${char.expression || 'neutral'}.png`);
        portraitPaths.add(`./assets/portraits/${char.id}_neutral.png`);
      }
    }
  }

  const allPaths = [...bgPaths, ...portraitPaths];

  await Promise.allSettled(
    allPaths.map(path => new Promise(resolve => {
      const img = new Image();
      img.onload  = resolve;
      img.onerror = resolve; // fail silently
      img.src = path;
    }))
  );
}

/**
 * Returns the cached data. Throws if fetchData() hasn't been called yet.
 * @returns {object}
 */
export function getData() {
  if (!_cache) throw new Error('loader.getData: fetchData() has not been called yet');
  return _cache;
}
