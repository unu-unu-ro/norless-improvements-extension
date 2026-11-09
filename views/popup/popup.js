// Toolbar popup — norless.com link, slide pages and settings.
// The language per bible.com window lives in norless-live.js.

const NORLESS_URL = "https://norless.com/";

const WINDOW_LABELS = { 1: "Window 1", 2: "Window 2" };

// Fallback for the bible.com projection extension when nothing is stored yet
// (mirrors defaultBibleExtensionId in views/norless-live/settings.js).
const DEFAULT_EXTENSION_ID = "fklnkmnlobkpoiifnbnemdpamheoanpj";

// The extension this id targets (mirrors extensionName in views/norless-live/settings.js).
const TARGET_EXTENSION_NAME = "Project verses from bible.com";

// Full-screen pages projected (via updateFrame), e.g. before / after the church service.
// Configurable from Settings; kept in chrome.storage.local as "slidePages": [{ id, url }].
// Each button shows the page itself as a live preview: a full size iframe scaled down
// (a screenshot isn't possible — captureVisibleTab only captures tabs, never this popup).
const DEFAULT_SLIDE_URLS = [
  "https://info.unu-unu.ro/slides/start",
  // + others..
  "https://info.unu-unu.ro/slides/end"
];

// Id of the slide currently projected (chrome.storage.local "activeSlideId"), shown as
// pressed. Cleared when it's toggled off, or when Norless projects text (views/norless-live/bridge.js).
const ACTIVE_SLIDE_KEY = "activeSlideId";

// Viewport the preview iframes are laid out at (same 16:9 as the projection), then scaled.
const SLIDE_VIEWPORT = { width: 1280, height: 720 };

// Latest snapshot: { norlessOpen, settings, slidePages, activeSlideId }
let state = {};

// ----- rendering -----

function renderPages() {
  document.querySelector(".page-link .dot").classList.toggle("open", state.norlessOpen);
}

// Settings (extension ID) live in chrome.storage.sync, shared across every device — so we
// read/write them directly here. Open norless.com tabs pick up changes via chrome.storage.onChanged.
function renderSettings() {
  const body = document.getElementById("settingsBody");
  body.innerHTML = "";

  const settings = state.settings || {};

  const block = document.createElement("div");
  block.className = "page-settings";
  block.appendChild(buildExtensionIdField(!!settings.useCustomExtensionId, settings.bibleExtensionId || ""));
  block.appendChild(buildSlidesField());
  body.appendChild(block);
  renderSlideList();
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
// The label is centered until the iframe has loaded (fades in), then moves to a caption at the bottom.
function buildSlidePreview(page, width) {
  const preview = document.createElement("span");
  preview.className = "preview";

  const placeholder = document.createElement("span");
  placeholder.className = "placeholder";
  placeholder.textContent = slideLabel(page.url);
  const loading = document.createElement("span");
  loading.className = "loading";
  loading.textContent = "loading…";
  placeholder.appendChild(loading);
  preview.appendChild(placeholder);

  const frame = document.createElement("iframe");
  frame.tabIndex = -1;
  frame.style.width = `${SLIDE_VIEWPORT.width}px`;
  frame.style.height = `${SLIDE_VIEWPORT.height}px`;
  frame.style.transform = `scale(${width / SLIDE_VIEWPORT.width})`;
  preview.appendChild(frame);
  // Chrome shows the popup only after its "load" event, which waits for every iframe —
  // so the remote pages start loading only once the popup is visible.
  // (Listener added here: the src-less iframe already fires "load" for about:blank.)
  afterPopupLoad(() => {
    frame.addEventListener("load", () => preview.classList.add("loaded"), { once: true });
    frame.src = page.url;
  });

  return preview;
}

function afterPopupLoad(fn) {
  if (document.readyState === "complete") setTimeout(fn);
  else window.addEventListener("load", () => setTimeout(fn), { once: true });
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
  renderSettings();
}

// ----- actions -----

// Same resolution as getBibleExtensionId() in views/norless-live/settings.js.
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

async function findNorlessTab() {
  const [tab] = await chrome.tabs.query({ url: `${NORLESS_URL}*` });
  return tab || null;
}

async function openOrFocusNorless() {
  const tab = await findNorlessTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: NORLESS_URL });
  }
  window.close();
}

async function refresh() {
  const [norlessTab, settings, slidePages, { [ACTIVE_SLIDE_KEY]: activeSlideId }] = await Promise.all([
    findNorlessTab(),
    chrome.storage.sync.get(["bibleExtensionId", "useCustomExtensionId"]),
    getSlidePages(),
    chrome.storage.local.get(ACTIVE_SLIDE_KEY)
  ]);
  state = { norlessOpen: !!norlessTab, settings, slidePages, activeSlideId };
  render();
}

function wireStaticControls() {
  // Norless projecting text replaces the slide → un-press it (views/norless-live/bridge.js).
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[ACTIVE_SLIDE_KEY]) return;
    state.activeSlideId = changes[ACTIVE_SLIDE_KEY].newValue;
    renderActiveSlide();
  });

  document.querySelector(".page-link").addEventListener("click", openOrFocusNorless);

  document.querySelector("#settings .chevron").innerHTML = icons.rightArrow;
  document.querySelector("#settingsIcon").innerHTML = icons.lightSettings;
  document.querySelectorAll(".ic.project-icon").forEach(icon => {
    icon.innerHTML = icons.lightLiveChat;
  });
}

wireStaticControls();
refresh();
