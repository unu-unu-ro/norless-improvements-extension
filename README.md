# Chrome extension for Norless improvements

![icon](views/icons/icon-48.png)

✨ This extension is for improving user experience on [Norless - Projecting Church Songs](http://app.norless.com/) website.

## 💠 Features

`Shift + Right Click` on song list to open context menu with options:

- [x] 📩 Save Playlist as HTML
- [x] 📋 Copy Playlist to Clipboard
- [x] 🎨 Background
  - [x] 🎨 Color
  - [x] 🧩 Image
  - [x] ⬛ Opacity
- [x] 📖 Project verses from bible.com (install: [here](https://chrome.google.com/webstore/detail/project-verses-from-biblecom/fklnkmnlobkpoiifnbnemdpamheoanpj))
- [x] 🇺🇦 Sync to app-ua — mirror selections from [app.norless.com](http://app.norless.com/) into [app-ua.norless.com](http://app-ua.norless.com/) when both are open (opt-in toggle, off by default)
  - [x] selecting a song selects the matching `RO / UA` song in app-ua
  - [x] clicking a slide projects the same slide (by index) in app-ua
  - [x] pressing `ESC` (stop projecting) is mirrored to app-ua
  - [x] toasts in app-ua when a song isn't found or has a different number of slides

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
