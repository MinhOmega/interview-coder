const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_RESPONSE_PROFILE,
  getEffectiveMaxOutputTokens,
  getResponseProfileInstruction,
  validateCustomMaxOutputTokens,
  validateResponseProfile,
} = require("../js/response-profiles");

test("uses Easy as the default response profile", () => {
  assert.equal(DEFAULT_RESPONSE_PROFILE, "easy");
  assert.equal(getEffectiveMaxOutputTokens(), 256);
});

test("maps fixed profiles to their output-token limits", () => {
  assert.equal(getEffectiveMaxOutputTokens("easy"), 256);
  assert.equal(getEffectiveMaxOutputTokens("medium"), 768);
  assert.equal(getEffectiveMaxOutputTokens("hard"), 2048);
});

test("accepts inclusive custom output-token boundaries", () => {
  assert.equal(validateCustomMaxOutputTokens(128), 128);
  assert.equal(validateCustomMaxOutputTokens(8192), 8192);
  assert.equal(getEffectiveMaxOutputTokens("custom", 1536), 1536);
});

test("rejects invalid profiles and custom limits", () => {
  assert.throws(() => validateResponseProfile("verbose"), /Unsupported response profile/);
  assert.throws(() => validateCustomMaxOutputTokens(127), /between 128 and 8192/);
  assert.throws(() => validateCustomMaxOutputTokens(8193), /between 128 and 8192/);
  assert.throws(() => validateCustomMaxOutputTokens(256.5), /must be an integer/);
  assert.throws(() => validateCustomMaxOutputTokens("256"), /must be an integer/);
});

test("Easy instruction enforces a compact response", () => {
  const instruction = getResponseProfileInstruction("easy");
  assert.match(instruction, /within 256 output tokens/);
  assert.match(instruction, /at most 3 short bullet points/);
  assert.match(instruction, /at most 12 lines of code/);
  assert.doesNotMatch(instruction, /Analyzing the Problem|My Thoughts|Complexity|bilingual/i);
});

test("Medium instruction requests a minimal patch", () => {
  const instruction = getResponseProfileInstruction("medium");
  assert.match(instruction, /within 768 output tokens/);
  assert.match(instruction, /smallest useful patch/);
  assert.match(instruction, /at most 40 lines of code/);
});

test("Custom instruction adapts its detail to the budget", () => {
  assert.match(getResponseProfileInstruction("custom", 256), /at most 12 lines of code/);
  assert.match(getResponseProfileInstruction("custom", 1000), /at most 40 lines of code/);
  assert.match(getResponseProfileInstruction("custom", 4096), /complete code only when/);
});
