# 📈 Release Notes (Changelog)

for [Chrome extension for Norless improvements](README.md) by [@Matei Nicolae](https://nmatei.github.io) - Source [github.com/unu-unu-ro/norless-improvements-extension](https://github.com/unu-unu-ro/norless-improvements-extension)

Works together with [Project verses from bible.com](https://chromewebstore.google.com/detail/project-verses-from-bible/fklnkmnlobkpoiifnbnemdpamheoanpj) extension.

## 2.4.0 (soon)

- [x] 🪟 **No more Norless output window** while projecting through the bible.com extension: the `template/output.html` popup is replaced by a **hidden output** inside the Norless page, so there are fewer windows in the Dock / menu bar (one less for each open Norless page — `app.norless.com` and `app-ua.norless.com`)
  - songs are still read from the Norless output (title, progress, key, next line, italic refrain, no chords) and sent to the bible.com projection windows, which the bible extension **opens automatically**
  - the **classic output popup** is used only when the bible.com extension is **not installed / disabled**, or when projection is set to `Disable projection` — eg. for rehearsals
  - switching live between the two modes (from the right-click menu or the toolbar popup) closes the popup / hidden output and **re-shows the current slide** in the right place
- [x] 🖼️ **Configurable slide pages** in the toolbar popup (replace the fixed **S** / **E** buttons):
  - add / remove any number of URLs from ⚙️ Settings → **Slides**
  - each button shows a **live preview** of its page (scaled down), **3 per row**; click one to project that page full size
  - the projected slide stays **pressed** (highlighted border + red dot); click it again to **clear the projection** (empty text, same as `Esc`) — it's released automatically when Norless projects a song
  - URLs are saved in the extension's local storage

## 2.3.0 (2026-09-26)

- [x] 🎬 New **Start (S)** and **End (E)** buttons in the toolbar popup: project a full size **start page** (before the service) or **end page** (after the service — announcements) in all open bible.com projection windows

## 2.2.0 (2026-06-27)

- [x] ☁️ Settings (background color, bible.com extension id, sync toggle, projection window) are now saved in **Chrome sync storage**: they roam across your devices and are shared between `app.norless.com` and `app-ua.norless.com`; the projection window stays **per app**, so RO and UA can each project to a different window
- [x] 🧹 Closing the main Norless page now **also closes its output window** (`template/output.html`) — kept open while another page of the same app is still open
- [x] 🎨 Updated settings button and title in the toolbar popup

## 2.1.0 (2026-06-13)

- [x] 🧰 New toolbar **popup** (click the extension icon) for quick access to common actions:
  - 🇷🇴 / 🇺🇦 open or focus `app.norless.com` / `app-ua.norless.com` (status dot when a page is open)
  - 📖 choose the bible.com **projection window** for each app, with a warning when both apps claim the same window
  - 🇺🇦 toggle **Sync to app-ua**
  - 📃 **Save playlist as HTML** / **Copy playlist**
  - ⚙️ Background & extension id settings
- [x] 🇺🇦 **Sync to app-ua** also follows slide changes made with the `Page Up` / `Page Down` keys
- [x] 🎨 New extension icon (Norless + `cast borders`)

## 2.0.0 (2026-06-07)

- [x] 🇺🇦 New **Sync to app-ua**: mirror selections from `app.norless.com` (RO) into `app-ua.norless.com` (UA) when both are open (opt-in toggle, off by default)
  - selecting a song selects the matching `RO / UA` song in app-ua
  - clicking a slide projects the same slide (by index) in app-ua
  - pressing `ESC` (stop projecting) is mirrored to app-ua
  - toasts in app-ua when a song isn't found or has a different number of slides

## 1.0.0 (2025-12-25)

- [x] 📖 Project songs through the [Project verses from bible.com](https://chromewebstore.google.com/detail/project-verses-from-bible/fklnkmnlobkpoiifnbnemdpamheoanpj) extension (window 1, window 2 or both), with title, progress, key signature and next line
  - refrains (`R:`) shown in _italics_, and a final mark 🌤 on the last slide
- [x] 📩 **Save playlist as HTML** and 📋 **Copy playlist to clipboard** (right-click menu on the song list) — repeating all refrains when a song has several different ones
- [x] 🖨️ Print friendly styles for the saved playlist
- [x] 🎨 Custom **background** color for the output window
