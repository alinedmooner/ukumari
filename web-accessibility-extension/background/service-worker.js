// background/service-worker.js
// MV3 (Chrome) / background script (Firefox MV2).
// Solo gestiona TTS de fallback. Los ajustes los maneja settings-store
// directamente contra chrome.storage.sync; no se necesita un proxy aquí.
'use strict';

importScripts?.('../utils/messages.js');
const MSG = (typeof self !== 'undefined' && self.WAU_MSG) || { TTS_SPEAK: 'tts:speak' };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === MSG.TTS_SPEAK) {
    try {
      chrome.tts.speak(msg.text || '', {
        lang: msg.lang || 'es-ES',
        rate: 1.0,
        enqueue: false
      }, () => sendResponse({ ok: true }));
    } catch (e) {
      sendResponse({ ok: false, error: e?.message });
    }
    return true;
  }
});
