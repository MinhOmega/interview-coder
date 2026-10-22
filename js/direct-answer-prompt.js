const { getResponseLanguageInstruction } = require("./language-instructions");
const {
  DEFAULT_RESPONSE_PROFILE,
  DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS,
  getResponseProfileInstruction,
} = require("./response-profiles");

const directAnswerPrompt = `Give the direct answer visible from the screenshot. For a multiple-choice question, return the option and a brief reason. For an error, state the likely cause and smallest fix. Include code only when it is necessary to answer.`;

/**
 * Creates a direct answer prompt for quick solutions
 *
 * @param {number} screenshotsCount - The number of screenshots
 * @param {string} language - The preferred language for the response (e.g., 'en', 'vi')
 * @returns {string} The prompt for direct answers
 */
function createDirectAnswerPrompt(
  screenshotsCount,
  language = "en",
  responseProfile = DEFAULT_RESPONSE_PROFILE,
  customMaxOutputTokens = DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS,
) {
  let prompt = "";
  if (screenshotsCount === 1) {
    prompt = `The screenshot shows a question or problem that needs a direct answer. ${directAnswerPrompt}`;
  } else {
    prompt = `These ${screenshotsCount} screenshots show a question or problem that needs a direct answer. Analyze all parts carefully. ${directAnswerPrompt}`;
  }

  const languageInstruction = getResponseLanguageInstruction(language);
  const profileInstruction = getResponseProfileInstruction(responseProfile, customMaxOutputTokens);
  return [prompt, languageInstruction, profileInstruction].filter(Boolean).join("\n\n");
}

module.exports = {
  createDirectAnswerPrompt,
};
