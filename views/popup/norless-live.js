// Toolbar popup — norless.com: the language each bible.com projection window shows.
// One setting for norless.com (one page carries every language), in chrome.storage.sync;
// the open norless.com tab picks changes up (views/norless-live/bridge.js).

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

function languageName(code) {
  try {
    return languageNames.of(code) || code;
  } catch {
    return code;
  }
}

async function renderNorlessLive() {
  const [{ [NORLESS_WINDOW_LANGUAGES_KEY]: stored = {} }, { [NORLESS_SEEN_LANGUAGES_KEY]: seen = [] }] = await Promise.all([
    chrome.storage.sync.get(NORLESS_WINDOW_LANGUAGES_KEY),
    chrome.storage.local.get(NORLESS_SEEN_LANGUAGES_KEY)
  ]);

  const container = document.getElementById("norlessLiveRows");
  container.innerHTML = "";
  [1, 2].forEach(index => {
    const current = getWindowLanguage(index, stored, seen);

    const row = document.createElement("label");
    row.className = "window-row";

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = WINDOW_LABELS[index];
    row.appendChild(label);

    const select = document.createElement("select");
    const codes = [...new Set([...seen, current])].filter(Boolean);
    [...codes.map(code => ({ value: code, text: `${languageName(code)} (${code})` })), { value: "", text: "Disabled" }].forEach(option => {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.text;
      el.selected = option.value === current;
      select.appendChild(el);
    });
    select.addEventListener("change", () => {
      chrome.storage.sync.set({ [NORLESS_WINDOW_LANGUAGES_KEY]: { ...stored, [index]: select.value } });
      stored[index] = select.value;
    });
    row.appendChild(select);

    container.appendChild(row);
  });
}

renderNorlessLive();
