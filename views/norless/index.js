const backgroundImgOpacity = "backgroundImgOpacity";
const pageBackgroundColor = "pageBackgroundColor";
const backgroundMode = "backgroundMode";

// Track output windows opened from this page
let outputWindows = [];

function getCommonMenuItems(e) {
  const settings = getProjectTextSettings();
  const backgroundMode = getBackgroundMode();

  return [
    {
      text: "Background",
      shortcut: backgroundMode === "color" ? getPageBackgroundColor() : "Image",
      rightIcon: icons.rightArrow,
      icon: "🎨",
      itemId: "background-settings",
      handler: async () => {
        const menu = getContextMenu(
          [
            {
              text: "Color",
              icon: backgroundMode === "color" ? icons.checkedRadio : icons.uncheckedRadio,
              itemId: "pageBackgroundColor",
              rightIcon: "🎨",
              shortcut: getPageBackgroundColor(),
              handler: async () => {
                await toggleBackgroundMode("color");
                const oldColor = getPageBackgroundColor();
                const color = await simplePrompt("set background color (eg. #82663a)", oldColor);
                setPageBackgroundColor(color);
              }
            },
            {
              text: "Image",
              icon: backgroundMode === "image" ? icons.checkedRadio : icons.uncheckedRadio,
              itemId: "backgroundImage",
              rightIcon: "🧩",
              handler: async () => {
                await toggleBackgroundMode("image");
              }
            },
            "-",
            {
              text: "Opacity",
              icon: icons.settings,
              itemId: "backgroundImgOpacity",
              //rightIcon: "⬛",
              shortcut: getBackgroundImgOpacity() + "%",
              handler: async () => {
                const oldOpacity = getBackgroundImgOpacity();
                const opacity = await simplePrompt("set opacity percentage [ 0 - 100 ]", oldOpacity);
                setBackgroundImageOpacity(opacity);
              }
            }
          ],
          true
        );
        showByCursor(menu, e);
      }
    },
    {
      text: extensionName,
      shortcut: shortWindowNameMapping[settings.displayWindow],
      icon: icons.liveChat,
      rightIcon: icons.rightArrow,
      itemId: "projectText",
      handler: async () => {
        const menu = getContextMenu(
          [
            `Select window to project to:`,
            "-",
            ...getProjectWindowsSelectionMenu(settings.displayWindow),
            "-",
            {
              text: "Configure EXTENSION_ID",
              //icon: "⚙️",
              icon: icons.settings,
              itemId: "configureExtensionId",
              handler: async () => {
                const EXTENSION_ID = await simplePrompt(
                  `
                    <p>Sync with EXTENSION_ID for [${extensionName}]!</p>
                    <p style="line-height: 2.3em">Default Production ID: <span class="key-code">${defaultBibleExtensionId}</span></p>
                  `,
                  settings.extensionId
                );
                saveProjectTextSettings({
                  ...settings,
                  extensionId: EXTENSION_ID
                });
              }
            }
          ],
          true
        );

        //showBy(menu, e.target);
        showByCursor(menu, e);
      }
    }
  ];
}

function getProjectWindowsSelectionMenu(win) {
  async function handler(el, item) {
    const settings = getProjectTextSettings();
    saveProjectTextSettings({
      ...settings,
      displayWindow: item.data.state
    });
  }

  return [0, 1, 2, 3].map(n => {
    return {
      text: windowNameMapping[n],
      icon: win === n ? icons.checkedRadio : icons.uncheckedRadio,
      itemId: "projectWindow" + n,
      data: {
        state: n
      },
      active: win === n,
      handler
    };
  });
}

function getBackgroundMode() {
  return localStorage.getItem(backgroundMode) || "color";
}

function getPageBackgroundColor() {
  return localStorage.getItem(pageBackgroundColor) || "#000000";
}
function getBackgroundImgOpacity() {
  return localStorage.getItem(backgroundImgOpacity) || "0";
}

function updateAppTitle() {
  if (window.location.hostname === "app-ua.norless.com") {
    const title = $("title");
    if (title) {
      title.textContent = "Norless 🇺🇦";
    }
  }
}

async function initEvents() {
  updateAppTitle();

  if (window.location.pathname === "/template/output.html") {
    document.body.addEventListener(
      "contextmenu",
      function (e) {
        // Allow native Chrome context menu (for Cast, etc.) when CTRL is pressed
        if (e.ctrlKey) {
          e.preventDefault();
          showOutputContextMenu(e);
        }
      },
      false
    );
    const backgroundMode = getBackgroundMode();
    if (backgroundMode === "image") {
      document.body.classList.add("background-image");
    }

    // Listen for messages from main page
    window.addEventListener("message", e => {
      // Verify message is from same origin
      if (e.origin !== window.location.origin) return;

      const message = e.data;
      if (message.action === "toggleBackground") {
        document.body.classList.remove("background-image");
        if (message.mode === "image") {
          document.body.classList.add("background-image");
        }
        localStorage.setItem(backgroundMode, message.mode);
      } else if (message.action === "updateOpacity") {
        setBackgroundImageOpacity(message.opacity);
      } else if (message.action === "updateColor") {
        setPageBackgroundColor(message.color);
      }
    });

    // Register this window with opener
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ action: "registerOutput" }, window.location.origin);
    }

    const opacity = getBackgroundImgOpacity();
    setBackgroundImageOpacity(opacity);

    const pageBackgroundColor = getPageBackgroundColor();
    setPageBackgroundColor(pageBackgroundColor);
  } else {
    // Listen for output window registration
    window.addEventListener("message", e => {
      if (e.origin !== window.location.origin) return;

      if (e.data.action === "registerOutput" && e.source) {
        // Add to tracked windows if not already present
        if (!outputWindows.includes(e.source)) {
          outputWindows.push(e.source);
          console.info("Output window registered");
        }
      }
    });

    initPopupBridge();

    const playlist = await waitElement("#playlist");
    playlist &&
      document.body.addEventListener(
        "contextmenu",
        function (e) {
          // Allow native Chrome context menu when CTRL is pressed
          if (e.ctrlKey) {
            e.preventDefault();
            showContextMenu(e);
          }
        },
        false
      );
  }
}

// =======================
// Toolbar popup bridge (RPC endpoint for views/popup/)
// =======================
// The popup runs in the extension context and cannot read the page's localStorage
// directly, so it talks to this content script (which shares the page's localStorage)
// via chrome.tabs.sendMessage. All handlers reuse the existing settings functions.

function getPopupState() {
  const settings = getProjectTextSettings();
  return {
    host: window.location.hostname,
    displayWindow: settings.displayWindow,
    extensionId: settings.extensionId,
    backgroundMode: getBackgroundMode(),
    color: getPageBackgroundColor(),
    opacity: getBackgroundImgOpacity(),
    syncEnabled: isSyncEnabled()
  };
}

// Bridge to the page's main world to read `Entries._collection._docs._map`
// (unreachable from the isolated content script). Mirrors the inline `onmouseenter`
// snippet used by the right-click menu — the attribute handler runs in the page
// context and stamps the playlist JSON onto a DOM attribute we can then read.
function readSongsTarget() {
  const el = document.createElement("div");
  el.setAttribute("data-text", "{}");
  el.setAttribute("onmouseenter", "this.setAttribute('data-text', JSON.stringify(Entries._collection._docs._map))");
  document.body.appendChild(el);
  el.dispatchEvent(new Event("mouseenter"));
  el.remove();
  return el;
}

function initPopupBridge() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        const settings = getProjectTextSettings();
        switch (message.action) {
          case "getState":
            sendResponse(getPopupState());
            break;
          case "setDisplayWindow":
            saveProjectTextSettings({ ...settings, displayWindow: message.value });
            sendResponse({ ok: true });
            break;
          case "setExtensionId":
            saveProjectTextSettings({ ...settings, extensionId: message.id });
            sendResponse({ ok: true });
            break;
          case "setBackgroundMode": {
            const mode = message.mode === "image" ? "image" : "color";
            localStorage.setItem(backgroundMode, mode);
            document.body.classList.toggle("background-image", mode === "image");
            notifyOutputWindows({ action: "toggleBackground", mode });
            sendResponse({ ok: true });
            break;
          }
          case "setColor":
            setPageBackgroundColor(message.color);
            sendResponse({ ok: true });
            break;
          case "setOpacity":
            setBackgroundImageOpacity(message.opacity);
            sendResponse({ ok: true });
            break;
          case "toggleSync":
            sendResponse({ syncEnabled: toggleSync() });
            break;
          case "savePlaylist":
            saveAsHTML(readSongsTarget());
            sendResponse({ ok: true });
            break;
          case "copyPlaylist": {
            // Render the playlist to plain text here, but let the popup write it to the
            // clipboard — execCommand("copy") needs the page focused, which it isn't
            // while the popup is open.
            const html = getPlaylistDoc(readSongsTarget(), "📌 ", false);
            const text = await getInnerToClipboard(html);
            sendResponse({ text });
            break;
          }
          default:
            sendResponse({ error: "unknown action" });
        }
      } catch (error) {
        console.debug("Popup bridge error:", error.message);
        sendResponse({ error: error.message });
      }
    })();
    return true; // keep the message channel open for the async sendResponse
  });
}

function showOutputContextMenu(e) {
  const menu = getContextMenu([...getCommonMenuItems(e)]);
  showByCursor(menu, e);
}

async function toggleBackgroundMode(mode) {
  if (mode) {
    const currentMode = getBackgroundMode();
    const newMode = currentMode === mode ? "color" : mode;
    localStorage.setItem(backgroundMode, newMode);

    // Update current page
    document.body.classList.remove("background-image");
    if (newMode === "image") {
      document.body.classList.add("background-image");
    }

    // Notify output windows
    notifyOutputWindows({ action: "toggleBackground", mode: newMode });
  }
}

function notifyOutputWindows(message) {
  // Clean up closed windows
  outputWindows = outputWindows.filter(win => win && !win.closed);

  // Send message to all open output windows
  outputWindows.forEach(win => {
    try {
      win.postMessage(message, window.location.origin);
    } catch (error) {
      console.debug("Failed to send message to output window:", error.message);
    }
  });
}

function setPageBackgroundColor(color) {
  localStorage.setItem(pageBackgroundColor, color);
  const root = $(":root");
  root.style.setProperty("--" + pageBackgroundColor, color);

  // Notify output windows
  notifyOutputWindows({ action: "updateColor", color });
}

function setBackgroundImageOpacity(opacity) {
  opacity = parseInt(opacity) || 0;
  if (opacity < 0) {
    opacity = 0;
  } else if (opacity > 100) {
    opacity = 100;
  }
  localStorage.setItem(backgroundImgOpacity, opacity + "");
  const root = $(":root");
  root.style.setProperty("--" + backgroundImgOpacity, opacity / 100 + "");

  // Notify output windows
  notifyOutputWindows({ action: "updateOpacity", opacity });
}

function showContextMenu(e) {
  const storeText = "this.setAttribute('data-text', JSON.stringify(Entries._collection._docs._map))";
  // Sync (RO → UA) is only driven from the source app.
  const syncMenuItems =
    window.location.hostname === "app.norless.com"
      ? [
          {
            text: "Sync to 🇺🇦 app-ua",
            icon: isSyncEnabled() ? icons.checkedRadio : icons.uncheckedRadio,
            itemId: "toggleSync",
            handler: () => toggleSync()
          },
          "-"
        ]
      : [];
  const menu = getContextMenu([
    ...syncMenuItems,
    {
      text: "Save Playlist as HTML",
      icon: icons.export,
      itemId: "printable",
      onmouseenter: storeText,
      handler: target => {
        saveAsHTML(target);
      }
    },
    {
      text: "Copy Playlist to Clipboard",
      icon: icons.copy,
      itemId: "copy",
      onmouseenter: storeText,
      handler: async target => {
        await copyPlaylist(target);
      }
    },
    "-",
    ...getCommonMenuItems(e)
  ]);
  showByCursor(menu, e);
}

initEvents();
initEventsOnTextChanged();
