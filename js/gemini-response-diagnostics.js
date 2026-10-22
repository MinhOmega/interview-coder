const TOKEN_FIELDS = [
  "promptTokenCount",
  "candidatesTokenCount",
  "thoughtsTokenCount",
  "cachedContentTokenCount",
  "totalTokenCount",
];

function getGeminiResponseDiagnostics(response) {
  if (!response || typeof response !== "object") return null;

  const diagnostics = {};
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason) diagnostics.finishReason = finishReason;

  const usageMetadata = response.usageMetadata;
  if (usageMetadata && typeof usageMetadata === "object") {
    for (const field of TOKEN_FIELDS) {
      if (Number.isFinite(usageMetadata[field])) {
        diagnostics[field] = usageMetadata[field];
      }
    }
  }

  return Object.keys(diagnostics).length > 0 ? diagnostics : null;
}

function logGeminiResponseDiagnostics(response, logger = console) {
  const diagnostics = getGeminiResponseDiagnostics(response);
  if (!diagnostics) return null;

  logger.info("Gemini response diagnostics:", diagnostics);
  if (diagnostics.finishReason === "MAX_TOKENS") {
    logger.warn("Gemini reached MAX_TOKENS; preserving the partial response without an automatic retry.");
  }
  return diagnostics;
}

module.exports = {
  getGeminiResponseDiagnostics,
  logGeminiResponseDiagnostics,
};
