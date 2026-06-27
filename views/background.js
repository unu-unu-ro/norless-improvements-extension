// Service worker.
//
// When a user closes a main Norless page we also close its projection output
// window (http://<host>/template/output.html), so the output doesn't linger
// after the page that drives it is gone.
//
// chrome.tabs.onRemoved only hands us a tabId — the tab (and its URL) is already
// gone by then — so we keep a tabId -> host map of the *main* pages as they load.

const NORLESS_HOSTS = ["app.norless.com", "app-ua.norless.com"];
const OUTPUT_PATH = "/template/output.html";

// tabId -> host, for main Norless pages only (never the output window).
const mainTabs = new Map();

function hostOf(url) {
  try {
    const { hostname } = new URL(url);
    return NORLESS_HOSTS.includes(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

function isOutputUrl(url) {
  return !!url && url.includes(OUTPUT_PATH);
}

// Track (or untrack) a tab as a main Norless page based on its current URL.
function trackTab(tabId, url) {
  const host = hostOf(url);
  if (host && !isOutputUrl(url)) {
    mainTabs.set(tabId, host);
  } else {
    mainTabs.delete(tabId);
  }
}

async function closeOutputFor(host) {
  const tabs = await chrome.tabs.query({ url: `http://${host}${OUTPUT_PATH}` });
  const ids = tabs.map(t => t.id).filter(id => typeof id === "number");
  if (ids.length) {
    try {
      await chrome.tabs.remove(ids);
    } catch (error) {
      console.debug("closing output window failed:", host, error.message);
    }
  }
}

// Seed the map from any tabs already open when the worker starts.
async function seed() {
  for (const host of NORLESS_HOSTS) {
    const tabs = await chrome.tabs.query({ url: `http://${host}/*` });
    tabs.forEach(t => trackTab(t.id, t.url));
  }
}
seed();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) trackTab(tabId, changeInfo.url);
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const host = mainTabs.get(tabId);
  if (!host) return;
  mainTabs.delete(tabId);
  // If another main page on the same host is still open, keep its output alive.
  if ([...mainTabs.values()].includes(host)) return;
  await closeOutputFor(host);
});
