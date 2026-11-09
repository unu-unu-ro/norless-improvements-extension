// =======================
// Demo: [Project verses from bible.com] External API — getVerses / projectVerses
// =======================
// Example, not loaded by the manifest: to try it, add it after settings.js in the norless.com
// content script. It runs on norless.com and logs the answers in the console.
//   - after 10s: getVerses     → the text of a reference, nothing is projected
//   - after 20s: projectVerses → bible.com opens the chapter and projects the verses
//   - after 25s: an invalid reference → status 422, nothing is projected
// References use USFM book codes (JHN, PSA) so they work in any bible.com language;
//   book names in the language open on bible.com work too (eg. "Ioan 3:16-17" for VDC).

async function sendVersesRequest(action, payload) {
  await settingsReady;
  const extensionId = getBibleExtensionId();
  try {
    return await chrome.runtime.sendMessage(extensionId, { action, payload });
  } catch (error) {
    console.debug(`${extensionName} ${action} failed (extension not installed?):`, error.message);
    return null;
  }
}

async function demoGetVerses(reference) {
  console.info("[verses API demo] getVerses %o ...", reference);
  const response = await sendVersesRequest("getVerses", { reference });
  if (response?.status === 200) {
    console.info("[verses API demo] %s (%s)\n%s", response.reference, response.version.name, response.text, response);
  } else {
    console.warn("[verses API demo] getVerses %o failed", reference, response);
  }
}

async function demoProjectVerses(reference) {
  console.info("[verses API demo] projectVerses %o ...", reference);
  const response = await sendVersesRequest("projectVerses", { reference });
  if (response?.status === 200) {
    console.info("[verses API demo] projecting %s", response.reference, response);
  } else {
    console.warn("[verses API demo] projectVerses %o failed", reference, response);
  }
}

setTimeout(() => demoGetVerses("JHN 3:16-17"), 2000);
setTimeout(() => demoGetVerses("Ioan 3:16-17"), 2000);
setTimeout(() => demoProjectVerses("PSA 23:1-3"), 3000);
// failing reference for testing
setTimeout(() => demoProjectVerses("Xyz 99:1"), 4000);
