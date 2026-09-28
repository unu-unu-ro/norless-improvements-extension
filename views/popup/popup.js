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

// Full-screen pages projected (via updateFrame), e.g. before / after the church service.
// Configurable from Settings; kept in chrome.storage.local as "slidePages": [{ id, url }].
// Each button shows the page itself as a live preview: a full size iframe scaled down
// (a screenshot isn't possible — captureVisibleTab only captures tabs, never this popup).
const DEFAULT_SLIDE_URLS = [
  "https://info.unu-unu.ro/slides-open-close/start",
  "https://info.unu-unu.ro/slides-open-close/end"
];

// Id of the slide currently projected (chrome.storage.local "activeSlideId"), shown as
// pressed. Cleared when it's toggled off, or when Norless projects text (runtime-messages.js).
const ACTIVE_SLIDE_KEY = "activeSlideId";

// Viewport the preview iframes are laid out at (same 16:9 as the projection), then scaled.
const SLIDE_VIEWPORT = { width: 1280, height: 720 };

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
  document.querySelectorAll(".page-link .dot").forEach(dot => {
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
  block.appendChild(buildSlidesField());
  body.appendChild(block);
  renderSlideList();
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

// ----- slide pages -----

async function getSlidePages() {
  const { slidePages } = await chrome.storage.local.get("slidePages");
  // Drop "thumbnail" left by the earlier (screenshot) version.
  if (Array.isArray(slidePages)) return slidePages.map(({ id, url }) => ({ id, url }));
  // First run: seed with the default pages.
  const defaults = DEFAULT_SLIDE_URLS.map(url => ({ id: newSlideId(), url }));
  await setSlidePages(defaults);
  return defaults;
}

async function setSlidePages(pages) {
  state.slidePages = pages;
  await chrome.storage.local.set({ slidePages: pages });
}

function newSlideId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Short text shown until the preview has loaded: last path segment, or the host.
function slideLabel(url) {
  try {
    const { hostname, pathname } = new URL(url);
    return pathname.split("/").filter(Boolean).pop() || hostname;
  } catch {
    return url;
  }
}

// Live preview: the page laid out at SLIDE_VIEWPORT, scaled down to the button's width.
// The label stays behind it until the iframe has loaded (fades in).
function buildSlidePreview(page, width) {
  const preview = document.createElement("span");
  preview.className = "preview";

  const placeholder = document.createElement("span");
  placeholder.className = "placeholder";
  placeholder.textContent = slideLabel(page.url);
  preview.appendChild(placeholder);

  const frame = document.createElement("iframe");
  frame.tabIndex = -1;
  frame.style.width = `${SLIDE_VIEWPORT.width}px`;
  frame.style.height = `${SLIDE_VIEWPORT.height}px`;
  frame.style.transform = `scale(${width / SLIDE_VIEWPORT.width})`;
  frame.addEventListener("load", () => frame.classList.add("loaded"), { once: true });
  frame.src = page.url;
  preview.appendChild(frame);

  return preview;
}

function renderSlides() {
  const container = document.getElementById("slides");
  container.innerHTML = "";
  const pages = state.slidePages || [];
  container.classList.toggle("hidden", !pages.length);
  pages.forEach(page => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slide-link";
    btn.dataset.id = page.id;
    btn.title = page.url;
    btn.addEventListener("click", () => toggleSlidePage(page));
    container.appendChild(btn);
    // Appended first, so the grid has sized it and we know the scale.
    btn.appendChild(buildSlidePreview(page, btn.clientWidth));
    const dot = document.createElement("span");
    dot.className = "dot"; // shown while pressed (projected)
    btn.appendChild(dot);
  });
  renderActiveSlide();
}

// Only toggles the pressed state — re-rendering would reload the preview iframes.
function renderActiveSlide() {
  document.querySelectorAll(".slide-link").forEach(btn => {
    const active = btn.dataset.id === state.activeSlideId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active);
  });
}

async function setActiveSlide(id) {
  state.activeSlideId = id;
  renderActiveSlide();
  if (id) await chrome.storage.local.set({ [ACTIVE_SLIDE_KEY]: id });
  else await chrome.storage.local.remove(ACTIVE_SLIDE_KEY);
}

// Pressed slide → stop it (empty text, same as Esc); otherwise project it.
async function toggleSlidePage(page) {
  if (state.activeSlideId === page.id) {
    if (await clearProjection()) await setActiveSlide(null);
  } else if (await projectSlidePage(page.url)) {
    await setActiveSlide(page.id);
  }
}

// Settings: list of slide URLs (✕ remove) + "add URL" input.
function buildSlidesField() {
  const field = document.createElement("div");
  field.className = "field stacked divided";

  const label = document.createElement("label");
  label.textContent = "Slides (projected full screen)";
  field.appendChild(label);

  const list = document.createElement("div");
  list.id = "slideList";
  list.className = "slide-list";
  field.appendChild(list);

  const addRow = document.createElement("div");
  addRow.className = "slide-add";
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.placeholder = "https://...";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "Add";
  const add = async () => {
    const url = input.value.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      showToast("Enter a valid http(s) URL");
      return;
    }
    await setSlidePages([...(state.slidePages || []), { id: newSlideId(), url }]);
    input.value = "";
    renderSlides();
    renderSlideList();
  };
  addBtn.addEventListener("click", add);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") add();
  });
  addRow.appendChild(input);
  addRow.appendChild(addBtn);
  field.appendChild(addRow);

  return field;
}

function renderSlideList() {
  const list = document.getElementById("slideList");
  if (!list) return;
  list.innerHTML = "";
  (state.slidePages || []).forEach(page => {
    const row = document.createElement("div");
    row.className = "slide-row";

    const url = document.createElement("span");
    url.className = "slide-url";
    url.textContent = page.url;
    url.title = page.url;
    row.appendChild(url);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "✕";
    remove.title = "Remove";
    remove.addEventListener("click", async () => {
      await setSlidePages(state.slidePages.filter(p => p.id !== page.id));
      if (state.activeSlideId === page.id) await setActiveSlide(null);
      renderSlides();
      renderSlideList();
    });
    row.appendChild(remove);

    list.appendChild(row);
  });
}

function render() {
  renderPages();
  renderSlides();
  renderWindows();
  renderSync();
  renderPlaylist();
  renderSettings();
}

// ----- actions -----

// Same resolution as getProjectTextSettings() in bible-verses-integration.js.
function getBibleExtensionId() {
  const settings = state.settings || {};
  return settings.useCustomExtensionId && settings.bibleExtensionId ? settings.bibleExtensionId : DEFAULT_EXTENSION_ID;
}

// Show an external page full size in all open projection windows (see README of
// [Project verses from bible.com] - External API - updateFrame).
// Returns true when it was projected.
async function projectSlidePage(url) {
  return sendToBibleExtension("updateFrame", { url }, `Projecting ${slideLabel(url)}`);
}

// Empty text in all projection windows (index undefined = all) — same as Esc in Norless.
async function clearProjection() {
  return sendToBibleExtension("updateText", { text: "", markdown: false }, "Projection cleared");
}

async function sendToBibleExtension(action, payload, successMessage) {
  try {
    const res = await chrome.runtime.sendMessage(getBibleExtensionId(), { action, payload });
    if (res && res.status === 200) {
      showToast(successMessage);
      return true;
    }
    showToast(res && res.error ? res.error : "Open the projector window first");
  } catch (error) {
    console.debug(`${action} failed:`, error.message);
    showToast(`${TARGET_EXTENSION_NAME} not available`);
  }
  return false;
}

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
  const [ro, ua, active, settings, slidePages, { [ACTIVE_SLIDE_KEY]: activeSlideId }] = await Promise.all([
    send(HOSTS.ro.host, { action: "getState" }),
    send(HOSTS.ua.host, { action: "getState" }),
    getActiveNorlessTab(),
    chrome.storage.sync.get(["pageBackgroundColor", "bibleExtensionId", "useCustomExtensionId"]),
    getSlidePages(),
    chrome.storage.local.get(ACTIVE_SLIDE_KEY)
  ]);
  state = { ro, ua, active, settings, slidePages, activeSlideId };
  render();
}

function wireStaticControls() {
  // Norless projecting text replaces the slide → un-press it (runtime-messages.js).
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[ACTIVE_SLIDE_KEY]) return;
    state.activeSlideId = changes[ACTIVE_SLIDE_KEY].newValue;
    renderActiveSlide();
  });

  document.querySelectorAll(".page-link").forEach(btn => {
    btn.addEventListener("click", () => openOrFocus(btn.dataset.page));
  });


  document.querySelector("#saveBtn .ic").innerHTML = icons.lightSave;
  document.querySelector("#copyBtn .ic").innerHTML = icons.lightCopy;
  document.querySelector("#settings .chevron").innerHTML = icons.rightArrow;
  document.querySelector("#settingsIcon").innerHTML = icons.lightSettings;
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
