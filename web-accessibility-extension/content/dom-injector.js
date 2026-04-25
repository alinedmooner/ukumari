// content/dom-injector.js
// Helpers de inyección de CSS y skip link.
(function() {
  'use strict';

  function injectCssFile(path) {
    const url = chrome.runtime.getURL(path);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.documentElement.appendChild(link);
    return link;
  }

  // Resuelve el destino del skip link buscando un landmark real en la página.
  // Si la página ya define #main, lo respeta; si no, usa el primer
  // <main>/[role="main"]/<article>/<h1> y le asegura un id.
  function resolveSkipTarget() {
    const explicit = document.getElementById('main');
    if (explicit) return explicit;

    const candidates = [
      'main',
      '[role="main"]',
      'article',
      'h1'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        if (!el.id) el.id = 'wau-main-target';
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        return el;
      }
    }
    return null;
  }

  function injectSkipToContent() {
    if (document.getElementById('wau-skip')) return;

    const btn = document.createElement('a');
    btn.id = 'wau-skip';
    btn.textContent = 'Saltar al contenido';
    btn.setAttribute('role', 'button');

    const target = resolveSkipTarget();
    btn.href = target ? `#${target.id}` : '#';
    if (!target) btn.setAttribute('aria-disabled', 'true');

    Object.assign(btn.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      padding: '8px 12px',
      background: '#000',
      color: '#fff',
      transform: 'translateY(-150%)',
      transition: 'transform .15s ease',
      zIndex: '2147483647'
    });

    btn.addEventListener('focus', () => (btn.style.transform = 'translateY(0)'));
    btn.addEventListener('blur', () => (btn.style.transform = 'translateY(-150%)'));

    btn.addEventListener('click', (e) => {
      const t = resolveSkipTarget();
      if (!t) {
        e.preventDefault();
        return;
      }
      // Forzamos foco programático para lectores de pantalla.
      requestAnimationFrame(() => t.focus({ preventScroll: false }));
    });

    document.body.appendChild(btn);
  }

  window.__WAU_INJECTOR__ = { injectCssFile, injectSkipToContent };
})();
