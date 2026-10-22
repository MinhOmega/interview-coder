const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { getMainFileMatchers } = require("app-builder-lib/out/fileMatcher");
const { build } = require("../package.json");

test("application package excludes local secrets and captures", () => {
  const root = path.resolve(__dirname, "..");
  const output = path.join(root, "dist");
  const packager = {
    info: {
      projectDir: root,
      buildResourcesDir: "build",
      isPrepackedAppAsar: false,
      config: build,
      debugLogger: { isEnabled: false },
    },
  };
  const matcher = getMainFileMatchers(
    root,
    path.join(output, "app"),
    (value) => value,
    {},
    packager,
    output,
    false,
  )[0];
  const includes = matcher.createFilter();
  const fileStat = { isDirectory: () => false };

  for (const filename of [
    "interview-coder.config.json",
    "interview-coder.config.json.123.456.tmp",
    ".env",
    ".env.local",
    "nested/.env.production",
    ".agent/STATE.md",
    ".claude/settings.local.json",
    "screenshots/capture.png",
    "tmp/capture.png",
    "temp/capture.png",
  ]) {
    assert.equal(includes(path.join(root, filename), fileStat), false, filename);
  }
  assert.equal(includes(path.join(root, "main.js"), fileStat), true);
});
