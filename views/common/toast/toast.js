/**
 * Lightweight toast notifications.
 * Toasts stack in a fixed container (top-right) and auto-remove.
 *
 * @param {String} message
 * @param {"info"|"error"|"success"} type
 * @param {Number} duration ms before auto-dismiss
 * @returns {HTMLElement} the toast element
 */
function showToast(message, type = "info", duration = 3000) {
  let container = document.getElementById("extension-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "extension-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `extension-toast extension-toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // trigger enter transition
  requestAnimationFrame(() => toast.classList.add("show"));

  const remove = () => {
    toast.classList.remove("show");
    setTimeout(() => {
      try {
        container.removeChild(toast);
      } catch (error) {}
    }, 200);
  };

  toast.addEventListener("click", remove);
  if (duration > 0) {
    setTimeout(remove, duration);
  }

  return toast;
}
