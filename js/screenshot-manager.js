const fs = require("fs");
const path = require("path");
const screenshot = require("screenshot-desktop");
const { app, nativeImage } = require("electron");
const { IPC_CHANNELS } = require("./constants");
const Screenshots = require("electron-screenshots");

let screenshots = [];
let multiPageMode = false;
let screenshotInstance;

function resetScreenshots() {
  screenshots = [];
  multiPageMode = false;
  return screenshots;
}

function initScreenshotCapture() {
  screenshotInstance = new Screenshots({
    singleWindow: true,
    lang: "en",
  });

  return screenshotInstance;
}

const autoHideWindow = async (mainWindow) => {
  const wasVisible = mainWindow.isVisible();
  if (wasVisible) {
    mainWindow.hide();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return wasVisible;
};

const getImageDimensions = (imagePath) => {
  const dimensions = { width: 0, height: 0 };
  try {
    const image = nativeImage.createFromPath(imagePath);
    dimensions.width = image.getSize().width;
    dimensions.height = image.getSize().height;
  } catch (dimError) {
    console.error("Error getting image dimensions:", dimError);
  }
  return dimensions;
};

const saveScreenshotFromBuffer = async (buffer, filenamePrefix, mainWindow) => {
  // Generate filename for the screenshot
  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
  const imagePath = path.join(app.getPath("pictures"), `${filenamePrefix}-${timestamp}.png`);

  // Save the image to disk
  fs.writeFileSync(imagePath, buffer);

  // Verify the screenshot was saved correctly
  if (!fs.existsSync(imagePath)) {
    throw new Error("Screenshot file was not created");
  }

  const stats = fs.statSync(imagePath);
  if (stats.size < 1000) {
    throw new Error("Screenshot file is too small, likely empty");
  }

  // Read the image to get the base64 string
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  // Get image dimensions using nativeImage
  const dimensions = getImageDimensions(imagePath);

  // Show notification
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
      body: `${filenamePrefix} saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
      type: "success",
    });
  }

  return base64Image;
};

/**
 * Capture a screenshot of the entire screen or active window using the most reliable method for the platform
 */
async function captureScreenshot(mainWindow) {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const imagePath = path.join(app.getPath("pictures"), `screenshot-${timestamp}.png`);

    const wasVisible = await autoHideWindow(mainWindow);

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

    if (wasVisible) {
      mainWindow.show();
    }

    if (!fs.existsSync(imagePath)) {
      throw new Error("Screenshot file was not created");
    }

    const stats = fs.statSync(imagePath);
    if (stats.size < 1000) {
      throw new Error("Screenshot file is too small, likely empty");
    }

    const dimensions = getImageDimensions(imagePath);

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
  addScreenshot,
  getScreenshots,
  setMultiPageMode,
  getMultiPageMode,
  autoHideWindow,
};
