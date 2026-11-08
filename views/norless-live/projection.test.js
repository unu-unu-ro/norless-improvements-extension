// Loads the content scripts as Chrome does (classic scripts sharing one global scope).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = vm.createContext({ $: () => null });
["../norless/bible-verses-integration.js", "projection.js"].forEach(file => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context);
});
const { getWindowLanguage, getWindowMessages, getUnknownWindowState, getHelloWindows } = context;
const finalCharacter = vm.runInContext("finalCharacter", context);

const chorus = {
  type: "norless:live",
  kind: "song",
  blank: false,
  key: "G",
  page: null,
  languages: {
    ro: {
      title: "Har minunat",
      part: { label: "R", kind: "chorus", n: 2, total: 4 },
      lines: ["Slavă ție ×2", "Doamne"],
      next: "Am fost pierdut"
    },
    ru: {
      title: "О благодать",
      part: { label: "R", kind: "chorus", n: 2, total: 2 },
      lines: ["Слава <Тебе>"],
      next: null
    }
  }
};
const page = { type: "norless:live", kind: "page", blank: false, key: null, page: "https://example.org/start", languages: {} };
const reading = {
  type: "norless:live",
  kind: "reading",
  blank: false,
  key: null,
  page: null,
  languages: { ro: { title: "Ioan 3:16", part: null, lines: [], next: null } }
};

const shown = (text, frame = "") => ({ text, frame });
const actions = result => result.messages.map(m => `${m.action}:${m.action === "updateFrame" ? m.payload.url || '""' : m.payload.text ? "text" : '""'}`);

describe("getWindowLanguage", () => {
  test("disabled until a language is picked", () => {
    expect(getWindowLanguage(1, {}, ["ro", "ru"])).toBe("");
    expect(getWindowLanguage(2, {}, ["ro", "ru"])).toBe("");
    expect(getWindowLanguage(2, undefined, ["ro", "uk"])).toBe("");
  });
  test("the stored choice wins, '' disables", () => {
    expect(getWindowLanguage(1, { 1: "en" }, ["ro"])).toBe("en");
    expect(getWindowLanguage(2, { 2: "" }, ["ru"])).toBe("");
  });
});

describe("getHelloWindows", () => {
  test("both windows, each with its language, null while Disabled", () => {
    // Plain JSON, since the vm context has its own Array prototype.
    expect(JSON.parse(JSON.stringify(getHelloWindows({ 1: "ro", 2: "" })))).toEqual([
      { name: "Window 1", language: "ro" },
      { name: "Window 2", language: null }
    ]);
    expect(JSON.parse(JSON.stringify(getHelloWindows(undefined)))).toEqual([
      { name: "Window 1", language: null },
      { name: "Window 2", language: null }
    ]);
  });
});

describe("getWindowMessages", () => {
  test("a song: its text in the window's language, like the old output", () => {
    const { messages } = getWindowMessages(chorus, "ro", shown(null));
    expect(messages).toHaveLength(1);
    const { text, markdown } = messages[0].payload;
    expect(markdown).toBe(false);
    expect(text).toContain(">2/4</span>");
    expect(text).toContain(">G</span>");
    expect(text).toContain("Har minunat");
    expect(text).toContain("<p><strong>Slavă ție ×2</strong></p><p><strong>Doamne</strong></p>");
    expect(text).toContain("font-style: italic;");
    expect(text).toContain("nextline");
    expect(text).toContain("Am fost pierdut");
    expect(text).not.toContain(finalCharacter);
  });

  test("the last part gets the final mark; lines are escaped", () => {
    const { text } = getWindowMessages(chorus, "ru", shown(null)).messages[0].payload;
    expect(text).toContain("Слава &lt;Тебе&gt;" + finalCharacter);
    expect(text).not.toContain("nextline");
  });

  test("a verse isn't italic", () => {
    const verse = { ...chorus, languages: { ro: { ...chorus.languages.ro, part: { label: "1", kind: "verse", n: 1, total: 4 } } } };
    expect(getWindowMessages(verse, "ro", shown(null)).messages[0].payload.text).not.toContain("italic");
  });

  test("unchanged text isn't sent again", () => {
    const first = getWindowMessages(chorus, "ro", shown(null));
    expect(getWindowMessages(chorus, "ro", first.shown).messages).toEqual([]);
  });

  test("blank, nothing live, or a language the song lacks: empty text", () => {
    const text = getWindowMessages(chorus, "ro", shown(null)).shown.text;
    expect(actions(getWindowMessages({ ...chorus, blank: true }, "ro", shown(text)))).toEqual(['updateText:""']);
    expect(actions(getWindowMessages({ ...chorus, kind: null, languages: {} }, "ro", shown(text)))).toEqual(['updateText:""']);
    expect(actions(getWindowMessages(chorus, "uk", shown(text)))).toEqual(['updateText:""']);
    expect(getWindowMessages({ ...chorus, blank: true }, "ro", shown("")).messages).toEqual([]);
  });

  test("a page: updateFrame once, removed when it leaves", () => {
    const up = getWindowMessages(page, "ro", shown("x"));
    expect(actions(up)).toEqual(["updateFrame:https://example.org/start"]);
    expect(getWindowMessages(page, "ro", up.shown).messages).toEqual([]);
    // back to the same text: only the page goes
    expect(actions(getWindowMessages({ ...chorus, kind: null, languages: {} }, "ro", { text: "", frame: up.shown.frame }))).toEqual(['updateFrame:""']);
  });

  test("a blank page is blank", () => {
    expect(actions(getWindowMessages({ ...page, blank: true }, "ro", shown("x", "https://example.org/start")))).toEqual(['updateFrame:""', 'updateText:""']);
  });

  test("a reading leaves the window alone, then the next text is sent even if it's the same", () => {
    const before = getWindowMessages(chorus, "ro", shown(null)).shown;
    const during = getWindowMessages(reading, "ro", before);
    expect(during.messages).toEqual([]);
    expect(actions(getWindowMessages(chorus, "ro", during.shown))).toEqual(["updateText:text"]);
  });

  test("a reading after a page removes the page", () => {
    expect(actions(getWindowMessages(reading, "ro", shown("x", "https://example.org/start")))).toEqual(['updateFrame:""']);
  });

  test("unknown window (first message, another tab projected before): any page is removed first", () => {
    expect(actions(getWindowMessages(chorus, "ro", getUnknownWindowState()))).toEqual(['updateFrame:""', "updateText:text"]);
  });
});
