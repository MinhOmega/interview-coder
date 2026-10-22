const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");

test("settings UI exposes response profiles and a bounded custom limit", () => {
  const html = read("model-selector.html");
  const script = read("model-selector.js");
  assert.match(html, /id="response-profile-cards"/);
  assert.match(html, /id="custom-max-output-tokens"[^>]*min="128"[^>]*max="8192"/);
  assert.match(script, /responseProfile/);
  assert.match(script, /customMaxOutputTokens/);
  assert.match(script, /validateCustomMaxOutputTokens/);
});

test("toolbar chat controls open split view and reset the conversation", () => {
  const html = read("index.html");
  const renderer = read("renderer.js");
  assert.match(html, /id="chat-toolbar-button"/);
  assert.match(html, /id="new-chat-button"/);
  assert.match(renderer, /chatToolbarButton.*toggleSplitView\(\{ forceState: true \}\)/s);
  assert.match(renderer, /newChatButton.*resetChat\(\)/s);
});
