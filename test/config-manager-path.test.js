const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("installed app saves configuration under userData, not its launch directory", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "interview-coder-path-")));
  const userData = path.join(root, "user-data");
  const launch = path.join(root, "launch");
  fs.mkdirSync(launch);
  const originalDirectory = process.cwd();
  const originalLoad = Module._load;
  const app = { isPackaged: true, getPath: () => userData };

  try {
    process.chdir(launch);
    Module._load = function (request, parent, isMain) {
      if (request === "electron") return { app };
      return originalLoad.call(this, request, parent, isMain);
    };
    const configManager = require("../js/config-manager");
    Module._load = originalLoad;

    const configPath = path.join(userData, "interview-coder.config.json");
    assert.equal(configManager.getProjectSettingsFilePath(), configPath);
    assert.equal(configManager.saveSettingsToFile({ responseLanguage: "ru" }), true);
    assert.equal(JSON.parse(fs.readFileSync(configPath, "utf8")).responseLanguage, "ru");
    assert.equal(fs.existsSync(path.join(launch, "interview-coder.config.json")), false);

    process.chdir(root);
    assert.equal(configManager.getProjectSettingsFilePath(), configPath);
    app.isPackaged = false;
    assert.equal(
      configManager.getProjectSettingsFilePath(),
      path.join(root, "interview-coder.config.json"),
    );
  } finally {
    Module._load = originalLoad;
    process.chdir(originalDirectory);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
