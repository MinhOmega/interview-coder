function isManagedScreenshot(filename) {
  return /^(?:screenshot|fullscreen)-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/i.test(
    filename,
  );
}

module.exports = { isManagedScreenshot };
