// content/content-script.js
// Los utils (settings-store, tts, keyboard-nav, dom-injector) ya están
// cargados antes que este script según el orden declarado en manifest.json.
(async () => {
  'use strict';

  const Settings = window.WAU_Settings;
  const TTS = window.WAU_TTS;
  const KB = window.WAU_KB;

  if (!Settings || !TTS || !KB) {
    console.error('[WAU] utils no disponibles. Revisar orden de scripts en manifest.');
    return;
  }

  // Inyección de assets (CSS y skip link).
  window.__WAU_INJECTOR__?.injectCssFile('content/styles/themes.css');
  window.__WAU_INJECTOR__?.injectCssFile('content/styles/links-highlight.css');
  window.__WAU_INJECTOR__?.injectCssFile('content/styles/floating-widget.css');
  window.__WAU_INJECTOR__?.injectSkipToContent();

  // Inicialización de TTS.
  TTS.initTTS().then((ready) => {
    if (!ready) console.warn('[WAU] TTS no disponible, usando fallback');
  });

  // Estado local: copia más reciente de los ajustes para evitar awaits en hot paths.
  let settings = await Settings.get();
  Settings.apply(settings);

  // Reaplica los ajustes que las SPAs pueden borrar al re-renderizar.
  // En lugar de heurística por número de mutaciones, observa el atributo
  // específico que pueden sobrescribir.
  const reapplyOnAttrChange = new MutationObserver(() => {
    if (document.body?.getAttribute('data-theme') !== settings.colorTheme) {
      Settings.apply(settings);
    }
  });
  if (document.body) {
    reapplyOnAttrChange.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme', 'class']
    });
  }

  // TTS al enfocar elementos.
  let lastSpokenText = '';
  let lastSpokenTime = 0;

  function extractTextFromElement(el) {
    let text = '';

    if (el.getAttribute('aria-label')) {
      text = el.getAttribute('aria-label');
    } else if (el.title) {
      text = el.title;
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      if (label) {
        text = label.innerText || label.textContent;
      } else if (el.placeholder) {
        text = el.placeholder;
      } else if (el.name) {
        text = el.name;
      } else {
        text = 'Campo de entrada';
      }
      if (el.type && text) {
        const typeMap = {
          text: 'texto',
          email: 'correo electrónico',
          password: 'contraseña',
          tel: 'teléfono',
          number: 'número',
          search: 'búsqueda',
          url: 'URL',
          date: 'fecha',
          time: 'hora',
          textarea: 'área de texto'
        };
        const typeName = typeMap[el.type] || el.type;
        text = `${text}, campo de ${typeName}`;
      }
    } else if (el.tagName === 'SELECT') {
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      if (label) {
        text = label.innerText || label.textContent;
      } else if (el.name) {
        text = el.name;
      } else {
        text = 'Selector';
      }
      text = `${text}, menú de selección`;
      if (el.selectedOptions && el.selectedOptions[0]) {
        text += `, ${el.selectedOptions[0].text}`;
      }
    } else if (el.tagName === 'BUTTON') {
      text = el.innerText || el.textContent || 'Botón';
      if (!text || text === 'Botón') text = 'Botón';
    } else if (el.tagName === 'A') {
      text = el.innerText || el.textContent || 'Enlace';
      if (text && !text.toLowerCase().includes('enlace')) {
        text = `${text}, enlace`;
      }
    } else if (el.tagName === 'IMG') {
      text = el.alt || 'Imagen sin descripción';
    } else if (el.getAttribute('role')) {
      const role = el.getAttribute('role');
      const roleMap = {
        button: 'botón',
        link: 'enlace',
        checkbox: 'casilla de verificación',
        radio: 'botón de radio',
        tab: 'pestaña',
        tabpanel: 'panel de pestaña',
        menuitem: 'elemento de menú',
        option: 'opción',
        combobox: 'cuadro combinado',
        textbox: 'cuadro de texto',
        searchbox: 'cuadro de búsqueda',
        slider: 'deslizador',
        spinbutton: 'selector numérico',
        progressbar: 'barra de progreso',
        alert: 'alerta',
        dialog: 'diálogo',
        navigation: 'navegación',
        main: 'contenido principal',
        banner: 'banner',
        contentinfo: 'información de contenido',
        complementary: 'complementario',
        form: 'formulario',
        search: 'búsqueda',
        region: 'región'
      };
      const roleName = roleMap[role] || role;
      text = el.innerText || el.textContent || roleName;
      if (text && !text.toLowerCase().includes(roleName.toLowerCase())) {
        text = `${text}, ${roleName}`;
      }
    } else if (el.tagName && el.tagName.match(/^H[1-6]$/)) {
      const level = el.tagName.charAt(1);
      text = el.innerText || el.textContent || '';
      if (text) text = `Encabezado nivel ${level}, ${text}`;
    } else if (el.tagName === 'LI') {
      text = el.innerText || el.textContent || '';
      if (text) text = `Elemento de lista, ${text}`;
    } else if (el.tabIndex >= 0 || el.onclick) {
      text = el.innerText || el.textContent || '';
      if (text) text = `Elemento interactivo, ${text}`;
    } else {
      text = el.innerText || el.textContent || '';
    }

    return text.trim();
  }

  document.addEventListener('focusin', async (e) => {
    if (!settings.ttsEnabled) return;

    const el = e.target;
    let text = extractTextFromElement(el);

    if (!text && el.tagName) {
      const tagMap = {
        DIV: 'División',
        SPAN: 'Texto',
        P: 'Párrafo',
        SECTION: 'Sección',
        ARTICLE: 'Artículo',
        HEADER: 'Encabezado de página',
        FOOTER: 'Pie de página',
        NAV: 'Navegación',
        ASIDE: 'Contenido lateral',
        MAIN: 'Contenido principal'
      };
      text = tagMap[el.tagName] || el.tagName.toLowerCase();
    }

    if (!text) text = 'Elemento enfocado';

    const now = Date.now();
    if (text !== lastSpokenText || now - lastSpokenTime > 1000) {
      lastSpokenText = text;
      lastSpokenTime = now;
      if (text.length > 200) text = text.substring(0, 200) + '…';
      await TTS.speak(text);
    }
  }, true);

  // Atajos de teclado.
  KB.enable({
    onTab: () => {
      const activeEl = document.activeElement;
      if (activeEl && activeEl !== document.body) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    onToggleTTS: () => {
      const next = !settings.ttsEnabled;
      TTS.stop();
      Settings.update({ ttsEnabled: next });

      const feedback = document.createElement('div');
      feedback.className = 'wau-toast';
      feedback.dataset.state = next ? 'on' : 'off';
      feedback.textContent = next ? '🔊 TTS Activado' : '🔇 TTS Desactivado';
      document.body.appendChild(feedback);
      setTimeout(() => feedback.remove(), 2000);
    },
    onIncreaseFont: () => {
      const next = Math.min(2.0, (settings.fontScale || 1.0) + 0.1);
      Settings.update({ fontScale: next });
    },
    onDecreaseFont: () => {
      const next = Math.max(0.8, (settings.fontScale || 1.0) - 0.1);
      Settings.update({ fontScale: next });
    }
  }, settings.shortcuts);

  // Suscripción única: al cambiar settings (desde popup, options, widget o
  // sincronización entre dispositivos), aplicamos al DOM.
  Settings.subscribe((next) => {
    settings = next;
    Settings.apply(next);
  });
})();
