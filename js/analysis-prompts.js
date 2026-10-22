const { createUIPrompt } = require("./ui-implementation-prompt");
const { getResponseLanguageInstruction } = require("./language-instructions");
const {
  DEFAULT_RESPONSE_PROFILE,
  DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS,
  getEffectiveMaxOutputTokens,
  getResponseProfileInstruction,
} = require("./response-profiles");

const BASE_ANALYSIS_PROMPT = `Analyze the visible programming problem, error, or question. Identify the most likely cause and give the smallest useful correction. Base the answer only on evidence visible in the screenshot; clearly label uncertainty instead of inventing missing code.`;

function createAnalysisPrompt(
  screenshotsCount,
  language = "en",
  responseProfile = DEFAULT_RESPONSE_PROFILE,
  customMaxOutputTokens = DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS,
) {
  const screenshotContext = screenshotsCount === 1
    ? "The screenshot shows a programming problem, question, or error."
    : `These ${screenshotsCount} screenshots show parts of one programming problem, question, or error.`;
  return [
    screenshotContext,
    BASE_ANALYSIS_PROMPT,
    getResponseLanguageInstruction(language),
    getResponseProfileInstruction(responseProfile, customMaxOutputTokens),
  ].filter(Boolean).join("\n\n");
}

function createUIResponsePrompt(
  screenshotsCount,
  language = "en",
  responseProfile = DEFAULT_RESPONSE_PROFILE,
  customMaxOutputTokens = DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS,
) {
  const maxOutputTokens = getEffectiveMaxOutputTokens(responseProfile, customMaxOutputTokens);
  const canRequestFullImplementation = responseProfile === "hard"
    || (responseProfile === "custom" && maxOutputTokens > 1536);
  const taskPrompt = canRequestFullImplementation
    ? createUIPrompt(screenshotsCount)
    : screenshotsCount === 1
      ? "Analyze the UI screenshot and identify the most important implementation detail or next step. Do not attempt a complete implementation within a small response budget."
      : `Analyze these ${screenshotsCount} UI screenshots and identify the most important shared implementation detail or next step. Do not attempt a complete implementation within a small response budget.`;
  return [
    taskPrompt,
    getResponseLanguageInstruction(language),
    getResponseProfileInstruction(responseProfile, customMaxOutputTokens),
  ].filter(Boolean).join("\n\n");
}

module.exports = {
  BASE_ANALYSIS_PROMPT,
  createAnalysisPrompt,
  createUIResponsePrompt,
};
