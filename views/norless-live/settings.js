// =======================
// [Project verses from bible.com] extension id (chrome.storage.sync)
// =======================
// The fixed production id, unless a custom id is enabled in the toolbar popup (Settings).
// Kept in an in-memory cache, fresh via chrome.storage.onChanged, so it reads synchronously.

const extensionName = "Project verses from bible.com";
const defaultBibleExtensionId = "fklnkmnlobkpoiifnbnemdpamheoanpj";

const settingsCache = {};

const settingsReady = chrome.storage.sync.get(["bibleExtensionId", "useCustomExtensionId"]).then(stored => {
  Object.assign(settingsCache, stored);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }
  for (const key in changes) {
    settingsCache[key] = changes[key].newValue;
  }
});

function getBibleExtensionId() {
  const { useCustomExtensionId, bibleExtensionId } = settingsCache;
  return useCustomExtensionId && bibleExtensionId ? bibleExtensionId : defaultBibleExtensionId;
}
