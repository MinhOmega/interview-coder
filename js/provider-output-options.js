function assertOutputTokenLimit(maxOutputTokens) {
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) {
    throw new TypeError("Output-token limit must be a positive integer");
  }
  return maxOutputTokens;
}

function getOpenAIOutputOptions(maxOutputTokens) {
  return { max_tokens: assertOutputTokenLimit(maxOutputTokens) };
}

function getGeminiThinkingReserve(visibleOutputTokens) {
  if (visibleOutputTokens <= 256) return 128;
  if (visibleOutputTokens <= 768) return 256;
  return Math.min(512, Math.floor(visibleOutputTokens / 4));
}

function getGeminiOutputOptions(maxOutputTokens, model = "") {
  const visibleOutputTokens = assertOutputTokenLimit(maxOutputTokens);
  const options = { maxOutputTokens: visibleOutputTokens };
  const normalizedModel = String(model).replace(/^models\//, "");
  const isGemini25Flash = /^gemini-2\.5-flash(?:-preview.*)?$/i.test(normalizedModel);
  if (isGemini25Flash) {
    const thinkingBudget = visibleOutputTokens <= 768
      ? 0
      : Math.min(512, Math.floor(visibleOutputTokens / 4));
    options.thinkingConfig = {
      thinkingBudget,
    };
    options.maxOutputTokens += thinkingBudget;
    return options;
  }

  const datedSuffix = "(?:-(?:preview(?:-\\d{2}-\\d{4})?|\\d{2}-\\d{4}|\\d{3}))?";
  const supportsMinimalThinking = new RegExp(
    `^gemini-(?:3\\.5-flash(?:-lite)?|3\\.6-flash|3-flash-preview)${datedSuffix}$`,
    "i",
  ).test(normalizedModel);
  const supportsThinkingLevel = supportsMinimalThinking || new RegExp(
    `^gemini-3\\.7-flash${datedSuffix}$`,
    "i",
  ).test(normalizedModel);

  if (supportsThinkingLevel) {
    let thinkingLevel = "medium";
    if (visibleOutputTokens <= 256) {
      thinkingLevel = supportsMinimalThinking ? "minimal" : "low";
    } else if (visibleOutputTokens <= 768) {
      thinkingLevel = "low";
    }

    options.thinkingConfig = { thinkingLevel };
    options.maxOutputTokens += getGeminiThinkingReserve(visibleOutputTokens);
  }

  return options;
}

function getOllamaOutputOptions(maxOutputTokens) {
  return { num_predict: assertOutputTokenLimit(maxOutputTokens) };
}

function getAzureOutputTokenLimit(maxOutputTokens, modelMaxTokens) {
  return Math.min(
    assertOutputTokenLimit(maxOutputTokens),
    assertOutputTokenLimit(modelMaxTokens),
  );
}

module.exports = {
  assertOutputTokenLimit,
  getOpenAIOutputOptions,
  getGeminiOutputOptions,
  getOllamaOutputOptions,
  getAzureOutputTokenLimit,
};
