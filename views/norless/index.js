function getCommonMenuItems(e) {
  const settings = getProjectTextSettings();

  return [
    {
      text: "Background",
      shortcut: getPageBackgroundColor(),
      icon: "🎨",
      itemId: "background-settings",
      handler: async () => {
        const oldColor = getPageBackgroundColor();
        const color = await simplePrompt("set background color (eg. #82663a)", oldColor);
        if (color) {
          setPageBackgroundColor(color);
        }
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
                    <p style="opacity: 0.7">Leave empty to use the production id.</p>
                  `,
                  settings.extensionId
                );
                setCustomBibleExtensionId(EXTENSION_ID);
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

function getPageBackgroundColor() {
  return getStoredSetting("pageBackgroundColor", "#000000");
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
    // Apply the stored background color, and keep it live: chrome.storage.onChanged
    // fires here whenever the main page (any origin) changes the color.
    await settingsReady;
    applyBackgroundColor(getPageBackgroundColor());
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.pageBackgroundColor) {
        applyBackgroundColor(changes.pageBackgroundColor.newValue);
      }
    });
  } else {
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
// The popup talks to this content script via chrome.tabs.sendMessage so it can drive
// page-specific actions (playlist export, displayWindow assignment) and read the live
// settings cache. All handlers reuse the existing settings functions.

function getPopupState() {
  const settings = getProjectTextSettings();
  return {
    host: window.location.hostname,
    displayWindow: settings.displayWindow,
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
        await settingsReady;
        const settings = getProjectTextSettings();
        switch (message.action) {
          case "getState":
            sendResponse(getPopupState());
            break;
          case "setDisplayWindow":
            saveProjectTextSettings({ ...settings, displayWindow: message.value });
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

function applyBackgroundColor(color) {
  $(":root").style.setProperty("--pageBackgroundColor", color || "#000000");
}

// Persist the color to chrome.storage.sync and apply it here. Other tabs/windows
// (including the output window, on any origin) pick it up via chrome.storage.onChanged.
function setPageBackgroundColor(color) {
  setStoredSetting("pageBackgroundColor", color);
  applyBackgroundColor(color);
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
