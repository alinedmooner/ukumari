// utils/messages.js
// Constantes de tipos de mensaje usados con chrome.runtime.sendMessage.
// Importadas desde content-script, popup, options y service-worker.
(function() {
  'use strict';

  const WAU_MSG = Object.freeze({
    TTS_SPEAK: 'tts:speak'
  });

  if (typeof window !== 'undefined') {
    window.WAU_MSG = WAU_MSG;
  } else if (typeof self !== 'undefined') {
    // service worker scope
    self.WAU_MSG = WAU_MSG;
  }
})();
