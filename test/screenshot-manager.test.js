const assert = require("node:assert/strict");
const test = require("node:test");

const { isManagedScreenshot } = require("../js/screenshot-files");

test("cleanup pattern only accepts Interview Coder UUID screenshots", () => {
  assert.equal(isManagedScreenshot("screenshot-05d8d6a5-f546-43dc-8771-7e049cb35029.png"), true);
  assert.equal(isManagedScreenshot("fullscreen-05d8d6a5-f546-43dc-8771-7e049cb35029.png"), true);
  assert.equal(isManagedScreenshot("family-photo.png"), false);
  assert.equal(isManagedScreenshot("Screenshot 2026-09-01.png"), false);
  assert.equal(isManagedScreenshot("screenshot-not-a-uuid.png"), false);
});
