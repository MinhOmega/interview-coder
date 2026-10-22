const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getGeminiResponseDiagnostics,
  logGeminiResponseDiagnostics,
} = require("../js/gemini-response-diagnostics");

test("extracts safe Gemini finish and token metadata", () => {
  assert.deepEqual(getGeminiResponseDiagnostics({
    candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "secret output" }] } }],
    usageMetadata: {
      promptTokenCount: 900,
      candidatesTokenCount: 12,
      thoughtsTokenCount: 372,
      totalTokenCount: 1284,
    },
  }), {
    finishReason: "MAX_TOKENS",
    promptTokenCount: 900,
    candidatesTokenCount: 12,
    thoughtsTokenCount: 372,
    totalTokenCount: 1284,
  });
});

test("warns on MAX_TOKENS without logging response content", () => {
  const entries = [];
  const logger = {
    info: (...args) => entries.push(["info", ...args]),
    warn: (...args) => entries.push(["warn", ...args]),
  };

  logGeminiResponseDiagnostics({
    candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "do not log" }] } }],
    usageMetadata: { totalTokenCount: 384 },
  }, logger);

  assert.equal(entries.length, 2);
  assert.equal(entries[1][0], "warn");
  assert.doesNotMatch(JSON.stringify(entries), /do not log/);
});

test("ignores responses without diagnostic metadata", () => {
  assert.equal(getGeminiResponseDiagnostics(null), null);
  assert.equal(getGeminiResponseDiagnostics({}), null);
});
