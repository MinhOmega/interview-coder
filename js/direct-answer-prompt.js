const log = require("electron-log");

const directAnswerPrompt = `Analyze this problem and provide the BEST ANSWER with quick analytics.

Response format:
# Answer
[Direct answer - for MCQ: "Answer: B", for code: optimal solution, for numerical: exact result]

# Quick Analysis
[2-3 key points explaining why this is correct]

# Code (if needed)
\`\`\`language
// Clean, working solution
\`\`\`

Be concise and accurate. Focus on correctness and clarity.`;

/**
 * Creates a direct answer prompt for quick solutions
 *
 * @param {number} screenshotsCount - The number of screenshots
 * @param {string} language - The preferred language for the response (e.g., 'en', 'vi')
 * @returns {string} The prompt for direct answers
 */
function createDirectAnswerPrompt(screenshotsCount, language = "en") {
  log.info("Creating direct answer prompt with language:", language);

  let prompt = "";
  if (screenshotsCount === 1) {
    prompt = `The screenshot shows a question or problem that needs a direct answer. ${directAnswerPrompt}`;
  } else {
    prompt = `These ${screenshotsCount} screenshots show a question or problem that needs a direct answer. Analyze all parts carefully. ${directAnswerPrompt}`;
  }

  const languageMap = {
    vi: "Vietnamese",
    es: "Spanish",
    fr: "French",
    de: "German",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
  };

  if (language === "en" || !languageMap[language]) {
    return prompt;
  }

  return `${prompt}\n\nIMPORTANT: Please respond entirely in ${languageMap[language]} language.`;
}

module.exports = {
  createDirectAnswerPrompt,
};