// Sync selections from app.norless.com (RO, source) → app-ua.norless.com (UA, target).
//
// The two apps are on different origins, so window.postMessage / BroadcastChannel
// cannot bridge them. Instead we use chrome.storage.local as a message bus:
// chrome.storage.onChanged fires in the content scripts of every tab (both origins),
// and the "storage" permission is already granted. No service-worker relay needed.
//
// See views/norless/selectors.js for the relevant DOM structure.

const STORAGE_CMD = "norless_sync_cmd";
const SYNC_ENABLED = "syncEnabled";

const SOURCE_HOST = "app.norless.com";
const TARGET_HOST = "app-ua.norless.com";

const PLAYLIST_ENTRY = "#playlist .entry.song";
const SLIDE_ITEM = "#live_object_slides_wrapper .slides li[index]";
const SLIDE_ITEMS = "#live_object_slides_wrapper .slides li";

function isSyncEnabled() {
  return getStoredSetting(SYNC_ENABLED, false) === true;
}

function toggleSync() {
  const enabled = !isSyncEnabled();
  setStoredSetting(SYNC_ENABLED, enabled);
  return enabled;
}

/**
 * Extract the clean song title from a playlist entry, dropping the label/tags spans
 * that share the .title node (see selectors.js HTML structure).
 * @param {HTMLElement} entry
 * @returns {String}
 */
function getEntryTitle(entry) {
  const title = entry.querySelector(".title");
  if (!title) {
    return "";
  }
  const clone = title.cloneNode(true);
  clone.querySelectorAll(".label, .tags").forEach(node => node.remove());
  return clone.textContent.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Source side (app.norless.com): observe clicks, write commands to the bus.
// ---------------------------------------------------------------------------

let cmdCounter = 0;

function sendCmd(action, payload) {
  if (!isSyncEnabled()) {
    return;
  }
  const id = Date.now() + "-" + cmdCounter++;
  chrome.storage.local.set({ [STORAGE_CMD]: { id, action, payload } });
}

function initSyncSource() {
  document.addEventListener(
    "click",
    e => {
      if (!isSyncEnabled()) {
        return;
      }

      const slide = e.target.closest(SLIDE_ITEM);
      if (slide) {
        sendCmd("selectSlide", {
          index: slide.getAttribute("index"),
          totalSlides: $$(SLIDE_ITEMS).length
        });
        return;
      }

      const entry = e.target.closest(PLAYLIST_ENTRY);
      if (entry) {
        sendCmd("selectSong", { name: getEntryTitle(entry) });
      }
    },
    true
  );

  // Mirror navigation/projection keys to UA. PageUp/PageDown move between
  // slides without a click, so the click handler above never sees them.
  document.addEventListener(
    "keydown",
    e => {
      if (e.key === "Escape") {
        sendCmd("stopProjecting", {});
      } else if (e.key === "PageUp" || e.key === "PageDown") {
        sendCmd("navigate", { key: e.key });
      }
    },
    true
  );
}

// ---------------------------------------------------------------------------
// Target side (app-ua.norless.com): react to commands, mirror selections.
// ---------------------------------------------------------------------------

// State for the currently-mirrored song.
let syncState = { name: "", found: false, warned: false };

/**
 * Find the UA entry whose title matches the RO name. UA titles follow the
 * convention "{RO title} / {UA title}", so we match by the part before "/"
 * or by a plain prefix.
 * @param {String} name
 * @returns {HTMLElement | undefined}
 */
function findUaEntry(name) {
  return $$(PLAYLIST_ENTRY).find(entry => {
    const title = getEntryTitle(entry);
    const roPart = title.split("/")[0].trim();
    return title === name || roPart === name || title.startsWith(name);
  });
}

function selectSong({ name }) {
  const entry = findUaEntry(name);
  if (!entry) {
    syncState = { name, found: false, warned: false };
    showToast(`song not found: ${name}`, "error");
    return;
  }
  syncState = { name, found: true, warned: false };
  entry.click();
}

/**
 * Poll the UA slides until they settle on the expected count (slides reload
 * asynchronously after a song is selected). Returns the final count.
 * @param {Number} expected
 * @returns {Promise<Number>}
 */
async function waitForSlideCount(expected, timeout = 2000, interval = 100) {
  const endTime = Date.now() + timeout;
  let count = $$(SLIDE_ITEMS).length;
  while (count !== expected && Date.now() < endTime) {
    await sleep(interval);
    count = $$(SLIDE_ITEMS).length;
  }
  return count;
}

async function selectSlide({ index, totalSlides }) {
  if (!syncState.found) {
    return;
  }

  const count = await waitForSlideCount(totalSlides);
  if (count !== totalSlides) {
    if (!syncState.warned) {
      syncState.warned = true;
      showToast(`song does not have the same number of slides: ${syncState.name}`, "error");
    }
    return;
  }

  const slide = $(`${SLIDE_ITEMS}[index='${index}']`);
  slide && slide.click();
}

// Map the keys we mirror to their code / keyCode so norless's own handlers fire.
const KEY_INFO = {
  Escape: { code: "Escape", keyCode: 27 },
  PageUp: { code: "PageUp", keyCode: 33 },
  PageDown: { code: "PageDown", keyCode: 34 }
};

/**
 * Re-dispatch a keyboard event on the UA tab so norless reacts as if the user
 * pressed the key there (Escape stops projecting, PageUp/PageDown change slide).
 * @param {String} key
 */
function simulateKey(key) {
  const info = KEY_INFO[key];
  if (!info) {
    return;
  }
  ["keydown", "keyup"].forEach(type => {
    const event = new KeyboardEvent(type, {
      key,
      code: info.code,
      keyCode: info.keyCode,
      which: info.keyCode,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);
  });
}

function handleCommand(command) {
  if (!command || !command.action) {
    return;
  }
  if (command.action === "selectSong") {
    selectSong(command.payload);
  } else if (command.action === "selectSlide") {
    selectSlide(command.payload);
  } else if (command.action === "navigate") {
    // Relative slide navigation — only mirror once a matching song is selected.
    if (syncState.found) {
      simulateKey(command.payload.key);
    }
  } else if (command.action === "stopProjecting") {
    simulateKey("Escape");
  }
}

function initSyncTarget() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_CMD]) {
      return;
    }
    handleCommand(changes[STORAGE_CMD].newValue);
  });
}

// ---------------------------------------------------------------------------

function initSync() {
  // Only the main playlist page participates, not the output window.
  if (window.location.pathname === "/template/output.html") {
    return;
  }
  const host = window.location.hostname;
  if (host === SOURCE_HOST) {
    initSyncSource();
  } else if (host === TARGET_HOST) {
    initSyncTarget();
  }
}

initSync();
