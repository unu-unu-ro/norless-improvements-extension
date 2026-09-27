// =======================
// Hidden output window (MAIN world)
// =======================
// Norless opens /template/output.html as a popup (window.open) and then drives it via
// output_window.win.window.do_display(content). When we project through the
// [Project verses from bible.com] extension that popup is only a text source, so we swap
// it for an off-screen iframe inside the main page: no extra window in the Dock / menu bar.
//
// output.html already supports being framed (Norless uses an iframe on touch devices):
// on load it runs `parent.output_window.win = {window}; parent.output_window.callback()`.
// Our content scripts run inside the iframe too (all_frames) and read the text as before.
//
// Runs in the page's MAIN world (window.open / output_window belong to the page), so no
// extension utilities are available here. The isolated world tells us whether to hide the
// output via <html data-norless-hidden-output="1|0"> (see syncHiddenOutputFlag in index.js).

(function () {
  const OUTPUT_PATH = "/template/output.html";
  const IFRAME_CLASS = "norless-hidden-output";
  const FLAG_ATTR = "data-norless-hidden-output";

  const originalOpen = window.open;
  let lastDisplayed = null;

  function isHidden() {
    return document.documentElement.getAttribute(FLAG_ATTR) === "1";
  }

  function getIframe() {
    return document.querySelector("iframe." + IFRAME_CLASS);
  }

  // Rendered but off-screen: display:none / visibility:hidden would break innerText
  // (used to skip chords and keep line breaks) in bible-verses-integration.js.
  function createIframe() {
    const iframe = document.createElement("iframe");
    iframe.className = IFRAME_CLASS;
    iframe.src = OUTPUT_PATH;
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.cssText =
      "position: fixed; left: -10000px; top: 0; width: 1280px; height: 720px; border: 0; pointer-events: none;";
    document.body.appendChild(iframe);
    return iframe;
  }

  window.open = function (url, ...rest) {
    if (isHidden() && String(url || "").includes(OUTPUT_PATH)) {
      console.info("Norless output: using hidden iframe instead of popup");
      return (getIframe() || createIframe()).contentWindow;
    }
    return originalOpen.call(this, url, ...rest);
  };

  // Remember the last live object so we can re-render it right after switching mode.
  function wrapDisplay() {
    const ow = window.output_window;
    if (!ow || typeof ow.display !== "function" || ow.display.__norlessWrapped) {
      return;
    }
    const display = ow.display;
    ow.display = function (liveObject) {
      lastDisplayed = liveObject;
      return display.apply(this, arguments);
    };
    ow.display.__norlessWrapped = true;
  }

  // Tear down whichever output doesn't match the current mode; Norless recreates the right
  // one (through our window.open) on the next display, which we trigger immediately.
  function applyMode() {
    const ow = window.output_window;
    if (!ow) {
      return;
    }
    const iframe = getIframe();
    const current = ow.win && ow.win.window;

    if (isHidden()) {
      if (!current || (iframe && current === iframe.contentWindow)) {
        return;
      }
      try {
        current.close();
      } catch (error) {
        console.debug("Norless output: closing popup failed:", error.message);
      }
    } else {
      if (!iframe) {
        return;
      }
      iframe.remove();
    }

    ow.win = false;
    if (lastDisplayed) {
      ow.display(lastDisplayed);
    }
  }

  new MutationObserver(applyMode).observe(document.documentElement, {
    attributes: true,
    attributeFilter: [FLAG_ATTR]
  });

  // The Norless bundle is loaded synchronously in <head>, so output_window exists by now.
  document.addEventListener("DOMContentLoaded", () => {
    wrapDisplay();
    applyMode();
  });
})();
