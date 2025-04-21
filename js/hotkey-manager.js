const { globalShortcut } = require("electron");
const { isLinux, isWindows, modifierKey } = require("./config");
const log = require("electron-log");

let lastToggleTime = 0;
const TOGGLE_DEBOUNCE_MS = 300;

// Define shortcuts using only the platform-specific modifier key
const SHORTCUTS = {
  TOGGLE_VISIBILITY: {
    key: `${modifierKey}+B`,
    handler: null,
    alwaysActive: true,
    description: "Show/Hide the main window",
  },
  PROCESS_SCREENSHOTS: {
    key: `${modifierKey}+Enter`,
    handler: null,
    description: "Process existing screenshots with AI",
  },
  OPEN_SETTINGS: {
    key: `${modifierKey}+,`,
    handler: null,
    description: "Open settings window",
  },
  MOVE_LEFT: {
    key: `${modifierKey}+Shift+Left`,
    handler: null,
    description: "Move window left",
  },
  MOVE_RIGHT: {
    key: `${modifierKey}+Shift+Right`,
    handler: null,
    description: "Move window right",
  },
  MOVE_UP: {
    key: `${modifierKey}+Shift+Up`,
    handler: null,
    description: "Move window up",
  },
  MOVE_DOWN: {
    key: `${modifierKey}+Shift+Down`,
    handler: null,
    description: "Move window down",
  },
  SCROLL_UP: {
    key: `Shift+Up`,
    handler: null,
    description: "Scroll content up",
  },
  SCROLL_DOWN: {
    key: `Shift+Down`,
    handler: null,
    description: "Scroll content down",
  },
  INCREASE_WINDOW_SIZE: {
    key: `${modifierKey}+Shift+=`,
    handler: null,
    description: "Increase window size",
  },
  DECREASE_WINDOW_SIZE: {
    key: `${modifierKey}+Shift+-`,
    handler: null,
    description: "Decrease window size",
  },
  TAKE_SCREENSHOT: {
    key: `${modifierKey}+H`,
    handler: null,
    description: "Take a full screenshot and process with AI",
  },
  AREA_SCREENSHOT: {
    key: `${modifierKey}+D`,
    handler: null,
    description: "Take a screenshot of a selected area and process with AI",
  },
  MULTI_PAGE: {
    key: `${modifierKey}+A`,
    handler: null,
    description: "Add a screenshot in multi-mode",
  },
  RESET: {
    key: `${modifierKey}+R`,
    handler: null,
    description: "Reset and start over",
  },
  QUIT: {
    key: `${modifierKey}+Q`,
    handler: null,
    description: "Quit the application",
  },
  TOGGLE_SPLIT_VIEW: {
    key: `${modifierKey}+T`,
    handler: null,
    description: "Toggle split view",
  },
  TOGGLE_DEVTOOLS: {
    key: `${modifierKey}+Shift+I`,
    handler: null,
    description: "Toggle developer tools",
  },
  SHOW_HOTKEYS: {
    key: `${modifierKey}+/`,
    handler: null,
    description: "Show this hotkey information",
  },
};

// Wrap original handlers to log hotkey press
function wrapHandlerWithLogging(shortcutKey, handler) {
  return () => {
    log.info(`Hotkey pressed: ${shortcutKey}`);
    handler();
  };
}

// Register shortcut handlers
function registerHandlers(handlers) {
  Object.keys(handlers).forEach((key) => {
    if (SHORTCUTS[key]) {
      // Store original handler for wrapping
      const originalHandler = handlers[key];

      // Platform-specific debouncing for toggle visibility
      if ((isLinux || isWindows) && key === "TOGGLE_VISIBILITY") {
        SHORTCUTS[key].handler = () => {
          const now = Date.now();
          // Prevent rapid firing of toggle which can cause hangs
          if (now - lastToggleTime < TOGGLE_DEBOUNCE_MS) {
            log.info("Toggle debounced - ignoring rapid keypress");
            return;
          }
          lastToggleTime = now;

          try {
            // Log the hotkey press
            log.info(`Hotkey pressed: ${SHORTCUTS[key].key}`);
            originalHandler();
          } catch (error) {
            log.error("Error in toggle visibility handler:", error);
            // Attempt recovery on error by unregistering and re-registering shortcuts
            setTimeout(() => {
              try {
                updateHotkeys(true);
              } catch (e) {
                log.error("Failed to recover hotkeys:", e);
              }
            }, 500);
          }
        };
      } else {
        // Wrap all other handlers with logging
        SHORTCUTS[key].handler = wrapHandlerWithLogging(SHORTCUTS[key].key, originalHandler);
      }
    }
  });
}

// Function to manage hotkey registration based on visibility
function updateHotkeys(isVisible) {
  try {
    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    // Record registration success rate
    let totalShortcuts = 0;
    let successfulRegistrations = 0;

    // Register shortcuts based on visibility state
    Object.values(SHORTCUTS).forEach((shortcut) => {
      if ((isVisible || shortcut.alwaysActive) && shortcut.handler) {
        totalShortcuts++;
        try {
          // Register the shortcut with platform-specific modifier
          let registered = false;

          try {
            registered = globalShortcut.register(shortcut.key, shortcut.handler);
            if (registered) {
              // Remove verbose logging of each shortcut registration
              successfulRegistrations++;
            } else {
              log.warn(`Failed to register ${shortcut.key} shortcut`);
            }
          } catch (regError) {
            log.warn(`Error registering shortcut ${shortcut.key}: ${regError.message}`);
          }
        } catch (error) {
          // Log but don't crash the application
          log.error(`Error registering shortcut ${shortcut.key}:`, error);
        }
      }
    });

    // Log only overall registration stats instead of individual successes
    log.info(`Hotkey registration stats: ${successfulRegistrations}/${totalShortcuts} successful`);

    return successfulRegistrations > 0; // As long as at least one shortcut works, return true
  } catch (error) {
    log.error("Error updating hotkeys:", error);
    return false; // Signal overall registration failure
  }
}

// Unregister all shortcuts on app exit
function unregisterAll() {
  try {
    globalShortcut.unregisterAll();
  } catch (error) {
    log.error("Error unregistering hotkeys:", error);
  }
}

// Get the modifier key for this platform
function getModifierKey() {
  return modifierKey;
}

// Get all registered shortcuts
function getShortcuts() {
  return { ...SHORTCUTS };
}

// Format hotkeys for display in a dialog
function getHotkeysForDisplay() {
  const hotkeyInfo = [];

  Object.entries(SHORTCUTS).forEach(([key, shortcut]) => {
    if (shortcut.description) {
      hotkeyInfo.push({
        key: shortcut.key,
        description: shortcut.description,
      });
    }
  });

  return hotkeyInfo;
}

// Validate that hotkeys are properly registered
function validateHotkeys() {
  try {
    // Check if the toggle visibility shortcut is registered
    const isRegistered = globalShortcut.isRegistered(SHORTCUTS.TOGGLE_VISIBILITY.key);
    return isRegistered;
  } catch (error) {
    log.error("Error validating hotkeys:", error);
    return false;
  }
}

module.exports = {
  registerHandlers,
  updateHotkeys,
  unregisterAll,
  getModifierKey,
  getShortcuts,
  getHotkeysForDisplay,
  validateHotkeys,
};
