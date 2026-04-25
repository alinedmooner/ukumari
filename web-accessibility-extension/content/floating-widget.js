// content/floating-widget.js
// Widget flotante. Lee/escribe ajustes vía WAU_Settings (fuente única).
(function() {
  'use strict';

  if (window.__WAU_WIDGET_LOADED__) return;
  window.__WAU_WIDGET_LOADED__ = true;

  const WIDGET_ID = 'wau-floating-widget';
  const PANEL_ID = 'wau-floating-panel';
  const Settings = window.WAU_Settings;

  if (!Settings) {
    console.error('[WAU widget] WAU_Settings no disponible');
    return;
  }

  function createWidget() {
    if (document.getElementById(WIDGET_ID)) return;

    const button = document.createElement('button');
    button.id = WIDGET_ID;
    button.setAttribute('aria-label', 'Abrir panel de accesibilidad');
    button.setAttribute('type', 'button');
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9H15V22H13V16H11V22H9V9H3V7H21V9Z" fill="currentColor"/>
      </svg>
    `;
    button.addEventListener('click', togglePanel);
    document.body.appendChild(button);
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Panel de accesibilidad');
    panel.style.display = 'none';

    panel.innerHTML = `
      <div class="wau-panel-header">
        <h2>Accesibilidad</h2>
        <button id="wau-close-panel" aria-label="Cerrar panel" type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
          </svg>
        </button>
      </div>

      <div class="wau-panel-content">
        <section class="wau-section">
          <h3>Tamaño de texto</h3>
          <div class="wau-control-group">
            <button id="wau-decrease-font" type="button" aria-label="Disminuir tamaño de texto">A-</button>
            <span id="wau-font-value" aria-live="polite">100%</span>
            <button id="wau-increase-font" type="button" aria-label="Aumentar tamaño de texto">A+</button>
          </div>
          <input id="wau-font-slider" type="range" min="0.8" max="2.0" step="0.1" value="1.0"
            aria-label="Control deslizante de tamaño de texto" />
        </section>

        <section class="wau-section">
          <h3>Tema de color</h3>
          <select id="wau-theme-select" aria-label="Seleccionar tema de color">
            <option value="default">Predeterminado</option>
            <option value="high-contrast">Alto contraste</option>
            <option value="protanopia">Protanopia</option>
            <option value="deuteranopia">Deuteranopia</option>
            <option value="tritanopia">Tritanopia</option>
          </select>
        </section>

        <section class="wau-section">
          <h3>Opciones</h3>
          <label class="wau-checkbox-label">
            <input id="wau-highlight-links" type="checkbox" />
            <span>Resaltar enlaces</span>
          </label>
          <label class="wau-checkbox-label">
            <input id="wau-tts-enabled" type="checkbox" />
            <span>Lectura por voz (TTS)</span>
          </label>
          <label class="wau-checkbox-label">
            <input id="wau-keyboard-nav" type="checkbox" />
            <span>Navegación por teclado</span>
          </label>
        </section>

        <section class="wau-section">
          <button id="wau-reset-settings" type="button" class="wau-btn-secondary">
            Restablecer ajustes
          </button>
        </section>
      </div>
    `;

    document.body.appendChild(panel);
    attachEventListeners(panel);
  }

  function togglePanel() {
    const panel = document.getElementById(PANEL_ID);
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) panel.focus();
  }

  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = 'none';
  }

  function renderUI(settings) {
    const fontSlider = document.getElementById('wau-font-slider');
    const fontValue = document.getElementById('wau-font-value');
    const themeSelect = document.getElementById('wau-theme-select');
    const highlightLinks = document.getElementById('wau-highlight-links');
    const ttsEnabled = document.getElementById('wau-tts-enabled');
    const keyboardNav = document.getElementById('wau-keyboard-nav');

    if (fontSlider) fontSlider.value = settings.fontScale ?? 1.0;
    if (fontValue) fontValue.textContent = Math.round((settings.fontScale ?? 1.0) * 100) + '%';
    if (themeSelect) themeSelect.value = settings.colorTheme ?? 'default';
    if (highlightLinks) highlightLinks.checked = settings.highlightLinks !== false;
    if (ttsEnabled) ttsEnabled.checked = settings.ttsEnabled !== false;
    if (keyboardNav) keyboardNav.checked = settings.keyboardNav !== false;
  }

  function attachEventListeners(panel) {
    panel.querySelector('#wau-close-panel')?.addEventListener('click', closePanel);

    panel.querySelector('#wau-font-slider')?.addEventListener('input', (e) => {
      Settings.update({ fontScale: parseFloat(e.target.value) });
    });

    panel.querySelector('#wau-decrease-font')?.addEventListener('click', async () => {
      const current = (await Settings.get()).fontScale ?? 1.0;
      Settings.update({ fontScale: Math.max(0.8, current - 0.1) });
    });

    panel.querySelector('#wau-increase-font')?.addEventListener('click', async () => {
      const current = (await Settings.get()).fontScale ?? 1.0;
      Settings.update({ fontScale: Math.min(2.0, current + 0.1) });
    });

    panel.querySelector('#wau-theme-select')?.addEventListener('change', (e) => {
      Settings.update({ colorTheme: e.target.value });
    });

    panel.querySelector('#wau-highlight-links')?.addEventListener('change', (e) => {
      Settings.update({ highlightLinks: e.target.checked });
    });

    panel.querySelector('#wau-tts-enabled')?.addEventListener('change', (e) => {
      Settings.update({ ttsEnabled: e.target.checked });
    });

    panel.querySelector('#wau-keyboard-nav')?.addEventListener('change', (e) => {
      Settings.update({ keyboardNav: e.target.checked });
    });

    panel.querySelector('#wau-reset-settings')?.addEventListener('click', () => {
      Settings.reset();
    });

    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });
  }

  async function init() {
    if (document.readyState === 'loading') {
      await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    }
    createWidget();
    createPanel();
    renderUI(await Settings.get());
    Settings.subscribe(renderUI);
  }

  init();
})();
