const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

const { IPC_CHANNELS } = require("../js/constants");

test("loads a legacy API key when provider keys are absent", async () => {
  const calls = [];
  const elements = new Map();
  let providerKeys = {};
  const ipcRenderer = {
    invoke: async (channel) => {
      calls.push(channel);
      if (channel === IPC_CHANNELS.GET_ALL_API_KEYS) return providerKeys;
      if (channel === IPC_CHANNELS.GET_API_KEY) return "legacy-secret";
      throw new Error(`Unexpected IPC channel: ${channel}`);
    },
  };
  const originalLoad = Module._load;
  const originalDocument = global.document;
  let apiKeyManager;

  try {
    Module._load = function (request, parent, isMain) {
      if (request === "electron") return { ipcRenderer };
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve("../js/api-key-manager")];
    apiKeyManager = require("../js/api-key-manager");
  } finally {
    Module._load = originalLoad;
  }

  global.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: "", textContent: "", className: "" });
      return elements.get(id);
    },
  };

  try {
    await apiKeyManager.loadApiKeys();
    assert.deepEqual(calls, [IPC_CHANNELS.GET_ALL_API_KEYS, IPC_CHANNELS.GET_API_KEY]);
    assert.equal(apiKeyManager.hasValidApiKey("openai"), true);
    assert.equal(apiKeyManager.hasValidApiKey("gemini"), true);
    assert.equal(elements.get("openai-api-key").value, "lega*****cret");

    calls.length = 0;
    providerKeys = { openai: "provider-secret" };
    await apiKeyManager.loadApiKeys();
    assert.deepEqual(calls, [IPC_CHANNELS.GET_ALL_API_KEYS, IPC_CHANNELS.GET_API_KEY]);
    assert.equal(elements.get("openai-api-key").value, "prov*******cret");
    assert.equal(elements.get("gemini-api-key").value, "lega*****cret");

    calls.length = 0;
    providerKeys = { openai: "provider-secret", gemini: "gemini-secret" };
    await apiKeyManager.loadApiKeys();
    assert.deepEqual(calls, [IPC_CHANNELS.GET_ALL_API_KEYS]);
    assert.equal(elements.get("gemini-api-key").value, "gemi*****cret");
  } finally {
    global.document = originalDocument;
    delete require.cache[require.resolve("../js/api-key-manager")];
  }
});
