const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getOpenAIOutputOptions,
  getGeminiOutputOptions,
  getOllamaOutputOptions,
  getAzureOutputTokenLimit,
} = require("../js/provider-output-options");

test("maps a profile limit to each provider option", () => {
  assert.deepEqual(getOpenAIOutputOptions(256), { max_tokens: 256 });
  assert.deepEqual(getGeminiOutputOptions(768), { maxOutputTokens: 768 });
  assert.deepEqual(getOllamaOutputOptions(2048), { num_predict: 2048 });
});

test("controls Gemini 2.5 Flash thinking within the selected budget", () => {
  assert.deepEqual(getGeminiOutputOptions(256, "gemini-2.5-flash"), {
    maxOutputTokens: 256,
    thinkingConfig: { thinkingBudget: 0 },
  });
  assert.deepEqual(getGeminiOutputOptions(2048, "models/gemini-2.5-flash"), {
    maxOutputTokens: 2560,
    thinkingConfig: { thinkingBudget: 512 },
  });
  assert.deepEqual(getGeminiOutputOptions(256, "gemini-2.5-flash-lite"), {
    maxOutputTokens: 256,
  });
});

test("reserves Gemini 3.5 Flash thinking outside the visible response target", () => {
  assert.deepEqual(getGeminiOutputOptions(256, "gemini-3.5-flash"), {
    maxOutputTokens: 384,
    thinkingConfig: { thinkingLevel: "minimal" },
  });
  assert.deepEqual(getGeminiOutputOptions(768, "models/gemini-3.5-flash"), {
    maxOutputTokens: 1024,
    thinkingConfig: { thinkingLevel: "low" },
  });
  assert.deepEqual(getGeminiOutputOptions(2048, "gemini-3.5-flash"), {
    maxOutputTokens: 2560,
    thinkingConfig: { thinkingLevel: "medium" },
  });
});

test("uses model-compatible Gemini 3 thinking levels", () => {
  assert.deepEqual(getGeminiOutputOptions(256, "gemini-3.7-flash"), {
    maxOutputTokens: 384,
    thinkingConfig: { thinkingLevel: "low" },
  });
  assert.deepEqual(getGeminiOutputOptions(128, "gemini-3.6-flash-09-2026"), {
    maxOutputTokens: 256,
    thinkingConfig: { thinkingLevel: "minimal" },
  });
  assert.deepEqual(getGeminiOutputOptions(4096, "gemini-3-flash-preview"), {
    maxOutputTokens: 4608,
    thinkingConfig: { thinkingLevel: "medium" },
  });
});

test("does not guess thinking controls for unknown Gemini models", () => {
  assert.deepEqual(getGeminiOutputOptions(256, "gemini-1.5-flash"), {
    maxOutputTokens: 256,
  });
});

test("clamps Azure output to the model limit", () => {
  assert.equal(getAzureOutputTokenLimit(8192, 4096), 4096);
  assert.equal(getAzureOutputTokenLimit(256, 4096), 256);
});

test("rejects invalid provider output limits", () => {
  assert.throws(() => getOpenAIOutputOptions(0), /positive integer/);
  assert.throws(() => getGeminiOutputOptions(256.5), /positive integer/);
  assert.throws(() => getOllamaOutputOptions("256"), /positive integer/);
});
