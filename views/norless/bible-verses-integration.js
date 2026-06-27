// =======================
// Norrless constant and variables
// =======================

const changeContentTarget = $("#holder_text");

// =======================
// Itegration with: [Project verses from bible.com] Extension
// =======================

// TODOs:
// - allod more styling options? (bold, italic, colors, etc, extra classes?)

const extensionName = "Project verses from bible.com";
const defaultBibleExtensionId = "fklnkmnlobkpoiifnbnemdpamheoanpj";

let lastProjectedText = "";

//const finalCharacter = " ✝";
const finalCharacter = '<span class="final" style="position: relative;top: -0.5em;font-size: 80%;font-style: normal;">🌤</span>';

const shortWindowNameMapping = {
  0: "Disabled",
  1: "Window 1",
  2: "Window 2",
  3: "Both windows"
};

const windowNameMapping = {
  0: "Disable projection",
  1: "Project to window 1",
  2: "Project to window 2",
  3: "Project to both windows"
};

// =======================
// Project Text Utilities
// =======================

function getTextToProject({ progress, key, title, refrain, paragraphs, nextLine } = {}) {
  // leave some space at bottom if next line exists (1.2em should be enough for one line)
  const nextLineStyle = "opacity: 0.5; position: fixed; bottom: 10px; font-size: 0.7em;";
  const refrainStyle = refrain ? "font-style: italic;" : "";

  return `
    <h1 class="reference" style="font-variant-caps: normal; letter-spacing: normal;">
      ${progress ? `<span class="version" style="font-size: 0.8em; letter-spacing: 0.2rem;">${progress}</span>` : ""}
      ${key ? `<span class="version" style="font-size: 0.8em; opacity: 1;">${key}</span>` : ""}
      <span style="opacity: 0.6">${title}</span>
    </h1>
    <div class="singlelines bold" style="${nextLine ? "padding: 0 0 1.2em 0;" : ""}; ${refrainStyle}">
      ${paragraphs.map(line => `<p><strong>${line}</strong></p>`).join("")}
    </div>
    ${nextLine ? `<div class="singlelines nextline" style="${nextLineStyle}"><p><strong>${nextLine}</strong></p></div>` : ""}
  `;
}

function getDefaultProjectTextSettings() {
  return {
    extensionId: defaultBibleExtensionId,
    displayWindow: 0 // 0 = disabled, 1 = window 1, 2 = window 2, 3 = both windows
  };
}

function getProjectTextSettings() {
  const defaults = getDefaultProjectTextSettings();
  const useCustom = getStoredSetting("useCustomExtensionId", false);
  const customId = getStoredSetting("bibleExtensionId", "");
  return {
    // shared across both apps: the fixed production id unless a custom id is enabled
    extensionId: useCustom && customId ? customId : defaults.extensionId,
    // per-origin, so RO and UA can each project to a different window
    displayWindow: getStoredSetting(DISPLAY_WINDOW_KEY, defaults.displayWindow)
  };
}

// Only the projection target window is per-origin; the extension id is managed
// separately (shared) via setCustomBibleExtensionId / the popup checkbox.
function saveProjectTextSettings(settings) {
  setStoredSetting(DISPLAY_WINDOW_KEY, settings.displayWindow);
}

// Set/clear the custom bible.com extension id (shared across both apps). Passing an empty
// value just switches back to the production id WITHOUT discarding the stored custom id.
function setCustomBibleExtensionId(id) {
  const trimmed = (id || "").trim();
  if (trimmed) {
    setStoredSetting("bibleExtensionId", trimmed);
    setStoredSetting("useCustomExtensionId", true);
  } else {
    setStoredSetting("useCustomExtensionId", false);
  }
}

function getProjectIndexes(displayWindow) {
  if (displayWindow === 1) {
    return [1];
  } else if (displayWindow === 2) {
    return [2];
  } else if (displayWindow === 3) {
    return [undefined]; // undefined projects to both windows
  }
  // 0 = disabled, don't project
  return [];
}

function onTextChanged(splitTitle, italicRefrainStyle) {
  const { extensionId, displayWindow } = getProjectTextSettings();
  const indexes = getProjectIndexes(displayWindow);
  const refrain = italicRefrainStyle && !!$("#container.form_R");

  const progress = $("#holder_slide_progress").innerText;
  const key = $("#holder_key_signature").innerText;
  let title = $("#holder_title").innerText;

  const textWrapper = $("div", changeContentTarget);
  // using innerText to get only visible parts and ignore chord (eg. <span class="chord">Intro</span>)
  // TODO remove 'strong' tag and allow styling from projected text?
  const paragraphs = $$("p", textWrapper).map(p => {
    if (p.querySelector(".final")) {
      return p.innerText + finalCharacter;
    }
    return p.innerText;
  });

  const nextLine = $("#holder_next_line div")?.innerText;

  if (splitTitle && title.includes("/")) {
    title = title.split("/")[1].trim();
  }

  const textToProject = getTextToProject({ progress, key, title, refrain, paragraphs, nextLine });

  if (textToProject === lastProjectedText) {
    console.info("Norless text unchanged, not projecting");
    return;
  }

  lastProjectedText = textToProject;
  indexes.forEach(index => {
    projectText(extensionId, textToProject, false, index);
  });
}

// =======================
// Exported function
// =======================
async function initEventsOnTextChanged() {
  if (window.location.pathname !== "/template/output.html") {
    return;
  }
  if (!changeContentTarget) {
    console.info("Norless text change target not found");
    return;
  }

  // Ensure projectTextSettings is loaded before the first projection.
  await settingsReady;

  const splitTitle = window.location.hostname === "app-ua.norless.com";
  const italicRefrainStyle = !splitTitle;

  const observer = new MutationObserver(mutations => {
    mutations.forEach(() => {
      console.info("Norless text changed");
      onTextChanged(splitTitle, italicRefrainStyle);
    });
  });
  observer.observe(changeContentTarget, {
    childList: true,
    characterData: true,
    subtree: true
  });
}
