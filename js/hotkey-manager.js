const { globalShortcut } = require("electron");
const { isLinux, isWindows, modifierKey } = require("./config");

let lastToggleTime = 0;
const TOGGLE_DEBOUNCE_MS = 300;

// Define shortcuts using only the platform-specific modifier key
const SHORTCUTS = {
  TOGGLE_VISIBILITY: {
    key: `${modifierKey}+B`,
    handler: null,
    alwaysActive: true,
  },
  PROCESS_SCREENSHOTS: {
    key: `${modifierKey}+Enter`,
    handler: null,
  },
  OPEN_SETTINGS: {
    key: `${modifierKey}+,`,
    handler: null,
  },
  MOVE_LEFT: {
    key: `${modifierKey}+Shift+Left`,
    handler: null,
  },
  MOVE_RIGHT: {
    key: `${modifierKey}+Shift+Right`,
    handler: null,
  },
  MOVE_UP: {
    key: `${modifierKey}+Shift+Up`,
    handler: null,
  },
  MOVE_DOWN: {
    key: `${modifierKey}+Shift+Down`,
    handler: null,
  },
  SCROLL_UP: {
    key: `Shift+Up`,
    handler: null,
  },
  SCROLL_DOWN: {
    key: `Shift+Down`,
    handler: null,
  },
  INCREASE_WINDOW_SIZE: {
    key: `${modifierKey}+Shift+=`,
    handler: null,
  },
  DECREASE_WINDOW_SIZE: {
    key: `${modifierKey}+Shift+-`,
    handler: null,
  },
  TAKE_SCREENSHOT: {
    key: `${modifierKey}+H`,
    handler: null,
  },
  AREA_SCREENSHOT: {
    key: `${modifierKey}+D`,
    handler: null,
  },
  MULTI_PAGE: {
    key: `${modifierKey}+A`,
    handler: null,
  },
  RESET: {
    key: `${modifierKey}+R`,
    handler: null,
  },
  QUIT: {
    key: `${modifierKey}+Q`,
    handler: null,
  },
  MODEL_SELECTION: {
    key: `${modifierKey}+M`,
    handler: null,
  },
  TOGGLE_SPLIT_VIEW: {
    key: `${modifierKey}+T`,
    handler: null,
  },
  TOGGLE_DEVTOOLS: {
    key: `${modifierKey}+D`,
    handler: null,
  },
};

// Register shortcut handlers
function registerHandlers(handlers) {
  Object.keys(handlers).forEach((key) => {
    if (SHORTCUTS[key]) {
      // Platform-specific debouncing for toggle visibility
      if ((isLinux || isWindows) && key === "TOGGLE_VISIBILITY") {
        const originalHandler = handlers[key];
        SHORTCUTS[key].handler = () => {
          const now = Date.now();
          // Prevent rapid firing of toggle which can cause hangs
          if (now - lastToggleTime < TOGGLE_DEBOUNCE_MS) {
            console.log("Toggle debounced - ignoring rapid keypress");
            return;
          }
          lastToggleTime = now;

          try {
            originalHandler();
          } catch (error) {
            console.error("Error in toggle visibility handler:", error);
            // Attempt recovery on error by unregistering and re-registering shortcuts
            setTimeout(() => {
              try {
                updateHotkeys(true);
              } catch (e) {
                console.error("Failed to recover hotkeys:", e);
              }
            }, 500);
          }
        };
      } else {
        SHORTCUTS[key].handler = handlers[key];
      }
    }
  });
}

// Function to manage hotkey registration based on visibility
function updateHotkeys(isVisible) {
  try {
    // Log platform information for debugging
    console.log(`Updating hotkeys for platform: ${process.platform}`);
    console.log(`Modifier key for this platform: ${modifierKey}`);
    console.log(`isLinux: ${isLinux}, isWindows: ${isWindows}`);

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
              console.log(`Successfully registered shortcut: ${shortcut.key}`);
              successfulRegistrations++;
            } else {
              console.warn(`Failed to register ${shortcut.key} shortcut`);
            }
          } catch (regError) {
            console.warn(`Error registering shortcut ${shortcut.key}: ${regError.message}`);
          }
        } catch (error) {
          // Log but don't crash the application
          console.error(`Error registering shortcut ${shortcut.key}:`, error);
        }
      }
    });

    // Log registration success statistics
    console.log(`Hotkey registration stats: ${successfulRegistrations}/${totalShortcuts} successful`);

    return successfulRegistrations > 0; // As long as at least one shortcut works, return true
  } catch (error) {
    console.error("Error updating hotkeys:", error);
    return false; // Signal overall registration failure
  }
}

// Unregister all shortcuts on app exit
function unregisterAll() {
  try {
    globalShortcut.unregisterAll();
  } catch (error) {
    console.error("Error unregistering hotkeys:", error);
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

// Validate that hotkeys are properly registered
function validateHotkeys() {
  try {
    // Check if the toggle visibility shortcut is registered
    const isRegistered = globalShortcut.isRegistered(SHORTCUTS.TOGGLE_VISIBILITY.key);
    return isRegistered;
  } catch (error) {
    console.error("Error validating hotkeys:", error);
    return false;
  }
}

// Get platform-specific shortcut keys
function getPlatformShortcuts() {
  return {
    quit: `${modifierKey}+Q`,
    modelSelection: `${modifierKey}+M`,
    toggleVisibility: `${modifierKey}+B`,
    takeScreenshot: `${modifierKey}+H`,
    areaScreenshot: `${modifierKey}+D`,
    reset: `${modifierKey}+R`,
    toggleSplitView: `${modifierKey}+T`,
    toggleDevtools: `${modifierKey}+D`,
  };
}

module.exports = {
  registerHandlers,
  updateHotkeys,
  unregisterAll,
  getModifierKey,
  getShortcuts,
  validateHotkeys,
  getPlatformShortcuts,
};
