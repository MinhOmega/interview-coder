const DEFAULT_RESPONSE_PROFILE = "easy";
const DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS = 1024;
const MIN_CUSTOM_MAX_OUTPUT_TOKENS = 128;
const MAX_CUSTOM_MAX_OUTPUT_TOKENS = 8192;

const RESPONSE_PROFILES = Object.freeze({
  easy: Object.freeze({
    id: "easy",
    name: "Easy",
    maxOutputTokens: 256,
    description: "Direct answer with only the essential explanation.",
  }),
  medium: Object.freeze({
    id: "medium",
    name: "Medium",
    maxOutputTokens: 768,
    description: "Brief junior-interview explanation and a minimal fix.",
  }),
  hard: Object.freeze({
    id: "hard",
    name: "Hard",
    maxOutputTokens: 2048,
    description: "Complete solution for a genuinely complex task.",
  }),
  custom: Object.freeze({
    id: "custom",
    name: "Custom",
    maxOutputTokens: null,
    description: "A user-defined output-token budget.",
  }),
});

function validateResponseProfile(profile) {
  if (typeof profile !== "string" || !RESPONSE_PROFILES[profile]) {
    throw new TypeError(`Unsupported response profile "${profile}"`);
  }
  return profile;
}

function validateCustomMaxOutputTokens(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("Custom output-token limit must be an integer");
  }
  if (value < MIN_CUSTOM_MAX_OUTPUT_TOKENS || value > MAX_CUSTOM_MAX_OUTPUT_TOKENS) {
    throw new RangeError(
      `Custom output-token limit must be between ${MIN_CUSTOM_MAX_OUTPUT_TOKENS} and ${MAX_CUSTOM_MAX_OUTPUT_TOKENS}`,
    );
  }
  return value;
}

function getEffectiveMaxOutputTokens(
  profile = DEFAULT_RESPONSE_PROFILE,
  customMaxOutputTokens = DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS,
) {
  validateResponseProfile(profile);
  if (profile === "custom") return validateCustomMaxOutputTokens(customMaxOutputTokens);
  return RESPONSE_PROFILES[profile].maxOutputTokens;
}

function getCustomInstructionStyle(limit) {
  if (limit <= 512) return "easy";
  if (limit <= 1536) return "medium";
  return "hard";
}

function getResponseProfileInstruction(
  profile = DEFAULT_RESPONSE_PROFILE,
  customMaxOutputTokens = DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS,
) {
  const maxOutputTokens = getEffectiveMaxOutputTokens(profile, customMaxOutputTokens);
  const instructionStyle = profile === "custom" ? getCustomInstructionStyle(maxOutputTokens) : profile;
  const common = [
    `Keep the entire response within ${maxOutputTokens} output tokens.`,
    "Lead with the answer, diagnosis, or fix. Do not restate the question or repeat conclusions.",
    "Keep code, identifiers, commands, API names, and error messages unchanged.",
  ];

  if (instructionStyle === "easy") {
    common.push(
      "Use at most 3 short bullet points.",
      "Include at most 12 lines of code and only when code is necessary.",
      "Never output a complete source file. If more detail is required, give the next action and suggest a larger response profile.",
    );
  } else if (instructionStyle === "medium") {
    common.push(
      "Give a brief reason and the smallest useful patch or code fragment.",
      "Include at most 40 lines of code and avoid complete source files when a patch is enough.",
      "If the complete solution will not fit, prioritize the root cause and next action.",
    );
  } else {
    common.push(
      "Use a concise structured explanation only where it improves clarity.",
      "Provide complete code only when the task genuinely requires it; otherwise show a focused patch.",
      "Omit generic theory, repeated reasoning, and unrelated alternatives.",
    );
  }

  return common.join(" ");
}

function getResponseProfiles() {
  return RESPONSE_PROFILES;
}

module.exports = {
  DEFAULT_RESPONSE_PROFILE,
  DEFAULT_CUSTOM_MAX_OUTPUT_TOKENS,
  MIN_CUSTOM_MAX_OUTPUT_TOKENS,
  MAX_CUSTOM_MAX_OUTPUT_TOKENS,
  RESPONSE_PROFILES,
  getResponseProfiles,
  validateResponseProfile,
  validateCustomMaxOutputTokens,
  getEffectiveMaxOutputTokens,
  getResponseProfileInstruction,
};
