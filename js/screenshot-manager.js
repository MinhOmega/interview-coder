const fs = require("fs");
const path = require("path");
const screenshot = require("screenshot-desktop");
const { app, nativeImage } = require("electron");
const { IPC_CHANNELS } = require("./constants");

let screenshots = [];
let multiPageMode = false;
let screenshotInstance;

// Reset screenshot state
function resetScreenshots() {
  screenshots = [];
  multiPageMode = false;
  return screenshots;
}

// Initialize electron-screenshots
function initScreenshotCapture(mainWindow) {
  const Screenshots = require("electron-screenshots");

  screenshotInstance = new Screenshots({
    singleWindow: true,
    lang: "en",
    // Customize the appearance
    styles: {
      windowBackgroundColor: "#00000000",
      mask: {
        color: "#000000",
        opacity: 0.6,
      },
      toolbar: {
        backgroundColor: "#2e2c29",
        color: "#ffffff",
        activeColor: "#2196f3",
      },
    },
  });

  // Return the instance for event binding in main.js
  return screenshotInstance;
}

/**
 * Capture a screenshot of the entire screen or active window using the most reliable method for the platform
 */
async function captureScreenshot(mainWindow) {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const imagePath = path.join(app.getPath("pictures"), `screenshot-${timestamp}.png`);

    // Hide the main window temporarily for capturing
    const wasVisible = mainWindow.isVisible();
    if (wasVisible) {
      mainWindow.hide();
      // Wait a bit for the window to hide
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    let success = false;
    let base64Image = "";

    try {
      await screenshot({ filename: imagePath });
      const imageBuffer = fs.readFileSync(imagePath);
      base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
      success = true;
    } catch (fallbackError) {
      console.error("Screenshot fallback failed:", fallbackError);
      throw fallbackError;
    }

    // Show the main window again
    if (wasVisible) {
      mainWindow.show();
    }

    // Verify the screenshot was taken
    if (!fs.existsSync(imagePath)) {
      throw new Error("Screenshot file was not created");
    }

    const stats = fs.statSync(imagePath);
    if (stats.size < 1000) {
      throw new Error("Screenshot file is too small, likely empty");
    }

    // Get image dimensions
    const dimensions = { width: 0, height: 0 };
    try {
      const image = nativeImage.createFromPath(imagePath);
      dimensions.width = image.getSize().width;
      dimensions.height = image.getSize().height;
    } catch (dimError) {
      console.error("Error getting image dimensions:", dimError);
    }

    // Notify about saved screenshot
    mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
      body: `Screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
      type: "success",
    });

    return base64Image;
  } catch (error) {
    console.error("Screenshot capture failed:", error);
    throw error;
  }
}

/**
 * Capture a specific window by prompting the user to click on it
 */
async function captureWindowScreenshot(mainWindow) {
  try {
    // Hide our app window first
    const wasVisible = mainWindow.isVisible();
    if (wasVisible) {
      mainWindow.hide();
    }

    // Show instruction in notification
    mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
      title: "Screenshot",
      body: "Please click on the window you want to capture.",
    });

    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const imagePath = path.join(app.getPath("pictures"), `window-screenshot-${timestamp}.png`);

    let success = false;

    // Use platform-specific approach for window capture
    if (process.platform === "darwin") {
      try {
        // -w flag captures the window the user clicks on
        await new Promise((resolve, reject) => {
          const { exec } = require("child_process");
          exec(`screencapture -w "${imagePath}"`, (error) => {
            if (error) {
              reject(error);
            } else {
              success = true;
              resolve();
            }
          });
        });
      } catch (macOSError) {
        console.error("macOS window capture failed:", macOSError);
        if (wasVisible) mainWindow.show();
        throw macOSError;
      }
    } else {
      // For other platforms, just use regular screenshot as there's no easy native way
      // to capture a specific window without additional dependencies
      if (wasVisible) mainWindow.show();
      return await captureScreenshot(mainWindow);
    }

    // Show the main window again
    if (wasVisible) {
      mainWindow.show();
    }

    // Verify the screenshot was taken (user might have canceled)
    if (!fs.existsSync(imagePath)) {
      throw new Error("Window capture was canceled");
    }

    const stats = fs.statSync(imagePath);
    if (stats.size < 1000) {
      throw new Error("Window screenshot file is too small, likely empty");
    }

    // Read the image and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    // Get image dimensions
    const dimensions = { width: 0, height: 0 };
    try {
      const image = nativeImage.createFromPath(imagePath);
      dimensions.width = image.getSize().width;
      dimensions.height = image.getSize().height;
    } catch (dimError) {
      console.error("Error getting image dimensions:", dimError);
    }

    // Notify about saved screenshot
    mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
      body: `Window screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
      type: "success",
    });

    return base64Image;
  } catch (error) {
    console.error("Window screenshot capture failed:", error);
    throw error;
  }
}

function addScreenshot(screenshot) {
  screenshots.push(screenshot);
  return screenshots.length;
}

// Get all screenshots
function getScreenshots() {
  return screenshots;
}

// Set multi-page mode
function setMultiPageMode(enabled) {
  multiPageMode = enabled;
  return multiPageMode;
}

// Get multi-page mode state
function getMultiPageMode() {
  return multiPageMode;
}

module.exports = {
  resetScreenshots,
  initScreenshotCapture,
  captureScreenshot,
  captureWindowScreenshot,
  addScreenshot,
  getScreenshots,
  setMultiPageMode,
  getMultiPageMode,
};
