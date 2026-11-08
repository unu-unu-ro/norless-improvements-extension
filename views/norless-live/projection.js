// =======================
// norless.com → [Project verses from bible.com] windows: what each window shows
// =======================
// The new Norless (https://norless.com) posts a "norless:live" message on its own window
// with what's live, as plain text in every language (Norless manual: "Messages for
// extensions"). This file maps one message to the messages for one projection window.
// No chrome.* / DOM here (unit tested in projection.test.js).
// Uses getTextToProject() and finalCharacter from views/norless/bible-verses-integration.js.

// chrome.storage.sync: { 1: "ro", 2: "ru" } — the language each window shows; missing or "" = disabled.
const NORLESS_WINDOW_LANGUAGES_KEY = "norlessWindowLanguages";
// chrome.storage.local: the languages of the last message, offered in the popup.
const NORLESS_SEEN_LANGUAGES_KEY = "norlessSeenLanguages";

// The language a window shows: the one picked in the popup, "" (disabled) until then, so
// a browser that never picked one (eg. planning at home) never opens the bible.com windows.
function getWindowLanguage(index, stored, languages) {
  const chosen = stored && stored[index];
  return typeof chosen === "string" ? chosen : "";
}

// The bible.com windows as the hello tells them to Norless, which shows each as a projector
// with its language (null: Disabled). Norless manual: "Messages for extensions".
function getHelloWindows(stored) {
  return [1, 2].map(index => ({
    name: `Window ${index}`,
    language: getWindowLanguage(index, stored) || null
  }));
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The HTML for one language, like the old app's output: progress, key, title, lines,
// next line, italic chorus and the final mark on the last part. "" when the message has
// no text in that language (eg. a song without a version in it).
function getLiveText(live, language) {
  const text = live.languages[language];
  if (!text) {
    return "";
  }
  const { part } = text;
  const paragraphs = text.lines.map(escapeHtml);
  if (part && part.n === part.total && paragraphs.length) {
    paragraphs[paragraphs.length - 1] += finalCharacter;
  }
  return getTextToProject({
    progress: part ? `${part.n}/${part.total}` : "",
    key: live.key ? escapeHtml(live.key) : "",
    title: escapeHtml(text.title),
    refrain: part ? part.kind === "chorus" : false,
    paragraphs,
    nextLine: text.next ? escapeHtml(text.next) : ""
  });
}

// What a window shows before any message: unknown (null) text and page.
function getUnknownWindowState() {
  return { text: null, frame: null };
}

/**
 * The messages for one window, and what it shows after them.
 * - blank, or nothing live: empty text
 * - a page (before / after the service): updateFrame with its url; removed when it leaves
 * - a reading: the window is left alone (the verses come from bible.com)
 * - a song or a moment: its text in `language`; nothing sent when it's unchanged
 * @param {Object} live a "norless:live" message
 * @param {String} language eg. "ro"
 * @param {{text: String|null, frame: String|null}} shown what the window shows (null = unknown)
 * @return {{shown: {text: String|null, frame: String|null}, messages: Array<{action: String, payload: Object}>}}
 */
function getWindowMessages(live, language, shown) {
  const messages = [];
  let { text, frame } = shown;

  if (!live.blank && live.kind === "page" && live.page) {
    if (frame !== live.page) {
      messages.push({ action: "updateFrame", payload: { url: live.page } });
    }
    return { shown: { text, frame: live.page }, messages };
  }

  if (frame !== "") {
    messages.push({ action: "updateFrame", payload: { url: "" } });
    frame = "";
  }

  if (!live.blank && live.kind === "reading") {
    // bible.com replaces the text with its verses
    return { shown: { text: null, frame }, messages };
  }

  const nextText = live.blank || !live.kind ? "" : getLiveText(live, language);
  if (nextText !== text) {
    messages.push({ action: "updateText", payload: { text: nextText, markdown: false } });
  }
  return { shown: { text: nextText, frame }, messages };
}
