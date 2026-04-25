// utils/tts.js
// Capa sobre speechSynthesis con fallback a chrome.tts vía service worker.
// Importante: speechSynthesis NO depende de AudioContext. El permiso de
// "user gesture" lo gestiona el navegador internamente. Aquí solo:
//   1. Esperamos a que la lista de voces esté cargada.
//   2. Llamamos a speak() y reaccionamos al evento 'error' si el navegador
//      bloquea por falta de gesto del usuario.
//   3. Si el motor falla, caemos a chrome.tts.
'use strict';

let voicesReady = false;
let needsUserGesture = false;
let warningShown = false;

async function initTTS() {
  if (!window.speechSynthesis) {
    console.warn('[WAU TTS] SpeechSynthesis API no disponible');
    return false;
  }
  if (voicesReady) return true;

  if (window.speechSynthesis.getVoices().length === 0) {
    await new Promise((resolve) => {
      const onChange = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', onChange);
        resolve();
      };
      window.speechSynthesis.addEventListener('voiceschanged', onChange);
      setTimeout(resolve, 1000);
    });
  }

  voicesReady = true;
  return true;
}

function getBestVoice(lang) {
  const voices = window.speechSynthesis?.getVoices() || [];
  if (!voices.length) return null;
  const langCode = lang.split('-')[0];
  return (
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang.startsWith(langCode)) ||
    voices.find((v) => v.localService) ||
    voices[0]
  );
}

// Notificación accesible que pide al usuario hacer clic para habilitar TTS.
// El primer click registra el gesto requerido por la política del navegador.
function requestUserGesture() {
  if (warningShown) return;
  warningShown = true;

  const note = document.createElement('div');
  note.className = 'wau-tts-notification';
  note.setAttribute('role', 'status');
  note.innerHTML = `
    <span>🔊 Haz clic en cualquier parte de la página para activar la lectura por voz</span>
    <button type="button" aria-label="Cerrar aviso">OK</button>
  `;
  note.querySelector('button')?.addEventListener('click', () => note.remove());
  document.body.appendChild(note);
  setTimeout(() => note.parentElement && note.remove(), 5000);

  const onFirstClick = () => {
    needsUserGesture = false;
    note.remove();
    document.removeEventListener('click', onFirstClick);
  };
  document.addEventListener('click', onFirstClick, { once: true });
}

async function speak(text) {
  const t = (text || '').toString().trim();
  if (!t) return;

  const truncated = t.length > 200 ? t.substring(0, 200) + '…' : t;

  if (!voicesReady) {
    const ok = await initTTS();
    if (!ok) {
      tryFallbackTTS(truncated);
      return;
    }
  }

  if (needsUserGesture) {
    requestUserGesture();
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    await new Promise((r) => setTimeout(r, 50));
  }

  const lang = document.documentElement.lang || navigator.language || 'es-ES';

  try {
    const utter = new SpeechSynthesisUtterance(truncated);
    utter.lang = lang;
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    const voice = getBestVoice(lang);
    if (voice) utter.voice = voice;

    utter.onerror = (event) => {
      const err = event.error || 'unknown';
      if (err === 'interrupted' || err === 'canceled') return;

      console.warn('[WAU TTS] Error de síntesis:', err);

      switch (err) {
        case 'not-allowed':
        case 'audio-busy':
          needsUserGesture = true;
          requestUserGesture();
          break;
        case 'synthesis-failed':
        case 'synthesis-unavailable':
        case 'language-unavailable':
        case 'voice-unavailable':
        case 'network':
          tryFallbackTTS(truncated);
          break;
        default:
          tryFallbackTTS(truncated);
      }
    };

    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.error('[WAU TTS] Error al hablar:', e);
    tryFallbackTTS(truncated);
  }
}

function tryFallbackTTS(text) {
  const lang = document.documentElement.lang || navigator.language || 'es-ES';
  try {
    chrome.runtime.sendMessage({
      type: window.WAU_MSG?.TTS_SPEAK || 'tts:speak',
      text,
      lang
    });
  } catch (_) {
    // Si runtime tampoco está, no hay manera de hablar.
  }
}

function pause() {
  try { window.speechSynthesis?.pause(); } catch (_) {}
}
function resume() {
  try { window.speechSynthesis?.resume(); } catch (_) {}
}
function stop() {
  try { window.speechSynthesis?.cancel(); } catch (_) {}
}
function isReady() {
  return voicesReady && !needsUserGesture;
}

if (typeof window !== 'undefined') {
  window.WAU_TTS = { speak, pause, resume, stop, initTTS, isReady };
}
