const { globalShortcut } = require("electron");
const { isLinux, isWindows, modifierKey } = require("./config");

let lastToggleTime = 0;
const TOGGLE_DEBOUNCE_MS = 300;

const SHORTCUTS = {
  TOGGLE_VISIBILITY: {
    key: `${modifierKey}+B`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+B" : "Alt+B") : null,
    handler: null,
    alwaysActive: true,
  },
  PROCESS_SCREENSHOTS: {
    key: `${modifierKey}+Enter`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+Enter" : null) : null,
    handler: null,
  },
  OPEN_SETTINGS: {
    key: `${modifierKey}+,`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+," : null) : null,
    handler: null,
  },
  MOVE_LEFT: {
    key: `${modifierKey}+Shift+Left`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+Left" : null) : null,
    handler: null,
  },
  MOVE_RIGHT: {
    key: `${modifierKey}+Shift+Right`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+Right" : null) : null,
    handler: null,
  },
  MOVE_UP: {
    key: `${modifierKey}+Shift+Up`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+Up" : null) : null,
    handler: null,
  },
  MOVE_DOWN: {
    key: `${modifierKey}+Shift+Down`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+Down" : null) : null,
    handler: null,
  },
  SCROLL_UP: {
    key: `Shift+Up`,
    altKey: null, // This should work across platforms
    handler: null,
  },
  SCROLL_DOWN: {
    key: `Shift+Down`,
    altKey: null, // This should work across platforms
    handler: null,
  },
  INCREASE_WINDOW_SIZE: {
    key: `${modifierKey}+Shift+=`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+=" : null) : null,
    handler: null,
  },
  DECREASE_WINDOW_SIZE: {
    key: `${modifierKey}+Shift+-`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+-" : null) : null,
    handler: null,
  },
  TAKE_SCREENSHOT: {
    key: `${modifierKey}+H`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+H" : null) : null,
    handler: null,
  },
  AREA_SCREENSHOT: {
    key: `${modifierKey}+D`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+D" : null) : null,
    handler: null,
  },
  MULTI_PAGE: {
    key: `${modifierKey}+A`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+A" : null) : null,
    handler: null,
  },
  RESET: {
    key: `${modifierKey}+R`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+R" : null) : null,
    handler: null,
  },
  QUIT: {
    key: `${modifierKey}+Q`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+Q" : null) : null,
    handler: null,
  },
  MODEL_SELECTION: {
    key: `${modifierKey}+M`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+M" : null) : null,
    handler: null,
  },
  TOGGLE_SPLIT_VIEW: {
    key: `${modifierKey}+T`,
    altKey: isLinux || isWindows ? (isWindows ? "Alt+T" : null) : null,
    handler: null,
  },
};

// Register shortcut handlers
function registerHandlers(handlers) {
  Object.keys(handlers).forEach((key) => {
    if (SHORTCUTS[key]) {
      // If on Linux, we wrap the toggle visibility handler to add debouncing
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
          // Register primary key
          let registered = false;
          
          try {
            registered = globalShortcut.register(shortcut.key, shortcut.handler);
            if (registered) {
              console.log(`Successfully registered primary shortcut: ${shortcut.key}`);
              successfulRegistrations++;
            }
          } catch (regError) {
            console.warn(`Failed to register primary shortcut ${shortcut.key}: ${regError.message}`);
            // Don't throw, just continue to try alt key
          }

          // For Linux or Windows, try the alternative key if primary fails
          if ((isLinux || isWindows) && shortcut.altKey && (!registered || 
              shortcut.key === SHORTCUTS.TOGGLE_VISIBILITY.key || 
              shortcut.key === SHORTCUTS.QUIT.key || 
              shortcut.key === SHORTCUTS.MODEL_SELECTION.key)) {
            console.log(`Registering alternative key for ${isLinux ? 'Linux' : 'Windows'}: ${shortcut.altKey}`);
            
            try {
              const altRegistered = globalShortcut.register(shortcut.altKey, shortcut.handler);
              if (altRegistered && !registered) {
                console.log(`Successfully registered alternative shortcut: ${shortcut.altKey}`);
                successfulRegistrations++;
              } else if (!altRegistered) {
                console.warn(`Failed to register alternative shortcut ${shortcut.altKey}`);
              }
            } catch (altRegError) {
              console.warn(`Failed to register alternative shortcut ${shortcut.altKey}: ${altRegError.message}`);
              // Still don't crash the app, even if alt key registration fails
            }
          }

          if (!registered) {
            console.warn(`Failed to register ${shortcut.key} shortcut`);
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

// Validate that hotkeys are properly registered (especially important for Linux and Windows)
function validateHotkeys() {
  try {
    // Check if the toggle visibility shortcut is registered
    const isRegistered = globalShortcut.isRegistered(SHORTCUTS.TOGGLE_VISIBILITY.key);

    // If primary key is not registered on Linux or Windows, try registering the alt key
    if (!isRegistered && (isLinux || isWindows) && SHORTCUTS.TOGGLE_VISIBILITY.altKey) {
      console.log(
        `Primary key ${SHORTCUTS.TOGGLE_VISIBILITY.key} not registered, trying alternative ${SHORTCUTS.TOGGLE_VISIBILITY.altKey}`,
      );

      // Register the alternative key
      if (SHORTCUTS.TOGGLE_VISIBILITY.handler) {
        const altRegistered = globalShortcut.register(
          SHORTCUTS.TOGGLE_VISIBILITY.altKey,
          SHORTCUTS.TOGGLE_VISIBILITY.handler,
        );
        return altRegistered;
      }
    }

    return isRegistered;
  } catch (error) {
    console.error("Error validating hotkeys:", error);
    return false;
  }
}

// Function to get alternative keys for Windows users
function getWindowsAlternativeKeys() {
  if (!isWindows) return {};
  
  return {
    quit: { primary: `${modifierKey}+Q`, alternative: 'Alt+Q' },
    modelSelection: { primary: `${modifierKey}+M`, alternative: 'Alt+M' },
    toggleVisibility: { primary: `${modifierKey}+B`, alternative: 'Alt+B' },
    takeScreenshot: { primary: `${modifierKey}+H`, alternative: 'Alt+H' },
    areaScreenshot: { primary: `${modifierKey}+D`, alternative: 'Alt+D' },
    reset: { primary: `${modifierKey}+R`, alternative: 'Alt+R' },
    toggleSplitView: { primary: `${modifierKey}+T`, alternative: 'Alt+T' }
  };
}

// Function to get alternative keys for Linux users
function getLinuxAlternativeKeys() {
  if (!isLinux) return {};
  
  return {
    toggleVisibility: { primary: `${modifierKey}+B`, alternative: 'Alt+B' }
  };
}

module.exports = {
  registerHandlers,
  updateHotkeys,
  unregisterAll,
  getModifierKey,
  getShortcuts,
  validateHotkeys,
  getWindowsAlternativeKeys,
  getLinuxAlternativeKeys
};
