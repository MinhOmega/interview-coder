const { modifierKey } = require("./app-config");

function showNotification(message, type = "info", duration = 3000) {
  const notificationEl = document.getElementById("notification");
  if (!notificationEl) return;

  if (notificationEl.timeoutId) {
    clearTimeout(notificationEl.timeoutId);
  }

  notificationEl.textContent = message;
  notificationEl.className = "notification";
  notificationEl.classList.add(type);

  notificationEl.style.display = "block";
  notificationEl.style.opacity = "1";

  notificationEl.timeoutId = setTimeout(() => {
    notificationEl.style.opacity = "0";
    setTimeout(() => {
      notificationEl.style.display = "none";
    }, 300);
  }, duration);
}

function showLoading(message = "Loading...") {
  const loadingEl = document.getElementById("loading");
  const loadingTextEl = document.getElementById("loading-text");

  if (loadingEl && loadingTextEl) {
    loadingTextEl.textContent = message;
    loadingEl.style.display = "flex";
  }
}

function hideLoading() {
  const loadingEl = document.getElementById("loading");
  if (loadingEl) {
    loadingEl.style.display = "none";
  }
}

function disableInputs(disable = true) {
  document.querySelectorAll("input, button, select, textarea").forEach((el) => {
    if (el.id !== "cancel") {
      el.disabled = disable;
    }
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      const saveButton = document.getElementById("save-settings");
      if (saveButton && !saveButton.disabled) {
        saveButton.click();
      }
    }

    if (e.key === "Escape") {
      const cancelButton = document.getElementById("cancel");
      if (cancelButton) {
        cancelButton.click();
      }
    }
  });
}

function initUI() {
  setupKeyboardShortcuts();

  const saveButton = document.getElementById("save-settings");
  if (saveButton) {
    const shortcutHint = document.createElement("span");
    shortcutHint.className = "shortcut-hint";
    shortcutHint.textContent = `${modifierKey}+S`;
    saveButton.appendChild(shortcutHint);
  }
}

module.exports = {
  showNotification,
  showLoading,
  hideLoading,
  disableInputs,
  initUI,
};
