/**
 * Development configuration module for the Interview Coder application
 * Provides hot reloading capabilities during development
 */
const path = require("path");
const { app } = require("electron");
const chokidar = require("chokidar");

/**
 * Configure hot reloading for development
 * @param {BrowserWindow} mainWindow - The main application window
 * @param {BrowserWindow} modelSelectorWindow - The model selector window (if open)
 */
function setupHotReload(mainWindow, modelSelectorWindow) {
  const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

  if (!isDev) {
    return;
  }

  // Watch renderer process files
  const rendererWatcher = chokidar.watch(
    [
      path.join(__dirname, "../renderer.js"),
      path.join(__dirname, "../styles.css"),
      path.join(__dirname, "../index.html"),
      path.join(__dirname, "../model-selector.js"),
      path.join(__dirname, "../model-selector.css"),
      path.join(__dirname, "../model-selector.html"),
    ],
    {
      ignored: /(^|[\/\\])\../,
      persistent: true,
    },
  );

  rendererWatcher.on("change", (path) => {
    console.log(`File ${path} has been changed. Reloading...`);

    if (path.includes("model-selector") && modelSelectorWindow) {
      modelSelectorWindow.webContents.reloadIgnoringCache();
      console.log("Model selector window reloaded");
    } else if (mainWindow) {
      mainWindow.webContents.reloadIgnoringCache();
      console.log("Main window reloaded");
    }
  });

  // Watch main process files
  const mainProcessWatcher = chokidar.watch(
    [path.join(__dirname, "..", "main.js"), path.join(__dirname, "**", "*.js")],
    {
      ignored: [
        /(^|[\/\\])\../,
        path.join(__dirname, "dev-config.js"), // Don't watch this file
      ],
      persistent: true,
    },
  );

  mainProcessWatcher.on("change", (path) => {
    console.log(`Main process file ${path} has been changed. App will restart...`);

    // Force app to quit and restart through electron-reload
    if (process.send) {
      process.send("electron-reload");
    }
  });

  console.log("Development hot reload initialized");
}

module.exports = {
  setupHotReload,
};
