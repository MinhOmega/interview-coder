const { PROCESSING_MODES, IPC_CHANNELS } = require("./constants");
const log = require("electron-log");
const toastManager = require("./toast-manager");

class ModeManager {
  constructor() {
    this.currentMode = PROCESSING_MODES.ANALYTICS; // Default mode
    this.modeDescriptions = {
      [PROCESSING_MODES.ANALYTICS]: {
        name: "Analytics Mode",
        shortName: "Analytics",
        description: "Detailed problem analysis with comprehensive solution",
        icon: "📊",
        color: "#4A90E2",
        instruction: "Analytics Mode - Provides detailed problem analysis and comprehensive solutions",
      },
      [PROCESSING_MODES.UI_IMPLEMENTATION]: {
        name: "UI Implementation Mode",
        shortName: "UI",
        description: "React/Next.js component implementation",
        icon: "🎨",
        color: "#7B68EE",
        instruction: "UI Mode - Generates React/Next.js components from design screenshots",
      },
      [PROCESSING_MODES.QUICK_ANSWER]: {
        name: "Quick Answer Mode",
        shortName: "Quick",
        description: "Direct answers and solutions",
        icon: "⚡",
        color: "#50C878",
        instruction: "Quick Answer Mode - Provides direct, concise answers to questions",
      },
    };
  }

  /**
   * Sets the current processing mode
   * @param {string} mode - The mode to set
   * @param {BrowserWindow} mainWindow - The main window to send updates to
   * @param {boolean} updateInstruction - Whether to update the instruction (default: true)
   * @returns {boolean} Success status
   */
  setMode(mode, mainWindow, updateInstruction = true) {
    if (!Object.values(PROCESSING_MODES).includes(mode)) {
      log.error(`[MODE-MANAGER] Invalid mode: ${mode}`);
      return false;
    }

    const previousMode = this.currentMode;

    // Don't do anything if mode hasn't changed
    if (mode === previousMode) {
      return true;
    }

    this.currentMode = mode;

    const modeInfo = this.modeDescriptions[mode];
    log.info(`[MODE-MANAGER] Mode changed from ${previousMode} to ${mode}`);

    // Show toast notification
    toastManager.info(`${modeInfo.icon} Switched to ${modeInfo.name}`);

    // Send mode update to renderer (single update)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.MODE_CHANGED, {
        mode: mode,
        modeInfo: modeInfo,
      });

      // Update instruction with the mode info if requested
      if (updateInstruction) {
        const windowManager = require("./window-manager");
        const screenshotManager = require("./screenshot-manager");
        const hotkeyManager = require("./hotkey-manager");

        const instruction = this.getModeInstruction(
          screenshotManager.getScreenshots().length > 0,
          screenshotManager.getScreenshots().length,
          hotkeyManager.getModifierKey(),
        );
        windowManager.updateInstruction(instruction);
      }
    }

    return true;
  }

  /**
   * Gets the current processing mode
   * @returns {string} Current mode
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Gets the mode information
   * @param {string} mode - The mode to get info for (optional, defaults to current)
   * @returns {object} Mode information
   */
  getModeInfo(mode = null) {
    const targetMode = mode || this.currentMode;
    return this.modeDescriptions[targetMode];
  }

  /**
   * Cycles to the next mode
   * @param {BrowserWindow} mainWindow - The main window to send updates to
   * @returns {string} The new mode
   */
  cycleMode(mainWindow) {
    const modes = Object.values(PROCESSING_MODES);
    const currentIndex = modes.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];

    this.setMode(nextMode, mainWindow);
    return nextMode;
  }

  /**
   * Gets the instruction message for the current mode
   * @param {boolean} hasScreenshots - Whether there are screenshots
   * @param {number} screenshotCount - Number of screenshots
   * @param {string} modifierKey - The modifier key for hotkeys
   * @returns {string} Instruction message
   */
  getModeInstruction(hasScreenshots = false, screenshotCount = 0, modifierKey = "Ctrl") {
    const modeInfo = this.modeDescriptions[this.currentMode];

    if (hasScreenshots) {
      if (screenshotCount === 1) {
        return `${modeInfo.icon} ${modeInfo.shortName} Mode - Ready to process screenshot. Press ${modifierKey}+Enter to analyze`;
      } else {
        return `${modeInfo.icon} ${modeInfo.shortName} Mode - ${screenshotCount} screenshots ready. Press ${modifierKey}+Enter to analyze`;
      }
    }

    return `${modeInfo.icon} ${modeInfo.instruction}`;
  }

  /**
   * Checks if the current mode is Analytics
   * @returns {boolean}
   */
  isAnalyticsMode() {
    return this.currentMode === PROCESSING_MODES.ANALYTICS;
  }

  /**
   * Checks if the current mode is UI Implementation
   * @returns {boolean}
   */
  isUIMode() {
    return this.currentMode === PROCESSING_MODES.UI_IMPLEMENTATION;
  }

  /**
   * Checks if the current mode is Quick Answer
   * @returns {boolean}
   */
  isQuickAnswerMode() {
    return this.currentMode === PROCESSING_MODES.QUICK_ANSWER;
  }

  /**
   * Resets to the default mode (Analytics)
   * @param {BrowserWindow} mainWindow - The main window to send updates to
   */
  resetMode(mainWindow) {
    this.setMode(PROCESSING_MODES.ANALYTICS, mainWindow);
  }
}

// Export singleton instance
module.exports = new ModeManager();