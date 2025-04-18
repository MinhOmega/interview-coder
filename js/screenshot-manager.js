const fs = require("fs");
const path = require("path");
const screenshot = require("screenshot-desktop");
const { nativeImage, desktopCapturer, systemPreferences, app } = require("electron");
const Screenshots = require("electron-screenshots");
const { getAppPath, isCommandAvailable } = require("./utils");
const { isLinux, isMac } = require("./config");
const toastManager = require("./toast-manager");

let screenshots = [];
let multiPageMode = false;
let screenshotInstance;
let hasRequestedPermission = false;

// Check if we're in production mode
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

function resetScreenshots() {
  screenshots = [];
  multiPageMode = false;
  return screenshots;
}

function initScreenshotCapture() {
  // Ensure we request permissions early in the app lifecycle
  if (isMac && !hasRequestedPermission) {
    hasRequestedPermission = true;
    requestScreenCapturePermission();
  }
  
  screenshotInstance = new Screenshots({
    singleWindow: true,
    lang: "en",
    // Pass additional configuration options for better performance
    enabledScreenshot: true,
    width: 800,
    height: 600,
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
    // Use the toastManager to send the IPC message
    toastManager.success(`${filenamePrefix} saved to ${imagePath} (${dimensions.width}x${dimensions.height})`);
  }

  return base64Image;
};

/**
 * Check if we have screen recording permission on macOS
 * @returns {boolean} - true if permission is granted or not on macOS
 */
function hasScreenCapturePermission() {
  if (!isMac) return true; // Only macOS needs explicit screen recording permission
  
  try {
    // Try to get the status
    const status = systemPreferences.getMediaAccessStatus('screen');
    console.log(`[${isDev ? 'DEV' : 'PROD'}] Current screen recording permission status:`, status);
    return status === 'granted';
  } catch (error) {
    console.error('Error checking screen recording permission:', error);
    return false;
  }
}

/**
 * Request screen recording permission on macOS
 * @returns {Promise<boolean>} - Promise resolving to permission status
 */
async function requestScreenCapturePermission() {
  if (!isMac) return true; // Only relevant for macOS
  
  try {
    console.log(`[${isDev ? 'DEV' : 'PROD'}] Checking screen recording permission`);
    
    // First check current status
    if (hasScreenCapturePermission()) {
      console.log('Screen recording permission already granted');
      return true;
    }
    
    // Log when permission requested
    console.log('Requesting screen recording permission...');
    
    // Force permission request in more aggressive way for production
    try {
      // Try multiple approaches to ensure permission dialog appears
      
      // 1. Use systemPreferences API
      const granted = await systemPreferences.askForMediaAccess('screen');
      console.log('askForMediaAccess result:', granted);
      
      // 2. Use desktopCapturer regardless of result to force the permission prompt
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 }
      });
      console.log(`Found ${sources.length} screen sources`);
      
      // 3. Try to take a test screenshot using the desktopCapturer
      if (sources.length > 0) {
        const testImg = sources[0].thumbnail;
        if (testImg) {
          console.log('Successfully captured test screenshot thumbnail');
        }
      }
      
      // 4. Check permission again
      const newStatus = systemPreferences.getMediaAccessStatus('screen');
      console.log('Screen recording permission after request:', newStatus);
      
      if (newStatus !== 'granted') {
        // In production, show a more urgent notification
        if (!isDev) {
          toastManager.warning('Screen recording permission is required for this app to function properly. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording, then restart the app.');
        } else {
          toastManager.warning('Screen recording permission not granted. Please check your system preferences.');
        }
      }
      
      return newStatus === 'granted';
    } catch (permError) {
      console.error('Error during permission request:', permError);
      
      // Still provide feedback to the user
      toastManager.error('Unable to request screen recording permission. Please enable it manually in System Preferences.');
      return false;
    }
  } catch (error) {
    console.error('Error in requestScreenCapturePermission:', error);
    return false;
  }
}

/**
 * Capture full resolution screenshot using Electron's desktopCapturer API
 * With enhanced permission handling for production
 */
const captureElectronScreenshot = async (imagePath) => {
  // On macOS, ensure we have proper permissions
  if (isMac) {
    // Always check permission status first
    const hasPermission = hasScreenCapturePermission();
    console.log(`Screen capture permission check: ${hasPermission ? 'Granted' : 'Not granted'}`);
    
    // Always try to request permission if we don't have it
    if (!hasPermission) {
      const granted = await requestScreenCapturePermission();
      if (!granted && !isDev) {
        // If permission not granted in production, show clear message
        toastManager.error('Screenshot failed: Screen recording permission denied. Please enable in System Preferences.');
      }
    }
  }

  console.log('Attempting to capture screenshot using desktopCapturer...');
  
  // Get sources with larger thumbnail size for better quality
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 3840, height: 2160 }, // Higher resolution
    fetchWindowIcons: false,
  });

  console.log(`Found ${sources.length} screen sources`);
  
  if (sources.length === 0) {
    throw new Error("No screen sources found");
  }

  // Take screenshot of the primary screen
  const primarySource = sources[0];
  console.log(`Using screen source: ${primarySource.name}`);
  
  // Get high-res thumbnail
  const thumbnail = primarySource.thumbnail;
  if (!thumbnail) {
    throw new Error("Failed to capture screen thumbnail");
  }

  console.log(`Captured thumbnail size: ${thumbnail.getSize().width}x${thumbnail.getSize().height}`);
  
  // Convert to PNG buffer with higher quality
  const pngBuffer = thumbnail.toPNG({
    scaleFactor: 2.0, // Increase scale factor for better quality
  });

  console.log(`PNG buffer size: ${pngBuffer.length} bytes`);
  
  // Save to disk
  fs.writeFileSync(imagePath, pngBuffer);
  console.log(`Screenshot saved to: ${imagePath}`);

  // Convert to base64
  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
};

/**
 * Capture a screenshot of the entire screen or active window 
 * with enhanced error handling and permission management
 */
async function captureScreenshot(mainWindow) {
  try {
    console.log(`[${isDev ? 'DEV' : 'PROD'}] Capturing screenshot...`);
    
    // On macOS, always check permission at the beginning
    if (isMac) {
      // Always check permission status first in production
      const hasPermission = hasScreenCapturePermission();
      console.log(`Has screen capture permission: ${hasPermission}`);
      
      // If no permission in production, be more aggressive about requesting it
      if (!hasPermission) {
        console.log('No permission detected, requesting...');
        const permissionRequested = await requestScreenCapturePermission();
        console.log(`Permission request result: ${permissionRequested}`);
        
        // If still no permission after requesting, try to guide the user
        if (!permissionRequested && !isDev) {
          toastManager.error('Screenshot failed: Please grant screen recording permission in System Preferences > Security & Privacy > Privacy > Screen Recording');
          // Don't return here, still try to capture in case the permission check is wrong
        }
      }
    }

    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const picturesPath = getAppPath("pictures", "");
    const imagePath = path.join(picturesPath, `screenshot-${timestamp}.png`);
    console.log(`Screenshot will be saved to: ${imagePath}`);

    // Hide the window before capturing
    const wasVisible = await autoHideWindow(mainWindow);
    console.log(`Window was visible: ${wasVisible}`);

    let base64Image = "";
    let success = false;

    // Always try the Electron built-in method first in production for consistency
    if (!isDev || (isLinux && !isCommandAvailable("import"))) {
      console.log("Using Electron's desktopCapturer for screenshot");
      try {
        base64Image = await captureElectronScreenshot(imagePath);
        success = true;
        console.log("Electron screenshot capture successful");
      } catch (electronError) {
        console.error("Electron screenshot failed:", electronError);
        
        // If in production, try again with a delay
        if (!isDev) {
          console.log("Retrying Electron screenshot after delay...");
          await new Promise(resolve => setTimeout(resolve, 500));
          try {
            base64Image = await captureElectronScreenshot(imagePath);
            success = true;
            console.log("Electron screenshot retry successful");
          } catch (retryError) {
            console.error("Electron screenshot retry failed:", retryError);
            // Continue to next method
          }
        }
      }
    }
    
    // If Electron method failed or not used, try the screenshot-desktop library
    if (!success) {
      console.log("Trying screenshot-desktop library");
      try {
        await screenshot({ filename: imagePath });
        const imageBuffer = fs.readFileSync(imagePath);
        base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
        success = true;
        console.log("screenshot-desktop capture successful");
      } catch (fallbackError) {
        console.error("screenshot-desktop failed:", fallbackError);
        
        // For Linux with specific error, try Electron again
        if (isLinux && fallbackError.message && fallbackError.message.includes("import: not found")) {
          console.log("Falling back to Electron's desktopCapturer for Linux");
          try {
            base64Image = await captureElectronScreenshot(imagePath);
            success = true;
            console.log("Electron fallback successful for Linux");
          } catch (electronError) {
            console.error("Electron fallback failed for Linux:", electronError);
            throw electronError;
          }
        } else {
          // For anything else, throw the original error
          throw fallbackError;
        }
      }
    }

    // Show the window again if it was originally visible
    if (wasVisible) {
      mainWindow.show();
      console.log("Window restored to visible state");
    }

    // Make sure the file exists
    if (!fs.existsSync(imagePath)) {
      throw new Error("Screenshot file was not created");
    }

    const stats = fs.statSync(imagePath);
    if (stats.size < 1000) {
      throw new Error("Screenshot file is too small, likely empty");
    }

    const dimensions = getImageDimensions(imagePath);
    console.log(`Screenshot dimensions: ${dimensions.width}x${dimensions.height}`);

    // Notify about saved screenshot
    toastManager.success(`Screenshot saved to ${imagePath} (${dimensions.width}x${dimensions.height})`);

    return base64Image;
  } catch (error) {
    console.error("Screenshot capture failed:", error);
    
    // Handle permission errors specially
    if (isMac && error.message && (
        error.message.includes("permission") || 
        error.message.includes("denied") || 
        error.message.includes("access")
    )) {
      // More specific error message for permission issues
      toastManager.error("Permission error: Please grant screen recording permission in System Preferences > Security & Privacy > Privacy > Screen Recording, then restart the app.");
      
      // Try to request permission again for next time
      await requestScreenCapturePermission();
    } else {
      // Generic error for other issues
      toastManager.error(`Screenshot failed: ${error.message}`);
    }
    
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
