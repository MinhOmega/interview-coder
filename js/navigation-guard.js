function guardNavigation(webContents) {
  webContents.on("will-navigate", (event) => event.preventDefault());
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

module.exports = { guardNavigation };
