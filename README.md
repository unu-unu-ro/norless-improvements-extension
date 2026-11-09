# Chrome extension for Norless improvements

![icon](views/icons/icon-48.png)

✨ This extension projects [Norless](https://norless.com/) in the windows of the [Project verses from bible.com](https://chrome.google.com/webstore/detail/project-verses-from-biblecom/fklnkmnlobkpoiifnbnemdpamheoanpj) extension.

## 💠 Features

- [x] 🎵 [norless.com](https://norless.com/): what's live (songs, text slides, start / end pages) is projected in the bible.com windows, each window in its own language
  - [x] toolbar popup → **Project norless.com via bible.com**: a language for `Window 1` and `Window 2` (eg. Romanian and Russian), or `Disabled`; both start `Disabled`, so nothing is projected until a language is picked
  - [x] Norless shows each window as a projector in its screens menu, with its language and a preview (the hello tells it the windows)
  - [x] a page up before / after the service is shown full size (`updateFrame`); a Bible reading leaves the window to bible.com
  - [x] with several norless.com tabs open, the tab focused last projects
- [x] 🔗 toolbar popup → **norless.com** button: focuses the open norless.com tab, or opens one
- [x] 🖼️ toolbar popup → **slide pages**: live previews of configurable pages (⚙️ Settings → Slides), click one to project it full size, click again to clear
- [x] ⚙️ Settings → **Extension ID**: the production bible.com extension, or a custom id (for development)
- [x] 📖 [verses-api-demo.js](views/norless-live/verses-api-demo.js): example of the bible.com extension's `getVerses` / `projectVerses` API

## 📈 Release Notes

Check [release-notes.md](release-notes.md) changelog

## ⚙ Setup Plugin as Developer

If you want to try to install it as Developer

- [x] **Download/Clone** this repo
  - [ ] as zip & Unzip it
  - [x] or `git clone https://github.com/unu-unu-ro/norless-improvements-extension.git`
  - [x] to update use `git pull`
- [x] Open [chrome://extensions/](chrome://extensions/)
  - [x] Activate `Developer mode`
- [x] **Load unpacked** Extension
- [x] Select `chrome-personal-improvements` folder
