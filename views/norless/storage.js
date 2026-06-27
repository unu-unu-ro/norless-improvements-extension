// =======================
// Settings cache (backed by chrome.storage.sync)
// =======================
// chrome.storage.sync is async, but the rest of the code reads settings synchronously
// from context-menu builders, the popup bridge and the MutationObserver. We load the
// synced keys once into an in-memory cache and keep it fresh via chrome.storage.onChanged,
// so getters can stay synchronous. Settings roam across devices and across the RO/UA
// origins for free.
//
// Background color, the bible.com extension id, and the sync toggle are SHARED across both
// apps (single keys). The projection target window is PER-ORIGIN, so RO and UA can each
// own a different window — hence the host-scoped key below.

const DISPLAY_WINDOW_KEY = "displayWindow:" + window.location.hostname;

const SYNCED_KEYS = ["pageBackgroundColor", "bibleExtensionId", "useCustomExtensionId", "syncEnabled", DISPLAY_WINDOW_KEY];

const settingsCache = {};

const settingsReady = chrome.storage.sync.get(SYNCED_KEYS).then(stored => {
  Object.assign(settingsCache, stored);
});

function getStoredSetting(key, fallback) {
  return key in settingsCache ? settingsCache[key] : fallback;
}

function setStoredSetting(key, value) {
  settingsCache[key] = value;
  chrome.storage.sync.set({ [key]: value });
}

// Keep the cache fresh across tabs/windows/devices. Feature files add their own
// onChanged listeners for side effects (e.g. re-applying the background color).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }
  for (const key in changes) {
    settingsCache[key] = changes[key].newValue;
  }
});
