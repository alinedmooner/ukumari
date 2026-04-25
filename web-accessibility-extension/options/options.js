// options/options.js
(function() {
  'use strict';

  const Settings = window.WAU_Settings;
  const $ = (sel) => document.querySelector(sel);

  const shortcutTts = $('#shortcut-tts');
  const shortcutPlus = $('#shortcut-plus');
  const shortcutMinus = $('#shortcut-minus');
  const status = $('#status');
  const form = $('#form');

  Settings.get().then((s) => {
    shortcutTts.value = s?.shortcuts?.toggleTTS || 'Alt+T';
    shortcutPlus.value = s?.shortcuts?.increaseFont || 'Alt+Plus';
    shortcutMinus.value = s?.shortcuts?.decreaseFont || 'Alt+Minus';
    status.textContent = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await Settings.update({
      shortcuts: {
        toggleTTS: shortcutTts.value || 'Alt+T',
        increaseFont: shortcutPlus.value || 'Alt+Plus',
        decreaseFont: shortcutMinus.value || 'Alt+Minus'
      }
    });
    status.textContent = 'Guardado.';
    setTimeout(() => (status.textContent = ''), 1200);
  });
})();
