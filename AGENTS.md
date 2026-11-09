# Agent Instructions for Norless improvements

## Agent Configuration

`AGENTS.md` is the single source of truth for AI assistant rules. The other files only point here:

| File | Tool | Contents |
|---|---|---|
| `CLAUDE.md` | Claude Code | `@AGENTS.md` |
| `.github/copilot-instructions.md` | GitHub Copilot | one-line link to `AGENTS.md` |

When updating these rules, edit `AGENTS.md` — never add content to the pointer files.

## Project Overview

A Chrome extension (Manifest V3) that projects [norless.com](https://norless.com/) in the windows of the
[Project verses from bible.com] extension, each window in its own language, plus a toolbar popup
(norless.com link, slide pages, settings). Pure JavaScript and CSS, no frameworks.

The old apps `app.norless.com` / `app-ua.norless.com` are deprecated and no longer supported.

## Core Architecture

### Technology Stack

- **Pure JavaScript (ES6+)** - No frameworks (React, Vue, Angular, etc.)
- **Vanilla CSS** - No preprocessors or CSS-in-JS
- **Chrome Extension APIs** - Manifest V3
- **Content Scripts** - Injected into norless.com (classic scripts sharing one global scope)
- **No service worker** - the popup and content scripts message the bible.com extension directly

### Project Structure

```
views/
  ├── common/
  │   └── utilities.js        # Shared helpers ($, $$, waitElement, ...) — kept for future use
  ├── icons/                  # Extension icons + icons.js (inline SVGs for the popup)
  ├── norless-live/           # norless.com → bible.com windows (content scripts)
  │   ├── settings.js         # bible.com extension id (chrome.storage.sync), getBibleExtensionId()
  │   ├── projection.js       # Pure: "norless:live" message → messages for one window (unit tested)
  │   ├── projection.test.js  # Jest tests for projection.js
  │   ├── bridge.js           # norless:hello / norless:live, sends to the bible.com windows
  │   └── verses-api-demo.js  # Example of getVerses / projectVerses (not loaded by the manifest)
  └── popup/                  # Toolbar popup
      ├── popup.html / popup.css
      ├── popup.js            # norless.com link, slide pages, settings
      └── norless-live.js     # Language per bible.com window
```

## Code Style & Patterns

### JavaScript Conventions

1. **Function Style**
   - Prefer `async/await` over promise chains
   - Use arrow functions for callbacks
   - Function declarations for main functions

2. **Naming Conventions**
   - camelCase for variables and functions
   - Descriptive names that indicate purpose

3. **Storage**
   - Settings that roam across devices: `chrome.storage.sync` (eg. `norlessWindowLanguages`, `bibleExtensionId`)
   - Per-browser state: `chrome.storage.local` (eg. `slidePages`, `activeSlideId`, `norlessActiveTab`)
   - Content scripts and the popup share state through `chrome.storage.onChanged`

4. **Pure logic stays testable**
   - Keep chrome.* / DOM out of `projection.js`; the test loads it with `vm` like Chrome does

### Common Utility Functions

`views/common/utilities.js` is kept on purpose, to be used by future features (don't delete it because
nothing uses it yet). It's loaded first in the norless.com content script, so its helpers are global
there. Reuse them instead of writing new ones:

- `$(selector, parent)` - Query single element
- `$$(selector, parent)` - Query multiple elements (returns array)
- `sleep(ms)` - Promise-based delay
- `waitElement(selector, timeout)` - Wait for element to appear
- `debounce(fn, delay)` - Debounce function calls
- `copyToClipboard(text)` - Copy text to clipboard
- `download(text, name, type)` - Save text as a file

## Chrome Extension Integration

### Inter-Extension Communication

When communicating with the bible.com extension:

```javascript
try {
  const response = await chrome.runtime.sendMessage(extensionId, {
    action: "actionName",
    payload: { data }
  });
} catch (error) {
  console.debug("Extension communication failed:", error.message);
  // Handle gracefully - extension may not be installed
}
```

### Page ↔ content script

norless.com and `bridge.js` talk with `window.postMessage` on the page's own window
(`norless:hello` from the extension, `norless:live` from Norless — Norless manual: "Messages for extensions").
Always check `event.source === window` and `event.origin === location.origin`.

### Manifest Configuration

- Use Manifest V3 syntax
- One content script entry for `https://norless.com/*`: `common/utilities.js`, `settings.js`, `projection.js`, `bridge.js` (in this order)
- Permissions: minimal required set

## CSS Guidelines

1. **Variables** - Popup colors are tokens on `:root` in `popup.css`
2. **Naming** - Use kebab-case for class names
3. **Layout** - Prefer flexbox/grid for layouts

## Testing & Debugging

- `npm test` runs Jest (`projection.test.js`)
- Use `console.info()` for feature actions, `console.debug()` for detailed logs
- Test in Chrome with developer mode (Load unpacked)
- Check content script injection in DevTools > Sources

## Important Rules

1. **No Frameworks** - Keep the codebase vanilla JS/CSS
2. **Minimal Dependencies** - Avoid external libraries
3. **Graceful Degradation** - Features should fail silently if the bible.com extension or elements are missing
4. **Chrome APIs** - Use modern Manifest V3 APIs
5. **Cross-Extension** - Handle inter-extension messaging failures gracefully
6. **Docs** - Document features in README.md and changes in release-notes.md

## Code Review Checklist

- [ ] Uses existing utility functions (`views/common/utilities.js`)
- [ ] Follows naming conventions
- [ ] No external dependencies added
- [ ] Uses async/await properly
- [ ] Handles errors gracefully
- [ ] Pure logic kept in projection.js and covered by tests
- [ ] manifest.json updated correctly
- [ ] Works with Chrome Manifest V3
