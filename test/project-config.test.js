const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
  getConfigPath,
  mergeConfigs,
  readProjectConfig,
  validateProjectConfig,
  writeProjectConfigAtomic,
} = require("../js/project-config");

test("packaged config stays in user data regardless of working directory", () => {
  const userDataPath = path.join(os.tmpdir(), "interview-coder-user-data");
  const first = getConfigPath(true, userDataPath, path.join(os.tmpdir(), "launch-one"));
  const second = getConfigPath(true, userDataPath, path.join(os.tmpdir(), "launch-two"));

  assert.equal(first, path.join(userDataPath, "interview-coder.config.json"));
  assert.equal(second, first);
  assert.equal(
    getConfigPath(false, userDataPath, path.join(os.tmpdir(), "source-tree")),
    path.join(os.tmpdir(), "source-tree", "interview-coder.config.json"),
  );
  assert.throws(
    () => getConfigPath(true, "", path.join(os.tmpdir(), "launch")),
    /user data directory/,
  );
});

test("merges nested provider keys without losing legacy keys", () => {
  const merged = mergeConfigs(
    { aiProvider: "AI", apiKeys: { openai: "old" } },
    { aiProvider: "gemini", apiKeys: { gemini: "new" } },
  );

  assert.equal(merged.aiProvider, "gemini");
  assert.deepEqual(merged.apiKeys, { openai: "old", gemini: "new" });
});

test("rejects malformed and unsupported configuration", () => {
  assert.throws(() => validateProjectConfig([], "config.json"), /JSON object/);
  assert.throws(
    () => validateProjectConfig({ aiProvider: "unknown" }, "config.json"),
    /Unsupported AI provider/,
  );
  assert.throws(
    () => validateProjectConfig({ responseLanguage: "xx" }, "config.json"),
    /Unsupported response language/,
  );
  assert.throws(
    () => validateProjectConfig({ responseProfile: "verbose" }, "config.json"),
    /Unsupported response profile/,
  );
  assert.throws(
    () => validateProjectConfig({ customMaxOutputTokens: 64 }, "config.json"),
    /between 128 and 8192/,
  );
  assert.throws(
    () => validateProjectConfig({ customMaxOutputTokens: 256.5 }, "config.json"),
    /must be an integer/,
  );
});

test("writes atomically, preserves unknown fields, and applies private permissions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "interview-coder-config-"));
  const filePath = path.join(directory, "interview-coder.config.json");
  const config = {
    aiProvider: "gemini",
    currentModel: "gemini-2.5-flash",
    responseLanguage: "ru",
    responseProfile: "easy",
    customMaxOutputTokens: 1024,
    customField: { keep: true },
    apiKeys: { gemini: "secret" },
  };

  writeProjectConfigAtomic(filePath, config);
  assert.deepEqual(readProjectConfig(filePath), config);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  }
  assert.equal(fs.readdirSync(directory).some((name) => name.endsWith(".tmp")), false);

  fs.rmSync(directory, { recursive: true, force: true });
});

test("does not overwrite malformed existing JSON", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "interview-coder-config-"));
  const filePath = path.join(directory, "interview-coder.config.json");
  fs.writeFileSync(filePath, "{broken", "utf8");

  assert.throws(() => readProjectConfig(filePath), /Unable to parse JSON/);
  assert.equal(fs.readFileSync(filePath, "utf8"), "{broken");

  fs.rmSync(directory, { recursive: true, force: true });
});
