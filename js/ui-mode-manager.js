const { IPC_CHANNELS } = require("./constants");

class UIModeManager {
  constructor() {
    this.isUIMode = false;
    this.windows = new Map(); // Track UI mode per window
  }

  /**
   * Toggle UI mode for a specific window
   * @param {number} windowId - The window ID
   * @returns {boolean} The new UI mode state
   */
  toggleUIMode(windowId) {
    const currentMode = this.windows.get(windowId) || false;
    const newMode = !currentMode;
    this.windows.set(windowId, newMode);
    this.isUIMode = newMode;
    return newMode;
  }

  /**
   * Set UI mode for a specific window
   * @param {number} windowId - The window ID
   * @param {boolean} enabled - Whether UI mode should be enabled
   */
  setUIMode(windowId, enabled) {
    this.windows.set(windowId, enabled);
    this.isUIMode = enabled;
  }

  /**
   * Get current UI mode for a window
   * @param {number} windowId - The window ID
   * @returns {boolean} Current UI mode state
   */
  getUIMode(windowId) {
    return this.windows.get(windowId) || false;
  }

  /**
   * Reset UI mode for all windows
   */
  resetAll() {
    this.windows.clear();
    this.isUIMode = false;
  }

  /**
   * Get the appropriate prompt based on UI mode
   * @param {number} windowId - The window ID
   * @returns {string} The prompt type to use
   */
  getPromptType(windowId) {
    return this.getUIMode(windowId) ? 'ui' : 'logic';
  }

  /**
   * Send UI mode status to renderer
   * @param {BrowserWindow} window - The browser window
   */
  sendUIModeStatus(window) {
    if (window && window.webContents) {
      const windowId = window.id;
      const isUIMode = this.getUIMode(windowId);
      window.webContents.send(IPC_CHANNELS.UI_IMPLEMENTATION_MODE, isUIMode);

      // Send notification about mode change
      const modeText = isUIMode ? "UI Implementation Mode" : "Logic/Problem Solving Mode";
      window.webContents.send(IPC_CHANNELS.NOTIFICATION, {
        type: "info",
        message: `Switched to ${modeText}`,
      });
    }
  }
}

// Create singleton instance
const uiModeManager = new UIModeManager();

module.exports = uiModeManager;