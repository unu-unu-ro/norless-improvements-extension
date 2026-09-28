/**
 * @param {String} text
 * @param {Boolean} markdown
 * @param {Number} index
 * @param {Boolean} nonBreakingHyphens
 * @return {Promise<any>}
 */
async function projectText(extensionId, text, markdown = false, index, nonBreakingHyphens = false) {
  console.info("Sending text to Norless runtime: %o", index, { text, markdown });
  // The text replaces any slide page projected from the toolbar popup → un-press it there.
  chrome.storage.local.remove("activeSlideId");

  try {
    return await chrome.runtime.sendMessage(extensionId, {
      action: "updateText",
      payload: {
        text,
        markdown,
        index,
        nonBreakingHyphens
      }
    });
  } catch (error) {
    console.debug("Could not send message to extension (extension may not be installed or tab not open):", error.message);
    return null;
  }
}

/**
 * The bible extension answers "help" from its service worker, so this tells us whether it's
 * installed & enabled (it then opens its projection windows by itself on "updateText").
 * @param {String} extensionId
 * @return {Promise<Boolean>}
 */
async function isBibleExtensionAvailable(extensionId) {
  try {
    const response = await chrome.runtime.sendMessage(extensionId, {
      action: "help"
    });
    return response?.status === 200;
  } catch (error) {
    console.debug("Bible extension not available:", error.message);
    return false;
  }
}
