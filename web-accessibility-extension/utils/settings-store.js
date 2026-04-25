// utils/settings-store.js
// Fuente única de verdad para los ajustes del usuario.
// Mantiene un caché en memoria, escribe a chrome.storage.sync y notifica
// a los suscriptores cuando los ajustes cambian (locales o remotos).
(function() {
  'use strict';

  const KEY = 'user_settings_v1';

  const DEFAULTS = Object.freeze({
    fontScale: 1.0,
    colorTheme: 'default',
    highlightLinks: true,
    ttsEnabled: true,
    keyboardNav: true,
    shortcuts: {
      toggleTTS: 'Alt+T',
      increaseFont: 'Alt+Plus',
      decreaseFont: 'Alt+Minus'
    }
  });

  let cache = null;
  const subscribers = new Set();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function merge(base, patch) {
    const out = clone(base);
    for (const k of Object.keys(patch || {})) {
      const v = patch[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = merge(out[k] || {}, v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  async function load() {
    if (cache) return cache;
    return new Promise((resolve) => {
      chrome.storage.sync.get([KEY], (res) => {
        cache = merge(DEFAULTS, res?.[KEY] || {});
        resolve(cache);
      });
    });
  }

  async function get() {
    return clone(await load());
  }

  async function update(patch) {
    const next = merge(await load(), patch || {});
    cache = next;
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [KEY]: next }, () => resolve(clone(next)));
    });
  }

  async function reset() {
    cache = clone(DEFAULTS);
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [KEY]: cache }, () => resolve(clone(cache)));
    });
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  // chrome.storage.onChanged es la única ruta de propagación entre contextos
  // (popup, options, content scripts de cada pestaña, service worker).
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes[KEY]) return;
      const next = merge(DEFAULTS, changes[KEY].newValue || {});
      cache = next;
      const snap = clone(next);
      for (const fn of subscribers) {
        try { fn(snap); } catch (e) { console.error('[WAU settings] subscriber falló:', e); }
      }
    });
  }

  // Aplicación de ajustes al DOM. Único punto que toca el documento.
  function apply(settings) {
    const s = settings || cache || DEFAULTS;
    document.documentElement.style.fontSize = `${s.fontScale || 1.0}rem`;
    document.body?.setAttribute('data-theme', s.colorTheme || 'default');
    document.documentElement.setAttribute(
      'data-highlight-links',
      s.highlightLinks ? '1' : '0'
    );
  }

  if (typeof window !== 'undefined') {
    window.WAU_Settings = {
      DEFAULTS: clone(DEFAULTS),
      get,
      update,
      reset,
      subscribe,
      apply
    };
    // Compatibilidad con código previo que importaba WAU_Storage.
    window.WAU_Storage = {
      getSettings: get,
      setSettings: (value) => new Promise((resolve) => {
        cache = merge(DEFAULTS, value || {});
        chrome.storage.sync.set({ [KEY]: cache }, () => resolve());
      })
    };
  }
})();
