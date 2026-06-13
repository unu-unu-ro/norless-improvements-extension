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

function renderSettings() {
  const body = document.getElementById("settingsBody");
  body.innerHTML = "";

  ["ro", "ua"].forEach(key => {
    const cfg = HOSTS[key];
    const pageState = state[key];
    const block = document.createElement("div");
    block.className = "page-settings";

    const h3 = document.createElement("h3");
    h3.textContent = `${cfg.flag} ${cfg.name} (${cfg.host})`;
    block.appendChild(h3);

    if (!pageState) {
      const note = document.createElement("div");
      note.className = "closed-note";
      note.textContent = "Tab not open.";
      block.appendChild(note);
      body.appendChild(block);
      return;
    }

    block.appendChild(buildBackgroundFields(key, pageState));
    block.appendChild(buildExtensionIdField(key, pageState));
    body.appendChild(block);
  });
}

function buildBackgroundFields(key, pageState) {
  const frag = document.createDocumentFragment();
  const host = HOSTS[key].host;

  // Mode radios
  const modeField = document.createElement("div");
  modeField.className = "field";
  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Background";
  modeField.appendChild(modeLabel);

  const radios = document.createElement("div");
  radios.className = "radios";
  ["color", "image"].forEach(mode => {
    const wrap = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `bgmode-${key}`;
    radio.checked = pageState.backgroundMode === mode;
    radio.addEventListener("change", async () => {
      await send(host, { action: "setBackgroundMode", mode });
      pageState.backgroundMode = mode;
    });
    wrap.appendChild(radio);
    wrap.appendChild(document.createTextNode(mode === "color" ? "🎨 Color" : "🧩 Image"));
    radios.appendChild(wrap);
  });
  modeField.appendChild(radios);
  frag.appendChild(modeField);

  // Color picker
  const colorField = document.createElement("div");
  colorField.className = "field";
  const colorLabel = document.createElement("label");
  colorLabel.textContent = "Color";
  colorField.appendChild(colorLabel);
  const color = document.createElement("input");
  color.type = "color";
  color.value = normalizeColor(pageState.color);
  const colorText = document.createElement("input");
  colorText.type = "text";
  colorText.value = pageState.color;
  const applyColor = async value => {
    await send(host, { action: "setColor", color: value });
    pageState.color = value;
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
  frag.appendChild(colorField);

  // Opacity
  const opacityField = document.createElement("div");
  opacityField.className = "field";
  const opacityLabel = document.createElement("label");
  opacityLabel.textContent = "Img opacity %";
  opacityField.appendChild(opacityLabel);
  const opacity = document.createElement("input");
  opacity.type = "number";
  opacity.min = "0";
  opacity.max = "100";
  opacity.value = pageState.opacity;
  opacity.addEventListener("change", async () => {
    await send(host, { action: "setOpacity", opacity: opacity.value });
    pageState.opacity = opacity.value;
  });
  opacityField.appendChild(opacity);
  frag.appendChild(opacityField);

  return frag;
}

function buildExtensionIdField(key, pageState) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.textContent = "Extension ID";
  field.appendChild(label);
  const input = document.createElement("input");
  input.type = "text";
  input.value = pageState.extensionId;
  input.spellcheck = false;
  input.addEventListener("change", async () => {
    await send(HOSTS[key].host, { action: "setExtensionId", id: input.value.trim() });
    pageState.extensionId = input.value.trim();
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
  const [ro, ua, active] = await Promise.all([send(HOSTS.ro.host, { action: "getState" }), send(HOSTS.ua.host, { action: "getState" }), getActiveNorlessTab()]);
  state = { ro, ua, active };
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
