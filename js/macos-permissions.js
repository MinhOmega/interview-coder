const { desktopCapturer, shell, systemPreferences } = require("electron");

const SCREEN_RECORDING_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";
let hasOpenedSettings = false;

function hasScreenCapturePermission() {
  if (process.platform !== "darwin") return true;
  try {
    return systemPreferences.getMediaAccessStatus("screen") === "granted";
  } catch (error) {
    console.error("[macOS] Unable to read screen-recording permission:", error.message);
    return false;
  }
}

function resetPermissionsCache() {
  hasOpenedSettings = false;
}

async function requestScreenCapturePermission({ openSettings = true } = {}) {
  if (process.platform !== "darwin" || hasScreenCapturePermission()) return true;

  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    });
    if (sources.length > 0 && hasScreenCapturePermission()) return true;
  } catch (error) {
    console.warn("[macOS] Screen capture is unavailable:", error?.message || String(error));
  }

  if (openSettings && !hasOpenedSettings) {
    hasOpenedSettings = true;
    try {
      await shell.openExternal(SCREEN_RECORDING_SETTINGS_URL);
    } catch (error) {
      console.error("[macOS] Unable to open Screen Recording settings:", error.message);
    }
  }

  return false;
}

async function initializePermissions() {
  return {
    success: true,
    screenCapturePermission: hasScreenCapturePermission(),
  };
}

async function forcePermissionRequest() {
  return requestScreenCapturePermission();
}

module.exports = {
  SCREEN_RECORDING_SETTINGS_URL,
  forcePermissionRequest,
  hasScreenCapturePermission,
  initializePermissions,
  requestScreenCapturePermission,
  resetPermissionsCache,
};
