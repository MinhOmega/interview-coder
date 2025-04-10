const { globalShortcut } = require("electron");

const isMac = process.platform === "darwin";
const modifierKey = isMac ? "Command" : "Ctrl";

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
    key: `${modifierKey}+Left`,
    handler: null,
  },
  MOVE_RIGHT: {
    key: `${modifierKey}+Right`,
    handler: null,
  },
  MOVE_UP: {
    key: `${modifierKey}+Up`,
    handler: null,
  },
  MOVE_DOWN: {
    key: `${modifierKey}+Down`,
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
  Object.keys(handlers).forEach(key => {
    if (SHORTCUTS[key]) {
      SHORTCUTS[key].handler = handlers[key];
    }
  });
}

// Function to manage hotkey registration based on visibility
function updateHotkeys(isVisible) {
  // Unregister all existing shortcuts
  globalShortcut.unregisterAll();

  // Register shortcuts based on visibility state
  Object.values(SHORTCUTS).forEach((shortcut) => {
    if ((isVisible || shortcut.alwaysActive) && shortcut.handler) {
      globalShortcut.register(shortcut.key, shortcut.handler);
    }
  });
}

// Unregister all shortcuts on app exit
function unregisterAll() {
  globalShortcut.unregisterAll();
}

// Get the modifier key for this platform
function getModifierKey() {
  return modifierKey;
}

// Get all registered shortcuts
function getShortcuts() {
  return { ...SHORTCUTS };
}

module.exports = {
  registerHandlers,
  updateHotkeys,
  unregisterAll,
  getModifierKey,
  getShortcuts
}; 