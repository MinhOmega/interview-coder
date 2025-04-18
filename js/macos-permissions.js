/**
 * macOS Permissions Helper
 *
 * Specialized module for handling macOS-specific permissions
 * especially for screen recording which is critical for the app functionality
 */

const { systemPreferences, desktopCapturer, app } = require("electron");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// Check if we're in production mode
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// Centralized storage for permissions status
let screenCapturePermissionGranted = null;

/**
 * Check if screen recording permission is granted
 * @returns {boolean} True if permission is granted
 */
function hasScreenCapturePermission() {
  try {
    if (screenCapturePermissionGranted !== null) {
      return screenCapturePermissionGranted;
    }

    // Try the official API first
    const status = systemPreferences.getMediaAccessStatus("screen");
    console.log(`[macOS] Screen recording permission status: ${status}`);

    screenCapturePermissionGranted = status === "granted";
    return screenCapturePermissionGranted;
  } catch (error) {
    console.error("[macOS] Error checking screen recording permission:", error);
    return false;
  }
}

/**
 * Reset cached permissions status
 */
function resetPermissionsCache() {
  screenCapturePermissionGranted = null;
}

/**
 * Request screen recording permission through all available methods
 */
async function requestScreenCapturePermission() {
  console.log(`[macOS] Requesting screen recording permission...`);

  try {
    // Try multiple approaches for best chance of success

    // Method 1: Use systemPreferences API
    try {
      const granted = await systemPreferences.askForMediaAccess("screen");
      console.log("[macOS] askForMediaAccess result:", granted);
    } catch (err) {
      console.error("[macOS] Error with askForMediaAccess:", err);
    }

    // Method 2: Use desktopCapturer to trigger the permission dialog
    try {
      console.log("[macOS] Triggering permission via desktopCapturer...");
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1, height: 1 },
      });
      console.log(`[macOS] Found ${sources.length} screen sources`);
    } catch (err) {
      console.error("[macOS] Error with desktopCapturer:", err);
    }

    // Method 3: Try a direct tccutil command if in development mode
    if (isDev) {
      try {
        console.log("[macOS] Attempting tccutil reset (dev mode only)...");
        exec("tccutil reset ScreenCapture", (error, stdout, stderr) => {
          if (error) {
            console.error(`[macOS] tccutil error: ${error.message}`);
            return;
          }
          if (stderr) {
            console.error(`[macOS] tccutil stderr: ${stderr}`);
            return;
          }
          console.log(`[macOS] tccutil stdout: ${stdout}`);
        });
      } catch (err) {
        console.error("[macOS] Error with tccutil:", err);
      }
    }

    // Check permission again after all attempts
    resetPermissionsCache();
    const newStatus = hasScreenCapturePermission();
    console.log(`[macOS] Permission status after request: ${newStatus ? "granted" : "denied"}`);

    return newStatus;
  } catch (error) {
    console.error("[macOS] Error in requestScreenCapturePermission:", error);
    return false;
  }
}

/**
 * Initialize permissions handling for macOS
 * Call this early in the app lifecycle
 */
async function initializePermissions() {
  if (process.platform !== "darwin") {
    return { success: true, message: "Not macOS, no action needed" };
  }

  console.log("[macOS] Initializing permissions handling...");

  // Register command line switches for better screen capture
  app.commandLine.appendSwitch("enable-permissions-api");
  app.commandLine.appendSwitch("enable-features", "ScreenCaptureAPI");

  // Check initial permission status
  const initialStatus = hasScreenCapturePermission();
  console.log(`[macOS] Initial screen recording permission: ${initialStatus ? "granted" : "not granted"}`);

  // If permission not granted, request it
  if (!initialStatus) {
    await requestScreenCapturePermission();
  }

  // Return current status
  return {
    success: true,
    screenCapturePermission: hasScreenCapturePermission(),
  };
}

/**
 * Advanced permission forcing for problematic scenarios
 * Only use this as a last resort
 */
async function forcePermissionRequest() {
  if (process.platform !== "darwin") return false;

  console.log("[macOS] Forcing permission request with multiple methods...");

  try {
    // Force permission dialog through multiple attempts with delays
    for (let i = 0; i < 3; i++) {
      console.log(`[macOS] Force attempt ${i + 1}...`);

      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 10, height: 10 },
        });

        if (sources.length > 0) {
          const img = sources[0].thumbnail;
          if (img) {
            // Try to save a tiny test image to trigger permission
            const testBuffer = img.toPNG();
            const testPath = path.join(app.getPath("temp"), "test-permission.png");
            fs.writeFileSync(testPath, testBuffer);
            console.log(`[macOS] Wrote test image to ${testPath}`);

            // Delete the test file
            try {
              fs.unlinkSync(testPath);
            } catch (e) {}
          }
        }
      } catch (e) {
        console.log(`[macOS] Expected error during force attempt: ${e.message}`);
      }

      // Wait between attempts
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if permission was granted
      resetPermissionsCache();
      if (hasScreenCapturePermission()) {
        console.log("[macOS] Permission granted after force attempt!");
        return true;
      }
    }

    console.log("[macOS] Force attempts completed, checking final status...");
    return hasScreenCapturePermission();
  } catch (error) {
    console.error("[macOS] Error in forcePermissionRequest:", error);
    return false;
  }
}

module.exports = {
  hasScreenCapturePermission,
  requestScreenCapturePermission,
  initializePermissions,
  forcePermissionRequest,
  resetPermissionsCache,
};
