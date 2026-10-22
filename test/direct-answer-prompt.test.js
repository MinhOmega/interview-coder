const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

test("direct answer prompt stays independent from Electron file logging", () => {
  const modulePath = path.join(__dirname, "..", "js", "direct-answer-prompt.js");
  const script = `require(${JSON.stringify(modulePath)}); process.stdout.write(String(Boolean(require.cache[require.resolve("electron-log")])));`;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "false");
});
