const fs = require("fs");
const path = require("path");
const screenshot = require("screenshot-desktop");
const { nativeImage, desktopCapturer } = require("electron");
const { IPC_CHANNELS } = require("./constants");
const Screenshots = require("electron-screenshots");
const { getAppPath, isCommandAvailable } = require("./utils");
const { isLinux } = require("./config");

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
  const picturesPath = getAppPath("pictures", "");
  const imagePath = path.join(picturesPath, `${filenamePrefix}-${timestamp}.png`);

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
 * Capture full resolution screenshot using Electron's desktopCapturer API
 * @param {string} imagePath - Path to save the screenshot
 * @returns {Promise<string>} - Base64 encoded image data
 */
const captureElectronScreenshot = async (imagePath) => {
  // Get sources (screens)
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 3840, height: 2160 }, // Request higher resolution thumbnail
    fetchWindowIcons: false,
  });

  if (sources.length === 0) {
    throw new Error("No screen sources found");
  }

  // Take screenshot of the primary screen (first in the array)
  const primarySource = sources[0];

  // Get high-res thumbnail
  const thumbnail = primarySource.thumbnail;

  // Convert to PNG buffer with higher quality
  const pngBuffer = thumbnail.toPNG({
    scaleFactor: 1.0,
  });

  // Save to disk
  fs.writeFileSync(imagePath, pngBuffer);

  // Convert to base64
  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
};

/**
 * Capture a screenshot of the entire screen or active window using the most reliable method for the platform
 */
async function captureScreenshot(mainWindow) {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const picturesPath = getAppPath("pictures", "");
    const imagePath = path.join(picturesPath, `screenshot-${timestamp}.png`);

    const wasVisible = await autoHideWindow(mainWindow);

    let success = false;
    let base64Image = "";

    // If on Linux, first check if ImageMagick is installed
    if (isLinux && !isCommandAvailable("import")) {
      console.log("ImageMagick not found. Using Electron's desktopCapturer as fallback for screenshot on Linux");
      // Use Electron's desktopCapturer as a fallback for Linux without ImageMagick
      try {
        base64Image = await captureElectronScreenshot(imagePath);
        success = true;
      } catch (electronError) {
        console.error("Electron screenshot fallback failed:", electronError);
        throw electronError;
      }
    } else {
      try {
        await screenshot({ filename: imagePath });
        const imageBuffer = fs.readFileSync(imagePath);
        base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
        success = true;
      } catch (fallbackError) {
        console.error("Screenshot fallback failed:", fallbackError);

        // If on Linux and the error is about the 'import' command not found, use Electron's desktopCapturer as fallback
        if (isLinux && fallbackError.message.includes("import: not found")) {
          console.log("Using Electron's desktopCapturer as fallback for screenshot on Linux");
          try {
            base64Image = await captureElectronScreenshot(imagePath);
            success = true;
          } catch (electronError) {
            console.error("Electron screenshot fallback failed:", electronError);
            throw electronError;
          }
        } else {
          // For other errors or platforms, just propagate the error
          throw fallbackError;
        }
      }
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
