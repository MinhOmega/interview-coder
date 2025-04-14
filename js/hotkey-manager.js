const { globalShortcut } = require("electron");
const { isLinux, modifierKey } = require("./config");

let lastToggleTime = 0;
const TOGGLE_DEBOUNCE_MS = 300;

const SHORTCUTS = {
  TOGGLE_VISIBILITY: {
    key: `${modifierKey}+B`,
    altKey: isLinux ? "Alt+B" : null,
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
};

// Register shortcut handlers
function registerHandlers(handlers) {
  Object.keys(handlers).forEach((key) => {
    if (SHORTCUTS[key]) {
      // If on Linux, we wrap the toggle visibility handler to add debouncing
      if (isLinux && key === "TOGGLE_VISIBILITY") {
        const originalHandler = handlers[key];
        SHORTCUTS[key].handler = () => {
          const now = Date.now();
          // Prevent rapid firing of toggle on Linux which can cause hangs
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
    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    // Register shortcuts based on visibility state
    Object.values(SHORTCUTS).forEach((shortcut) => {
      if ((isVisible || shortcut.alwaysActive) && shortcut.handler) {
        try {
          // Register primary key
          const registered = globalShortcut.register(shortcut.key, shortcut.handler);

          // For Linux, try the alternative key if primary fails or if it's the toggle visibility shortcut
          if (isLinux && shortcut.altKey && (!registered || shortcut.key === SHORTCUTS.TOGGLE_VISIBILITY.key)) {
            console.log(`Registering alternative key for Linux: ${shortcut.altKey}`);
            globalShortcut.register(shortcut.altKey, shortcut.handler);
          }

          if (!registered) {
            console.warn(`Failed to register ${shortcut.key} shortcut`);
          }
        } catch (error) {
          console.error(`Error registering shortcut ${shortcut.key}:`, error);
        }
      }
    });
  } catch (error) {
    console.error("Error updating hotkeys:", error);
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

// Validate that hotkeys are properly registered (especially important for Linux)
function validateHotkeys() {
  try {
    // Check if the toggle visibility shortcut is registered
    const isRegistered = globalShortcut.isRegistered(SHORTCUTS.TOGGLE_VISIBILITY.key);

    // If primary key is not registered on Linux, try registering the alt key
    if (!isRegistered && isLinux && SHORTCUTS.TOGGLE_VISIBILITY.altKey) {
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

module.exports = {
  registerHandlers,
  updateHotkeys,
  unregisterAll,
  getModifierKey,
  getShortcuts,
  validateHotkeys,
};
