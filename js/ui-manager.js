// UI-related functionality
const { ipcRenderer } = require('electron');
const { isMac, modifierKey } = require('./app-config');

// Show a notification
function showNotification(message, type = 'info', duration = 3000) {
  const notificationEl = document.getElementById('notification');
  if (!notificationEl) return;

  // Clear any existing timeout
  if (notificationEl.timeoutId) {
    clearTimeout(notificationEl.timeoutId);
  }

  // Set notification content and type
  notificationEl.textContent = message;
  notificationEl.className = 'notification'; // Reset classes
  notificationEl.classList.add(type);

  // Show notification
  notificationEl.style.display = 'block';
  notificationEl.style.opacity = '1';

  // Hide after duration
  notificationEl.timeoutId = setTimeout(() => {
    notificationEl.style.opacity = '0';
    setTimeout(() => {
      notificationEl.style.display = 'none';
    }, 300); // transition duration
  }, duration);
}

// Show a loading indicator
function showLoading(message = 'Loading...') {
  const loadingEl = document.getElementById('loading');
  const loadingTextEl = document.getElementById('loading-text');
  
  if (loadingEl && loadingTextEl) {
    loadingTextEl.textContent = message;
    loadingEl.style.display = 'flex';
  }
}

// Hide loading indicator
function hideLoading() {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.style.display = 'none';
  }
}

// Set up the visibility toggle for password fields
function setupPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      const passwordField = e.currentTarget.previousElementSibling;
      const eyeShow = e.currentTarget.querySelector('.eye-show');
      const eyeHide = e.currentTarget.querySelector('.eye-hide');

      if (passwordField.type === 'password') {
        passwordField.type = 'text';
        eyeShow.style.display = 'none';
        eyeHide.style.display = 'block';
      } else {
        passwordField.type = 'password';
        eyeShow.style.display = 'block';
        eyeHide.style.display = 'none';
      }
    });
  });
}

// Disable all form inputs during loading
function disableInputs(disable = true) {
  document.querySelectorAll('input, button, select, textarea').forEach(el => {
    if (el.id !== 'cancel') { // Allow cancelling even when disabled
      el.disabled = disable;
    }
  });
}

// Enable keyboard shortcuts
function setupKeyboardShortcuts() {
  // Add keyboard shortcut for saving settings (Cmd+S on Mac, Ctrl+S on Windows/Linux)
  document.addEventListener('keydown', (e) => {
    // Save shortcut
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      const saveButton = document.getElementById('save-settings');
      if (saveButton && !saveButton.disabled) {
        saveButton.click();
      }
    }
    
    // Cancel/close shortcut (Esc)
    if (e.key === 'Escape') {
      const cancelButton = document.getElementById('cancel');
      if (cancelButton) {
        cancelButton.click();
      }
    }
  });
}

// Initialize UI event listeners
function initUI() {
  setupPasswordToggles();
  setupKeyboardShortcuts();
  
  // Show keyboard shortcut hints
  const saveButton = document.getElementById('save-settings');
  if (saveButton) {
    const shortcutHint = document.createElement('span');
    shortcutHint.className = 'shortcut-hint';
    shortcutHint.textContent = `${modifierKey}+S`;
    saveButton.appendChild(shortcutHint);
  }
  
}

module.exports = {
  showNotification,
  showLoading,
  hideLoading,
  disableInputs,
  initUI
}; 