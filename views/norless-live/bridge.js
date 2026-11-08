// =======================
// norless.com → [Project verses from bible.com] windows
// =======================
// Says hello to the Norless page, telling it the projection windows and their languages
// (toolbar popup), again whenever they change; the page answers with a "norless:live"
// message at once and on every change, and each window gets its language. With several
// Norless tabs open, only the tab focused last projects.

const NORLESS_ACTIVE_TAB_KEY = "norlessActiveTab"; // chrome.storage.local

const norlessTabId = crypto.randomUUID();
let activeNorlessTab = null;
let windowLanguages = {};
let lastLive = null;
let seenLanguages = "";
// window index → what it shows ({ text, frame }, see projection.js)
let shownByWindow = {};
let projectQueue = Promise.resolve();

const norlessLiveReady = Promise.all([
  settingsReady,
  chrome.storage.sync.get(NORLESS_WINDOW_LANGUAGES_KEY).then(stored => {
    windowLanguages = stored[NORLESS_WINDOW_LANGUAGES_KEY] || {};
  }),
  chrome.storage.local.get(NORLESS_ACTIVE_TAB_KEY).then(stored => {
    activeNorlessTab ??= stored[NORLESS_ACTIVE_TAB_KEY] || null;
  })
]);

async function sendToBibleWindow(extensionId, action, payload) {
  try {
    return await chrome.runtime.sendMessage(extensionId, { action, payload });
  } catch (error) {
    console.debug(`${extensionName} ${action} failed:`, error.message);
    return null;
  }
}

async function projectLive(live) {
  if (activeNorlessTab !== norlessTabId) {
    return;
  }
  const languages = Object.keys(live.languages || {});
  if (languages.length && languages.join() !== seenLanguages) {
    seenLanguages = languages.join();
    chrome.storage.local.set({ [NORLESS_SEEN_LANGUAGES_KEY]: languages });
  }

  const { extensionId } = getProjectTextSettings();
  await Promise.all(
    [1, 2].map(async index => {
      const language = getWindowLanguage(index, windowLanguages, languages);
      if (!language) {
        return; // disabled: leave the window alone
      }
      const { shown, messages } = getWindowMessages(live, language, shownByWindow[index] || getUnknownWindowState());
      shownByWindow[index] = shown;
      for (const { action, payload } of messages) {
        if (action === "updateText") {
          await projectText(extensionId, payload.text, payload.markdown, index);
        } else {
          await sendToBibleWindow(extensionId, action, { ...payload, index });
        }
      }
    })
  );
}

// One at a time, in order (a page's removal must reach a window before the next text).
function queueProjection(live) {
  projectQueue = projectQueue
    .then(() => norlessLiveReady)
    .then(() => projectLive(live))
    .catch(error => console.debug("Norless projection failed:", error));
}

// The windows may show anything now (another tab projected, another language): send all again.
function reproject() {
  shownByWindow = {};
  if (lastLive) {
    queueProjection(lastLive);
  }
}

// =======================
// The tab focused last projects
// =======================
function claimProjection() {
  chrome.storage.local.set({ [NORLESS_ACTIVE_TAB_KEY]: norlessTabId });
}

window.addEventListener("focus", claimProjection);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    claimProjection();
  }
});
if (document.visibilityState === "visible") {
  claimProjection();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[NORLESS_ACTIVE_TAB_KEY]) {
    activeNorlessTab = changes[NORLESS_ACTIVE_TAB_KEY].newValue || null;
    if (activeNorlessTab === norlessTabId) {
      reproject();
    }
  }
  if (area === "sync" && changes[NORLESS_WINDOW_LANGUAGES_KEY]) {
    windowLanguages = changes[NORLESS_WINDOW_LANGUAGES_KEY].newValue || {};
    reproject();
    sayNorlessHello(); // Norless shows the windows' new languages
  }
});

// =======================
// norless:hello → norless:live
// =======================
window.addEventListener("message", event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.type !== "norless:live") {
    return;
  }
  clearInterval(norlessHello);
  lastLive = event.data;
  queueProjection(lastLive);
});

// The app may still be loading: say hello every second until it answers. The windows'
// languages are read first, so Norless never shows them Disabled by mistake.
const sayNorlessHello = () =>
  norlessLiveReady.then(() => window.postMessage({ type: "norless:hello", windows: getHelloWindows(windowLanguages) }, location.origin));
const norlessHello = setInterval(sayNorlessHello, 1000);
sayNorlessHello();
