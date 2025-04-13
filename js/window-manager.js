const { BrowserWindow, screen } = require("electron");
const { IPC_CHANNELS } = require("./constants");

let mainWindow;
let modelListWindow;
let isWindowVisible = true;

// Create the main application window
function createMainWindow() {
  // Get primary display dimensions for centering
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: displayWidth, height: displayHeight } = primaryDisplay.workAreaSize;

  // Window dimensions
  const windowWidth = 1000;
  const windowHeight = 800;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.floor((displayWidth - windowWidth) / 2),
    y: Math.floor((displayHeight - windowHeight) / 2),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: false,
    transparent: true,
    backgroundColor: "#00000000", // Transparent background
    alwaysOnTop: true,
    paintWhenInitiallyHidden: true,
    contentProtection: true,
    movable: true, // Ensure window is movable
    roundedCorners: true,
    titleBarStyle: "hidden", // Hide title bar completely
    titleBarOverlay: false,
    trafficLightPosition: { x: -999, y: -999 }, // Move traffic lights far off-screen
    fullscreenable: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    hasShadow: true, // Add shadow for better visibility
    enableLargerThanScreen: false, // Prevent window from being larger than screen
  });

  mainWindow.loadFile("index.html");
  mainWindow.setContentProtection(true);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, "screen-saver", 1);

  return mainWindow;
}

// Create model selection window
function createModelSelectionWindow() {
  if (modelListWindow) {
    modelListWindow.focus();
    return modelListWindow;
  }

  modelListWindow = new BrowserWindow({
    width: 500,
    height: 600,
    parent: mainWindow,
    modal: false, // Allow communication between windows
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  modelListWindow.loadFile("model-selector.html");

  modelListWindow.on("closed", () => {
    modelListWindow = null;
    // Notify main window to refresh model badge
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("model-changed");
    }
  });

  return modelListWindow;
}

// Toggle the main window visibility
function toggleWindowVisibility(forceState) {
  isWindowVisible = typeof forceState === "boolean" ? forceState : !isWindowVisible;

  if (mainWindow) {
    if (isWindowVisible) {
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
      if (modelListWindow) {
        modelListWindow.show();
        modelListWindow.setOpacity(1);
      }
    } else {
      mainWindow.hide();
      mainWindow.setAlwaysOnTop(false);
      if (modelListWindow) {
        modelListWindow.hide();
        modelListWindow.setOpacity(0);
      }
    }

    // Notify renderer about visibility change
    mainWindow.webContents.send(IPC_CHANNELS.UPDATE_VISIBILITY, isWindowVisible);
  }

  return isWindowVisible;
}

// Function to move window to different positions on screen
function moveWindow(direction) {
  if (!mainWindow) return;

  const currentPosition = mainWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: currentPosition.x, y: currentPosition.y });
  const workArea = display.workArea;

  // Calculate the amount to move (30% of workarea width/height)
  const moveX = Math.floor(workArea.width * 0.3);
  const moveY = Math.floor(workArea.height * 0.3);

  let newPosition = { ...currentPosition };

  switch (direction) {
    case "left":
      newPosition.x = Math.max(workArea.x, currentPosition.x - moveX);
      break;
    case "right":
      newPosition.x = Math.min(workArea.x + workArea.width - currentPosition.width, currentPosition.x + moveX);
      break;
    case "up":
      newPosition.y = Math.max(workArea.y, currentPosition.y - moveY);
      break;
    case "down":
      newPosition.y = Math.min(workArea.y + workArea.height - currentPosition.height, currentPosition.y + moveY);
      break;
  }

  mainWindow.setBounds(newPosition);
}

// Function to resize the window
function resizeWindow(direction) {
  if (!mainWindow) return;

  const currentSize = mainWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: currentSize.x, y: currentSize.y });
  const workArea = display.workArea;

  // Calculate resize amount (10% of current dimensions)
  const resizeWidth = Math.floor(currentSize.width * 0.1);
  const resizeHeight = Math.floor(currentSize.height * 0.1);

  let newSize = { ...currentSize };

  switch (direction) {
    case "increase":
      // Increase both width and height, but keep within screen bounds
      newSize.width = Math.min(workArea.width, currentSize.width + resizeWidth);
      newSize.height = Math.min(workArea.height, currentSize.height + resizeHeight);
      // Center the window if possible
      newSize.x = Math.max(workArea.x, currentSize.x - resizeWidth / 2);
      newSize.y = Math.max(workArea.y, currentSize.y - resizeHeight / 2);
      break;
    case "decrease":
      // Decrease both width and height, with minimum size limits
      newSize.width = Math.max(400, currentSize.width - resizeWidth);
      newSize.height = Math.max(300, currentSize.height - resizeHeight);
      // Recenter slightly
      newSize.x = currentSize.x + (currentSize.width - newSize.width) / 2;
      newSize.y = currentSize.y + (currentSize.height - newSize.height) / 2;
      break;
  }

  mainWindow.setBounds(newSize);
}

// Function to scroll content in the result area
function scrollContent(direction) {
  if (!mainWindow) return;
  
  // Send a scroll command to the renderer process
  const scrollAmount = direction === "up" ? -300 : 300;
  console.log("🚀 ~ window-manager.js:186 ~ scrollContent ~ scrollAmount:", scrollAmount)
  mainWindow.webContents.send(IPC_CHANNELS.SCROLL_CONTENT, scrollAmount);
}

// Get the main window
function getMainWindow() {
  return mainWindow;
}

// Get the model list window
function getModelListWindow() {
  return modelListWindow;
}

// Get window visibility state
function getWindowVisibility() {
  return isWindowVisible;
}

// Update the instruction in the main window
function updateInstruction(instruction) {
  if (!mainWindow) return;
  
  if (!instruction || instruction.trim() === "") {
    // If instruction is empty, hide the instruction banner
    mainWindow.webContents.send(IPC_CHANNELS.HIDE_INSTRUCTION);
  } else {
    // Show the instruction with the provided text
    mainWindow.webContents.send(IPC_CHANNELS.UPDATE_INSTRUCTION, instruction);
  }
}

// Get default instructions based on app state
function getDefaultInstructions(multiPageMode, screenshotsLength, modifierKey) {
  if (multiPageMode) {
    return `Multi-mode: ${screenshotsLength} screenshots. ${modifierKey}+Shift+A to add more, ${modifierKey}+Enter to analyze`;
  }

  return `${modifierKey}+B: Toggle visibility \n ${modifierKey}+H: Take screenshot \n ${modifierKey}+R: Reset \n`;
}

module.exports = {
  createMainWindow,
  createModelSelectionWindow,
  toggleWindowVisibility,
  moveWindow,
  resizeWindow,
  scrollContent,
  getMainWindow,
  getModelListWindow,
  getWindowVisibility,
  updateInstruction,
  getDefaultInstructions
}; 