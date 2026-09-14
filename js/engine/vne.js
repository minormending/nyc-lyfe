/**
 * engine/vne.js
 * Visual Novel Engine — renders scenes, handles dialogue and choices.
 * Stateless: receives scene objects, calls back when done.
 * Owns #vne-container. No other module touches it.
 */

/** NPC accent colors for portrait placeholders */
const CHAR_COLORS = {
  carlos: '#A0522D',
  priya:  '#6090C0',
  dima:   '#4A7C59',
  jordan: '#9C5A3C',
  player: '#F4A623',
};

let _container = null;
let _textSpeed = 28;
let _onComplete = null;
let _scene = null;
let _lineIndex = 0;
let _typing = false;
let _typingTimer = null;
let _fullLineText = '';
let _awaitingAdvance = false;
let _choicesShown = false;

// DOM refs built in _buildDOM
let _bg = null;
let _sceneEl = null;
let _dialogueBox = null;
let _textEl = null;
let _nameplateEl = null;
let _advanceHint = null;
let _choicesEl = null;
let _fadeEl = null;
let _srTranscript = null;
let _portraits = {};

function _buildDOM() {
  _container = document.getElementById('vne-container');
  _container.innerHTML = '';

  _bg = document.createElement('div');
  _bg.className = 'vne-bg';

  _sceneEl = document.createElement('div');
  _sceneEl.className = 'vne-scene';

  _nameplateEl = document.createElement('div');
  _nameplateEl.className = 'vne-nameplate';

  _dialogueBox = document.createElement('div');
  _dialogueBox.className = 'vne-dialogue';

  _textEl = document.createElement('div');
  _textEl.className = 'vne-text';
  _textEl.setAttribute('role', 'log');

  _advanceHint = document.createElement('div');
  _advanceHint.className = 'vne-advance-hint';

  _dialogueBox.appendChild(_textEl);
  _dialogueBox.appendChild(_advanceHint);

  _choicesEl = document.createElement('div');
  _choicesEl.className = 'vne-choices vne-choices--hidden';

  _fadeEl = document.createElement('div');
  _fadeEl.className = 'vne-fade';

  _srTranscript = document.createElement('div');
  _srTranscript.className = 'vne-sr-transcript';
  _srTranscript.setAttribute('aria-live', 'polite');

  _sceneEl.appendChild(_nameplateEl);
  _sceneEl.appendChild(_dialogueBox);
  _sceneEl.appendChild(_choicesEl);
  _sceneEl.appendChild(_fadeEl);
  _sceneEl.appendChild(_srTranscript);

  _container.appendChild(_bg);
  _container.appendChild(_sceneEl);
}

/**
 * Plays a scene. Calls onComplete(choiceIndex) when done.
 * @param {object} sceneObject
 * @param {function} onComplete - receives choiceIndex (-1 if no choices)
 */
export function play(sceneObject, onComplete) {
  _scene = sceneObject;
  _onComplete = onComplete || (() => {});
  _lineIndex = 0;
  _typing = false;
  _awaitingAdvance = false;
  _choicesShown = false;
  _portraits = {};

  if (_typingTimer) clearInterval(_typingTimer);

  _buildDOM();
  _container.classList.remove('vne-container--hidden');

  // Set background
  _setBackground(sceneObject.background);

  // Check narrator mode
  const isNarratorMode = !sceneObject.characters || sceneObject.characters.length === 0;
  if (isNarratorMode) {
    _bg.classList.add('vne-bg--narrator-overlay');
    _dialogueBox.classList.add('vne-dialogue--narrator');
  }

  // Create character portraits
  if (sceneObject.characters) {
    for (const char of sceneObject.characters) {
      _createPortrait(char);
    }
  }

  // Fade in from black
  _fadeEl.className = 'vne-fade vne-fade--in';

  // Attach click/key handlers
  _container.addEventListener('click', _handleAdvance);
  document.addEventListener('keydown', _handleKey);

  // Start first dialogue line after fade
  setTimeout(() => {
    _fadeEl.style.display = 'none';
    _showLine();
  }, 320);
}

/**
 * Preloads assets for upcoming scenes.
 * @param {object[]} assetManifest - list of { backgrounds: string[], portraits: string[] }
 */
export function preload(assetManifest) {
  if (!assetManifest) return;
  const paths = [];
  if (assetManifest.backgrounds) {
    for (const bg of assetManifest.backgrounds) {
      paths.push(`./assets/bg/${bg}.jpg`);
    }
  }
  if (assetManifest.portraits) {
    for (const p of assetManifest.portraits) {
      paths.push(`./assets/portraits/${p}.png`);
    }
  }
  for (const path of paths) {
    const img = new Image();
    img.src = path;
  }
}

/**
 * Sets the typewriter text speed.
 * @param {number} charsPerSecond - 10 (slow) to 100 (instant)
 */
export function setTextSpeed(charsPerSecond) {
  _textSpeed = Math.max(10, Math.min(100, charsPerSecond));
}

/**
 * Immediately completes all pending animations in the current scene.
 */
export function skip() {
  if (_typing) {
    _completeTyping();
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function _setBackground(bgKey) {
  if (!bgKey) return;
  const img = new Image();
  img.onload = () => {
    _bg.style.backgroundImage = `url('${img.src}')`;
  };
  img.onerror = () => {
    // Fallback: solid color
    _bg.style.backgroundColor = 'var(--color-night)';
  };
  img.src = `./assets/bg/${bgKey}.jpg`;
}

function _createPortrait(charData) {
  const wrapper = document.createElement('div');
  wrapper.className = `vne-portrait vne-portrait--${charData.position} vne-portrait--inactive`;
  wrapper.dataset.charId = charData.id;

  const img = new Image();
  const expression = charData.expression || 'neutral';

  img.onload = () => {
    wrapper.appendChild(img);
  };

  img.onerror = () => {
    // Try neutral fallback
    const fallback = new Image();
    fallback.onload = () => {
      wrapper.appendChild(fallback);
    };
    fallback.onerror = () => {
      // Colored circle with initial
      const placeholder = document.createElement('div');
      placeholder.className = 'vne-portrait__placeholder';
      const color = CHAR_COLORS[charData.id] || '#F4A623';
      placeholder.style.backgroundColor = color;
      placeholder.textContent = (charData.id || '?').charAt(0).toUpperCase();
      wrapper.appendChild(placeholder);
    };
    fallback.src = `./assets/portraits/${charData.id}_neutral.png`;
  };

  img.src = `./assets/portraits/${charData.id}_${expression}.png`;
  _sceneEl.appendChild(wrapper);
  _portraits[charData.id] = wrapper;
}

function _showLine() {
  if (!_scene || !_scene.dialogue) return;
  if (_lineIndex >= _scene.dialogue.length) {
    _onDialogueEnd();
    return;
  }

  const line = _scene.dialogue[_lineIndex];
  const speaker = line.speaker;
  const text = line.text;

  // Update speaker highlight
  _updateSpeakerHighlight(speaker);

  // Update nameplate
  if (speaker === 'narrator') {
    _nameplateEl.classList.remove('vne-nameplate--visible');
  } else {
    _nameplateEl.textContent = _formatSpeakerName(speaker);
    _nameplateEl.classList.add('vne-nameplate--visible');
  }

  // Accessibility transcript
  _srTranscript.textContent = `${speaker === 'narrator' ? '' : _formatSpeakerName(speaker) + ': '}${text}`;

  // Start typewriter
  _advanceHint.classList.remove('vne-advance-hint--visible');
  _textEl.classList.remove('vne-text--fade-in');
  void _textEl.offsetWidth; // force reflow
  _textEl.classList.add('vne-text--fade-in');

  _fullLineText = text;
  _startTyping(text);
}

function _startTyping(text) {
  _typing = true;
  _awaitingAdvance = false;
  _textEl.textContent = '';

  if (_textSpeed >= 100) {
    _textEl.textContent = text;
    _typing = false;
    _awaitingAdvance = true;
    _advanceHint.classList.add('vne-advance-hint--visible');
    return;
  }

  let charIndex = 0;
  const interval = 1000 / _textSpeed;

  _typingTimer = setInterval(() => {
    charIndex++;
    _textEl.textContent = text.substring(0, charIndex);

    if (charIndex >= text.length) {
      clearInterval(_typingTimer);
      _typingTimer = null;
      _typing = false;
      _awaitingAdvance = true;
      _advanceHint.classList.add('vne-advance-hint--visible');
    }
  }, interval);
}

function _completeTyping() {
  if (_typingTimer) clearInterval(_typingTimer);
  _typingTimer = null;
  _textEl.textContent = _fullLineText;
  _typing = false;
  _awaitingAdvance = true;
  _advanceHint.classList.add('vne-advance-hint--visible');
}

function _handleAdvance(e) {
  if (_choicesShown) return; // clicks go to choice buttons
  e.stopPropagation();

  if (_typing) {
    _completeTyping();
    return;
  }

  if (_awaitingAdvance) {
    _awaitingAdvance = false;
    _lineIndex++;
    _showLine();
  }
}

function _handleKey(e) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    _handleAdvance(e);
  }
}

function _updateSpeakerHighlight(speakerId) {
  for (const [charId, wrapper] of Object.entries(_portraits)) {
    if (charId === speakerId) {
      wrapper.classList.remove('vne-portrait--inactive');
      wrapper.classList.add('vne-portrait--active');
    } else {
      wrapper.classList.remove('vne-portrait--active');
      wrapper.classList.add('vne-portrait--inactive');
    }
  }
}

function _formatSpeakerName(id) {
  if (!id) return '';
  if (id === 'narrator') return '';
  if (id === 'player') return 'YOU';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function _onDialogueEnd() {
  if (_scene.choices && _scene.choices.length > 0) {
    _showChoices();
  } else {
    // No choices — wait for one more tap to dismiss
    _awaitingAdvance = true;
    _advanceHint.classList.add('vne-advance-hint--visible');

    const handler = (e) => {
      if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      _container.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
      _exitScene(-1);
    };

    // Replace the main handler temporarily
    _container.removeEventListener('click', _handleAdvance);
    document.removeEventListener('keydown', _handleKey);
    _container.addEventListener('click', handler);
    document.addEventListener('keydown', handler);
  }
}

function _showChoices() {
  _choicesShown = true;
  _dialogueBox.style.display = 'none';
  _nameplateEl.classList.remove('vne-nameplate--visible');
  _advanceHint.classList.remove('vne-advance-hint--visible');
  _choicesEl.classList.remove('vne-choices--hidden');
  _choicesEl.innerHTML = '';

  _scene.choices.forEach((choice, idx) => {
    const btn = document.createElement('button');
    btn.className = 'vne-choice';
    btn.setAttribute('tabindex', '0');

    const labelEl = document.createElement('div');
    labelEl.className = 'vne-choice__label';
    labelEl.textContent = choice.label;
    btn.appendChild(labelEl);

    // Show stat effects preview
    const effectsHtml = _formatEffects(choice.effects);
    if (effectsHtml) {
      const effectsEl = document.createElement('div');
      effectsEl.className = 'vne-choice__effects';
      effectsEl.innerHTML = effectsHtml;
      btn.appendChild(effectsEl);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _selectChoice(idx);
    });

    _choicesEl.appendChild(btn);

    // Stagger animation: 80ms apart
    setTimeout(() => {
      btn.classList.add('vne-choice--visible');
    }, 80 * idx);
  });

  // Focus first choice for keyboard nav
  setTimeout(() => {
    const first = _choicesEl.querySelector('.vne-choice');
    if (first) first.focus();
  }, 80 * _scene.choices.length + 50);
}

function _selectChoice(idx) {
  const buttons = _choicesEl.querySelectorAll('.vne-choice');
  buttons.forEach((btn, i) => {
    if (i === idx) {
      btn.classList.add('vne-choice--selected');
    } else {
      btn.classList.add('vne-choice--fading');
    }
  });

  // Brief highlight, then exit
  setTimeout(() => {
    _exitScene(idx);
  }, 300);
}

function _exitScene(choiceIndex) {
  // Fade to black
  _fadeEl.style.display = '';
  _fadeEl.className = 'vne-fade vne-fade--out';

  setTimeout(() => {
    _cleanup();
    _container.classList.add('vne-container--hidden');

    if (typeof _onComplete === 'function') {
      _onComplete(choiceIndex);
    }
  }, 420);
}

function _cleanup() {
  _container.removeEventListener('click', _handleAdvance);
  document.removeEventListener('keydown', _handleKey);
  if (_typingTimer) clearInterval(_typingTimer);
  _typingTimer = null;
  _scene = null;
  _lineIndex = 0;
  _typing = false;
  _awaitingAdvance = false;
  _choicesShown = false;
  _portraits = {};
}

const EFFECT_COLORS = {
  money:     '#4CAF50',
  energy:    '#F4A623',
  happiness: '#EE4FA5',
  clout:     '#CA62DC',
};

/**
 * Formats an effects object into colored HTML tags for the choice preview.
 * @param {object} fx
 * @returns {string} HTML string, or empty string if no displayable effects
 */
function _formatEffects(fx) {
  if (!fx) return '';
  const parts = [];

  if (typeof fx.money === 'number' && fx.money !== 0) {
    const sign = fx.money > 0 ? '+' : '';
    parts.push(`<span style="color:${fx.money >= 0 ? EFFECT_COLORS.money : '#e05555'}">${sign}$${fx.money}</span>`);
  }
  if (typeof fx.energy === 'number' && fx.energy !== 0) {
    const sign = fx.energy > 0 ? '+' : '';
    parts.push(`<span style="color:${fx.energy >= 0 ? EFFECT_COLORS.energy : '#e05555'}">${sign}${fx.energy} energy</span>`);
  }
  if (typeof fx.happiness === 'number' && fx.happiness !== 0) {
    const sign = fx.happiness > 0 ? '+' : '';
    parts.push(`<span style="color:${fx.happiness >= 0 ? EFFECT_COLORS.happiness : '#e05555'}">${sign}${fx.happiness} happy</span>`);
  }
  if (typeof fx.clout === 'number' && fx.clout !== 0) {
    const sign = fx.clout > 0 ? '+' : '';
    parts.push(`<span style="color:${fx.clout >= 0 ? EFFECT_COLORS.clout : '#e05555'}">${sign}${fx.clout} clout</span>`);
  }
  if (fx.npc && fx.npc.id) {
    const name = fx.npc.id.charAt(0).toUpperCase() + fx.npc.id.slice(1);
    const sign = fx.npc.delta > 0 ? '+' : '';
    const color = fx.npc.delta >= 0 ? '#4CAF50' : '#e05555';
    parts.push(`<span style="color:${color}">${name} ${sign}${fx.npc.delta}</span>`);
  }
  if (fx.unlock) {
    parts.push(`<span style="color:#CA62DC">Unlocks: ${fx.unlock.replace(/_/g, ' ')}</span>`);
  }

  return parts.join(' <span style="color:#556;font-size:10px">·</span> ');
}
