// popup/popup.js
(function() {
  'use strict';

  const Settings = window.WAU_Settings;
  const $ = (sel) => document.querySelector(sel);

  const fontScale = $('#font-scale');
  const fontScaleOut = $('#font-scale-out');
  const colorTheme = $('#color-theme');
  const highlightLinks = $('#highlight-links');
  const ttsEnabled = $('#tts-enabled');
  const keyboardNav = $('#keyboard-nav');
  const openOptions = $('#open-options');

  function render(s) {
    fontScale.value = s.fontScale ?? 1.0;
    fontScaleOut.textContent = (s.fontScale ?? 1.0).toFixed(1);
    colorTheme.value = s.colorTheme ?? 'default';
    highlightLinks.checked = !!s.highlightLinks;
    ttsEnabled.checked = !!s.ttsEnabled;
    keyboardNav.checked = !!s.keyboardNav;
  }

  fontScale.addEventListener('input', () => {
    const v = Number(fontScale.value);
    fontScaleOut.textContent = v.toFixed(1);
    Settings.update({ fontScale: v });
  });

  colorTheme.addEventListener('change', () => {
    Settings.update({ colorTheme: colorTheme.value });
  });

  highlightLinks.addEventListener('change', () => {
    Settings.update({ highlightLinks: highlightLinks.checked });
  });
  ttsEnabled.addEventListener('change', () => {
    Settings.update({ ttsEnabled: ttsEnabled.checked });
  });
  keyboardNav.addEventListener('change', () => {
    Settings.update({ keyboardNav: keyboardNav.checked });
  });

  openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());

  Settings.get().then(render);
  Settings.subscribe(render);
})();
