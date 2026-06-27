// Toolbar popup — unified control center for both Norless pages.
// Reads/writes settings by messaging each page's content script (views/norless/index.js).

const HOSTS = {
  ro: {
    host: "app.norless.com",
    url: "http://app.norless.com/",
    flag: "🇷🇴",
    name: "RO"
  },
  ua: {
    host: "app-ua.norless.com",
    url: "http://app-ua.norless.com/",
    flag: "🇺🇦",
    name: "UA"
  }
};

const WINDOW_LABELS = { 1: "Window 1", 2: "Window 2" };

// Fallback for the bible.com projection extension when nothing is stored yet
// (mirrors defaultBibleExtensionId in views/norless/bible-verses-integration.js).
const DEFAULT_EXTENSION_ID = "fklnkmnlobkpoiifnbnemdpamheoanpj";

// The extension this id targets (mirrors extensionName in bible-verses-integration.js).
const TARGET_EXTENSION_NAME = "Project verses from bible.com";

// Latest snapshot: { ro: state|null, ua: state|null, active: { key, tab } | null }
let state = { ro: null, ua: null, active: null };

// ----- tab helpers -----

async function findMainTab(host) {
  const tabs = await chrome.tabs.query({ url: `http://${host}/*` });
  // Skip output windows — they don't run the popup bridge.
  const main = tabs.filter(t => t.url && !t.url.includes("/template/output.html"));
  return main[0] || null;
}

async function send(host, message) {
  const tab = await findMainTab(host);
  if (!tab) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    console.debug("sendMessage failed:", host, error.message);
    return null;
  }
}

async function getActiveNorlessTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;
  const match = /^http:\/\/(app|app-ua)\.norless\.com\//.test(tab.url);
  if (!match || tab.url.includes("/template/output.html")) return null;
  const key = tab.url.includes("app-ua.norless.com") ? "ua" : "ro";
  return { key, tab };
}

// ----- window <-> displayWindow mapping -----

function winsOf(pageState) {
  const set = new Set();
  if (!pageState) return set;
  const dw = pageState.displayWindow;
  if (dw === 1) set.add(1);
  else if (dw === 2) set.add(2);
  else if (dw === 3) {
    set.add(1);
    set.add(2);
  }
  return set;
}

function setToDisplayWindow(set) {
  if (set.has(1) && set.has(2)) return 3;
  if (set.has(1)) return 1;
  if (set.has(2)) return 2;
  return 0;
}

function computeOwners() {
  const ro = winsOf(state.ro);
  const ua = winsOf(state.ua);
  const owner = { 1: null, 2: null };
  const conflicts = { 1: false, 2: false };
  for (const w of [1, 2]) {
    const roHas = ro.has(w);
    const uaHas = ua.has(w);
    if (roHas && uaHas) {
      owner[w] = "ro"; // arbitrary winner; flagged below
      conflicts[w] = true;
    } else if (roHas) {
      owner[w] = "ro";
    } else if (uaHas) {
      owner[w] = "ua";
    }
  }
  return { owner, conflicts };
}

async function assignWindow(w, who) {
  const sets = { ro: winsOf(state.ro), ua: winsOf(state.ua) };
  // A window belongs to at most one page.
  sets.ro.delete(w);
  sets.ua.delete(w);
  if (who === "ro" || who === "ua") sets[who].add(w);

  for (const key of ["ro", "ua"]) {
    if (!state[key]) continue; // page closed — can't update, skip
    const dw = setToDisplayWindow(sets[key]);
    if (dw !== state[key].displayWindow) {
      await send(HOSTS[key].host, { action: "setDisplayWindow", value: dw });
    }
  }
  await refresh();
}

// ----- rendering -----

function renderPages() {
  document.querySelectorAll(".dot").forEach(dot => {
    const key = dot.dataset.page;
    dot.classList.toggle("open", !!state[key]);
  });
}

function renderWindows() {
  const container = document.getElementById("windowRows");
  container.innerHTML = "";
  const { owner, conflicts } = computeOwners();

  [1, 2].forEach(w => {
    const cur = owner[w]; // null | "ro" | "ua"
    const row = document.createElement("div");
    row.className = "window-row";

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = WINDOW_LABELS[w];
    row.appendChild(label);

    const seg = document.createElement("div");
    seg.className = "seg";

    const options = [
      { val: "off", text: "Off", enabled: true, selected: cur === null },
      { val: "ro", text: `${HOSTS.ro.flag} RO`, enabled: !!state.ro, selected: cur === "ro" },
      { val: "ua", text: `${HOSTS.ua.flag} UA`, enabled: !!state.ua, selected: cur === "ua" }
    ];

    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.val = opt.val;
      btn.textContent = opt.text;
      if (opt.selected) btn.classList.add("active");
      if (!opt.enabled) btn.disabled = true;
      btn.addEventListener("click", () => {
        if (!opt.selected) assignWindow(w, opt.val);
      });
      seg.appendChild(btn);
    });

    row.appendChild(seg);
    container.appendChild(row);
  });

  document.getElementById("conflictNote").classList.toggle("hidden", !(conflicts[1] || conflicts[2]));
}

function renderSync() {
  const container = document.getElementById("syncRow");
  container.innerHTML = "";
  if (!state.ro) {
    container.innerHTML = `<span class="closed-note">Open ${HOSTS.ro.flag} RO to control sync.</span>`;
    return;
  }
  const wrap = document.createElement("button");
  wrap.type = "button";
  wrap.className = "toggle";
  const ic = document.createElement("span");
  ic.className = "ic";
  ic.innerHTML = state.ro.syncEnabled ? icons.checkedRadioLight : icons.uncheckedRadioLight;
  wrap.appendChild(ic);
  wrap.appendChild(document.createTextNode("Sync RO selections to 🇺🇦 app-ua"));
  wrap.addEventListener("click", async () => {
    const res = await send(HOSTS.ro.host, { action: "toggleSync" });
    if (res) state.ro.syncEnabled = res.syncEnabled;
    renderSync();
  });
  container.appendChild(wrap);
}

function renderPlaylist() {
  const label = document.getElementById("activeLabel");
  const saveBtn = document.getElementById("saveBtn");
  const copyBtn = document.getElementById("copyBtn");
  if (state.active) {
    const cfg = HOSTS[state.active.key];
    label.textContent = `— ${cfg.flag} ${cfg.name}`;
    saveBtn.disabled = false;
    copyBtn.disabled = false;
  } else {
    label.textContent = "— open a Norless tab";
    saveBtn.disabled = true;
    copyBtn.disabled = true;
  }
}

// Settings (background color + extension ID) live in chrome.storage.sync, shared across
// both pages and every device — so we read/write them directly here and show them always,
// whether or not a Norless tab is open. Open tabs pick up changes via chrome.storage.onChanged.
function renderSettings() {
  const body = document.getElementById("settingsBody");
  body.innerHTML = "";

  const settings = state.settings || {};
  const color = settings.pageBackgroundColor || "#000000";

  const block = document.createElement("div");
  block.className = "page-settings";
  block.appendChild(buildBackgroundField(color));
  block.appendChild(buildExtensionIdField(!!settings.useCustomExtensionId, settings.bibleExtensionId || ""));
  body.appendChild(block);
}

function buildBackgroundField(currentColor) {
  const colorField = document.createElement("div");
  colorField.className = "field";
  const colorLabel = document.createElement("label");
  colorLabel.textContent = "Background";
  colorField.appendChild(colorLabel);
  const color = document.createElement("input");
  color.type = "color";
  color.value = normalizeColor(currentColor);
  const colorText = document.createElement("input");
  colorText.type = "text";
  colorText.value = currentColor;
  const applyColor = value => {
    chrome.storage.sync.set({ pageBackgroundColor: value });
    if (state.settings) state.settings.pageBackgroundColor = value;
  };
  color.addEventListener("change", () => {
    colorText.value = color.value;
    applyColor(color.value);
  });
  colorText.addEventListener("change", () => {
    color.value = normalizeColor(colorText.value);
    applyColor(colorText.value);
  });
  colorField.appendChild(color);
  colorField.appendChild(colorText);
  return colorField;
}

// Extension ID: defaults to the fixed production id (read-only). Tick "Custom" to type a
// different id. Unticking switches back to production but keeps the stored custom value,
// so re-ticking restores it.
function buildExtensionIdField(useCustom, customId) {
  const field = document.createElement("div");
  field.className = "field stacked divided";

  const target = document.createElement("strong");
  target.className = "target-ext";
  target.textContent = TARGET_EXTENSION_NAME;
  field.appendChild(target);

  const head = document.createElement("div");
  head.className = "ext-head";

  const label = document.createElement("label");
  label.textContent = "Extension ID";
  head.appendChild(label);

  const checkWrap = document.createElement("label");
  checkWrap.className = "check";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = useCustom;
  checkWrap.appendChild(checkbox);
  checkWrap.appendChild(document.createTextNode("Custom"));
  head.appendChild(checkWrap);

  field.appendChild(head);

  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;

  const renderInput = () => {
    if (checkbox.checked) {
      input.readOnly = false;
      input.value = customId;
      input.placeholder = "custom extension id";
    } else {
      input.readOnly = true;
      input.value = DEFAULT_EXTENSION_ID;
      input.title = "Production id (not changeable)";
    }
  };
  renderInput();

  checkbox.addEventListener("change", () => {
    chrome.storage.sync.set({ useCustomExtensionId: checkbox.checked });
    if (state.settings) state.settings.useCustomExtensionId = checkbox.checked;
    renderInput();
  });
  input.addEventListener("change", () => {
    if (!checkbox.checked) return; // production id is fixed
    customId = input.value.trim();
    chrome.storage.sync.set({ bibleExtensionId: customId });
    if (state.settings) state.settings.bibleExtensionId = customId;
  });

  field.appendChild(input);
  return field;
}

function normalizeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#000000";
}

function render() {
  renderPages();
  renderWindows();
  renderSync();
  renderPlaylist();
  renderSettings();
}

// ----- actions -----

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 1800);
}

async function openOrFocus(key) {
  const cfg = HOSTS[key];
  const tab = await findMainTab(cfg.host);
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: cfg.url });
  }
  window.close();
}

async function refresh() {
  const [ro, ua, active, settings] = await Promise.all([
    send(HOSTS.ro.host, { action: "getState" }),
    send(HOSTS.ua.host, { action: "getState" }),
    getActiveNorlessTab(),
    chrome.storage.sync.get(["pageBackgroundColor", "bibleExtensionId", "useCustomExtensionId"])
  ]);
  state = { ro, ua, active, settings };
  render();
}

function wireStaticControls() {
  document.querySelectorAll(".page-link").forEach(btn => {
    btn.addEventListener("click", () => openOrFocus(btn.dataset.page));
  });

  document.querySelector("#saveBtn .ic").innerHTML = icons.lightSave;
  document.querySelector("#copyBtn .ic").innerHTML = icons.lightCopy;
  document.querySelector("#settings .chevron").innerHTML = icons.rightArrow;
  document.querySelector("#projectIcon").innerHTML = icons.lightLiveChat;

  document.getElementById("saveBtn").addEventListener("click", async () => {
    if (!state.active) return;
    const res = await send(HOSTS[state.active.key].host, { action: "savePlaylist" });
    showToast(res && res.ok ? "Playlist saved" : "Save failed");
  });

  document.getElementById("copyBtn").addEventListener("click", async () => {
    if (!state.active) return;
    const res = await send(HOSTS[state.active.key].host, { action: "copyPlaylist" });
    if (res && typeof res.text === "string") {
      try {
        await navigator.clipboard.writeText(res.text);
        showToast("Playlist copied");
        return;
      } catch (error) {
        console.debug("clipboard write failed:", error.message);
      }
    }
    showToast("Copy failed");
  });
}

wireStaticControls();
refresh();
