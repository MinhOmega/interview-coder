const fs = require("fs");
const path = require("path");
const screenshot = require("screenshot-desktop");
const { app, desktopCapturer, BrowserWindow } = require("electron");

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
      // Get all screen sources
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: require("electron").screen.getPrimaryDisplay().workAreaSize.width,
          height: require("electron").screen.getPrimaryDisplay().workAreaSize.height,
        },
      });

      // Get the primary display
      const primaryDisplay = require("electron").screen.getPrimaryDisplay();

      // Find the source that matches the primary display
      const source =
        sources.find((s) => {
          const bounds = s.display?.bounds || s.bounds;
          return (
            bounds.x === 0 &&
            bounds.y === 0 &&
            bounds.width === primaryDisplay.size.width &&
            bounds.height === primaryDisplay.size.height
          );
        }) || sources[0];

      if (!source) {
        throw new Error("No screen source found");
      }

      // Create a temporary hidden BrowserWindow to capture the screen
      const captureWin = new BrowserWindow({
        width: primaryDisplay.size.width,
        height: primaryDisplay.size.height,
        show: false,
        webPreferences: {
          offscreen: true,
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      // Load a minimal HTML file
      await captureWin.loadURL("data:text/html,<html><body></body></html>");

      // Inject capture script
      await captureWin.webContents.executeJavaScript(`
        new Promise(async (resolve) => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: '${source.id}',
                  minWidth: ${primaryDisplay.size.width},
                  maxWidth: ${primaryDisplay.size.width},
                  minHeight: ${primaryDisplay.size.height},
                  maxHeight: ${primaryDisplay.size.height}
                }
              }
            });

            const video = document.createElement('video');
            video.style.cssText = 'position: absolute; top: -10000px; left: -10000px;';
            video.srcObject = stream;

            video.onloadedmetadata = () => {
              video.play();
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0);
              
              const imageData = canvas.toDataURL('image/png');
              video.remove();
              stream.getTracks()[0].stop();
              resolve(imageData);
            };

            document.body.appendChild(video);
          } catch (err) {
            resolve(null);
            console.error('Capture error:', err);
          }
        });
      `);

      // Get the captured image
      const imageData = await captureWin.webContents.executeJavaScript(
        'document.querySelector("canvas").toDataURL("image/png")',
      );

      // Close the capture window
      captureWin.close();

      if (!imageData) {
        throw new Error("Failed to capture screen");
      }

      // Save the image
      const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(imagePath, base64Data, "base64");
      base64Image = imageData;
      success = true;
    } catch (captureError) {
      console.error("Desktop capturer failed:", captureError);

      // Fallback to screenshot-desktop
      try {
        await screenshot({ filename: imagePath });
        const imageBuffer = fs.readFileSync(imagePath);
        base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
        success = true;
      } catch (fallbackError) {
        console.error("Screenshot fallback failed:", fallbackError);
        throw fallbackError;
      }
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
      const sizeOf = require("image-size");
      const imageDimensions = sizeOf(imagePath);
      dimensions.width = imageDimensions.width;
      dimensions.height = imageDimensions.height;
    } catch (dimError) {
      console.error("Error getting image dimensions:", dimError);
    }

    // Notify about saved screenshot
    mainWindow.webContents.send("notification", {
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
    mainWindow.webContents.send("notification", {
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
      const sizeOf = require("image-size");
      const imageDimensions = sizeOf(imagePath);
      dimensions.width = imageDimensions.width;
      dimensions.height = imageDimensions.height;
    } catch (dimError) {
      console.error("Error getting image dimensions:", dimError);
    }

    // Notify about saved screenshot
    mainWindow.webContents.send("notification", {
      body: `Window screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
      type: "success",
    });

    return base64Image;
  } catch (error) {
    console.error("Window screenshot capture failed:", error);
    throw error;
  }
}

/**
 * Captures a screenshot of a selected area
 */
async function captureAreaScreenshot(mainWindow) {
  // Hide the main window
  mainWindow.hide();

  await new Promise((resolve) => setTimeout(resolve, 300)); // Wait for window to hide

  try {
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const imagePath = path.join(app.getPath("pictures"), `area-screenshot-${timestamp}.png`);

    // Use platform-specific approach for area capture
    if (process.platform === "darwin") {
      try {
        // -s flag allows user to select an area
        await new Promise((resolve, reject) => {
          const { exec } = require("child_process");
          exec(`screencapture -s "${imagePath}"`, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      } catch (macOSError) {
        console.error("macOS area capture failed:", macOSError);
        mainWindow.show();
        throw macOSError;
      }
    } else {
      // For Windows and Linux, use the existing area selection implementation
      // Simplified for brevity - would need to be implemented based on platform

      // Create a window for the screenshot area selection
      let captureWindow = new BrowserWindow({
        width: 800,
        height: 600,
        frame: false,
        fullscreen: true,
        transparent: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      // Load the capture-helper.html from the file system
      await captureWindow.loadFile("capture-helper.html");

      return new Promise((resolve, reject) => {
        require("electron").ipcMain.once("area-selected", async (event, { x, y, width, height, imageData }) => {
          try {
            if (width < 10 || height < 10) {
              captureWindow.close();
              mainWindow.show();
              reject(new Error("Selected area is too small"));
              return;
            }

            // If we received image data directly from the renderer
            if (imageData) {
              captureWindow.close();
              mainWindow.show();

              try {
                const buffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ""), "base64");
                fs.writeFileSync(imagePath, buffer);

                // Get dimensions for notification
                const dimensions = { width, height };

                // Notify about saved screenshot
                mainWindow.webContents.send("notification", {
                  body: `Area screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
                  type: "success",
                });

                resolve(imageData);
              } catch (error) {
                console.error("Error saving area screenshot:", error);
                reject(error);
              }
            } else {
              // No image data, fallback to full screen
              captureWindow.close();
              mainWindow.show();
              const fullScreenshot = await captureScreenshot(mainWindow);
              resolve(fullScreenshot);
            }
          } catch (error) {
            console.error("Error processing area selection:", error);
            captureWindow.close();
            mainWindow.show();
            reject(error);
          }
        });

        require("electron").ipcMain.once("area-selection-cancelled", () => {
          captureWindow.close();
          mainWindow.show();
          reject(new Error("Area selection cancelled"));
        });
      });
    }

    // Check if the file exists (user might have canceled)
    if (!fs.existsSync(imagePath)) {
      mainWindow.show();
      throw new Error("Area capture was canceled");
    }

    const stats = fs.statSync(imagePath);
    if (stats.size < 1000) {
      mainWindow.show();
      throw new Error("Area screenshot file is too small, likely empty");
    }

    // Read the image and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    // Get image dimensions
    const dimensions = { width: 0, height: 0 };
    try {
      const sizeOf = require("image-size");
      const imageDimensions = sizeOf(imagePath);
      dimensions.width = imageDimensions.width;
      dimensions.height = imageDimensions.height;
    } catch (dimError) {
      console.error("Error getting image dimensions:", dimError);
    }

    // Show main window again
    mainWindow.show();

    // Notify about saved screenshot
    mainWindow.webContents.send("notification", {
      body: `Area screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`,
      type: "success",
    });

    return base64Image;
  } catch (error) {
    console.error("Area screenshot failed:", error);
    mainWindow.show();
    throw error;
  }
}

// Add screenshot to the collection
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
  captureAreaScreenshot,
  addScreenshot,
  getScreenshots,
  setMultiPageMode,
  getMultiPageMode
}; 