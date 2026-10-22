const LANGUAGE_NAMES = {
  vi: "Vietnamese",
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
};

function getResponseLanguageInstruction(language) {
  const languageName = LANGUAGE_NAMES[language];
  if (!languageName) return "";
  return `Respond in ${languageName}. Keep source code, identifiers, API names, and technical tokens unchanged when translating them would reduce correctness.`;
}

module.exports = { getResponseLanguageInstruction, LANGUAGE_NAMES };
