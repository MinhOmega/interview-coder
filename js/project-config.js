const fs = require("fs");
const path = require("path");
const {
  validateResponseProfile,
  validateCustomMaxOutputTokens,
} = require("./response-profiles");

const CONFIG_FILENAME = "interview-coder.config.json";
const SUPPORTED_PROVIDERS = new Set(["AI", "openai", "gemini", "ollama", "azure-foundry"]);
const SUPPORTED_LANGUAGES = new Set(["en", "vi", "es", "fr", "de", "ja", "ko", "zh", "ru"]);

class ProjectConfigError extends Error {
  constructor(message, filePath) {
    super(`${message} (${filePath})`);
    this.name = "ProjectConfigError";
    this.filePath = filePath;
  }
}

function getProjectConfigPath(projectRoot = process.cwd()) {
  return path.join(projectRoot, CONFIG_FILENAME);
}

function getConfigPath(isPackaged, userDataPath, workingDirectory) {
  if (!isPackaged) return getProjectConfigPath(workingDirectory);
  if (!userDataPath || !path.isAbsolute(userDataPath)) {
    throw new ProjectConfigError("Unable to locate user data directory", CONFIG_FILENAME);
  }
  return getProjectConfigPath(userDataPath);
}

function assertString(config, field, filePath) {
  if (config[field] !== undefined && typeof config[field] !== "string") {
    throw new ProjectConfigError(`Field "${field}" must be a string`, filePath);
  }
}

function validateProjectConfig(config, filePath = CONFIG_FILENAME) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new ProjectConfigError("Configuration root must be a JSON object", filePath);
  }

  ["aiProvider", "currentModel", "responseLanguage", "responseProfile", "ollamaUrl", "azureEndpoint"].forEach((field) => {
    assertString(config, field, filePath);
  });

  if (config.aiProvider && !SUPPORTED_PROVIDERS.has(config.aiProvider)) {
    throw new ProjectConfigError(`Unsupported AI provider "${config.aiProvider}"`, filePath);
  }

  if (config.responseLanguage && !SUPPORTED_LANGUAGES.has(config.responseLanguage)) {
    throw new ProjectConfigError(`Unsupported response language "${config.responseLanguage}"`, filePath);
  }

  try {
    if (config.responseProfile !== undefined) validateResponseProfile(config.responseProfile);
    if (config.customMaxOutputTokens !== undefined) {
      validateCustomMaxOutputTokens(config.customMaxOutputTokens);
    }
  } catch (error) {
    throw new ProjectConfigError(error.message, filePath);
  }

  if (config.apiKeys !== undefined) {
    if (!config.apiKeys || typeof config.apiKeys !== "object" || Array.isArray(config.apiKeys)) {
      throw new ProjectConfigError('Field "apiKeys" must be an object', filePath);
    }

    for (const [provider, apiKey] of Object.entries(config.apiKeys)) {
      if (typeof apiKey !== "string") {
        throw new ProjectConfigError(`API key for "${provider}" must be a string`, filePath);
      }
    }
  }

  const cloudProviders = new Set(["openai", "gemini", "azure-foundry"]);
  if (cloudProviders.has(config.aiProvider) && !config.currentModel) {
    throw new ProjectConfigError(`Provider "${config.aiProvider}" requires a currentModel`, filePath);
  }

  return config;
}

function readProjectConfig(filePath) {
  if (!fs.existsSync(filePath)) return null;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new ProjectConfigError(`Unable to parse JSON: ${error.message}`, filePath);
  }

  return validateProjectConfig(parsed, filePath);
}

function mergeConfigs(...configs) {
  return configs.filter(Boolean).reduce((merged, config) => {
    const next = { ...merged, ...config };
    next.apiKeys = { ...(merged.apiKeys || {}), ...(config.apiKeys || {}) };
    return next;
  }, {});
}

function writeProjectConfigAtomic(filePath, config) {
  validateProjectConfig(config, filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    if (process.platform !== "win32") fs.chmodSync(temporaryPath, 0o600);
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    } catch (_) {
      // Preserve the original write error.
    }
    throw new ProjectConfigError(`Unable to save configuration: ${error.message}`, filePath);
  }

  return config;
}

module.exports = {
  CONFIG_FILENAME,
  ProjectConfigError,
  SUPPORTED_LANGUAGES,
  SUPPORTED_PROVIDERS,
  getConfigPath,
  getProjectConfigPath,
  mergeConfigs,
  readProjectConfig,
  validateProjectConfig,
  writeProjectConfigAtomic,
};
