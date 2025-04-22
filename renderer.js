const { ipcRenderer } = require("electron");
const { processMarkdown } = require("./js/markdown-processor");
const { IPC_CHANNELS, AI_PROVIDERS } = require("./js/constants");
const { isMac, isLinux, modifierKey } = require("./js/config");
const toastManager = require("./js/toast-manager");
const hotkeysModal = require("./js/hotkeys-modal");
const log = require("electron-log");

// Variables for tracking state
let isWindowVisible = true;
let streamBuffer = "";

let systemPrompt = "";
let isSystemPromptVisible = false;

// Message history for the chat
let messageHistory = [];
// Make messageHistory available to window for streaming module
window.messageHistory = messageHistory;

let isSplitView = false;
let isChatMode = false;

let streamingMessageElement = null;

// Add a utility function for logging errors
function logError(message, extraData = {}) {
  log.error(`[ERROR] ${message}`, extraData);

  // Display in DevTools console with platform details
  const platformInfo = {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    os: {
      isMac,
      isLinux,
      isWindows,
      platform: process.platform,
    },
  };

  log.error("Error Details:", {
    message,
    timestamp: new Date().toISOString(),
    ...extraData,
    platformInfo,
  });
}

const onUpdateInstruction = (_, instruction) => {
  const banner = document.getElementById("instruction-banner");
  banner.innerHTML = instruction.replace(/\n/g, "<br>");
  banner.style.display = "block";
};

const onHideInstruction = () => {
  const banner = document.getElementById("instruction-banner");
  banner.style.display = "none";
};

const onUpdateVisibility = (_, isVisible) => {
  isWindowVisible = isVisible;
  document.body.classList.toggle("invisible-mode", !isWindowVisible);

  // Disable all UI interactions when invisible
  const clickableElements = document.querySelectorAll("button, a, input, textarea, .toolbar-button");
  clickableElements.forEach((el) => {
    if (!isWindowVisible) {
      el.setAttribute("disabled", "disabled");
      if (el.tagName.toLowerCase() !== "input" && el.tagName.toLowerCase() !== "textarea") {
        el.style.pointerEvents = "none";
      }
    } else {
      el.removeAttribute("disabled");
      el.style.pointerEvents = "";
    }
  });
};

const onNotification = (_, data) => {
  toastManager.showToast({
    message: data.body,
    type: data.type || "success",
    duration: data.duration,
  });
};

const onLoading = (_, isLoading) => {
  try {
    // Get the containers
    const loadingContent = document.getElementById("loading-content");
    const resultContentWrapper = document.getElementById("result-content-wrapper");

    // Update visibility - hide result content while loading
    loadingContent.style.display = isLoading ? "flex" : "none";
    resultContentWrapper.style.display = isLoading ? "none" : "block";

    // If we're showing loading state, prepare a clean container for later use
    if (isLoading) {
      // Clear out any content while hidden
      resultContentWrapper.innerHTML = "";

      // Create fresh content container
      const newContent = document.createElement("div");
      newContent.id = "result-content";
      resultContentWrapper.appendChild(newContent);
    }
  } catch (error) {
    log.error("Error in LOADING handler:", error);
  }
};

const onAnalysisResult = async (_, markdown) => {
  try {
    // Clean up the DOM first
    cleanupResultContent();

    // Process the markdown
    const html = await processMarkdown(markdown);

    // Get the new content element
    const resultContent = document.getElementById("result-content");
    if (resultContent) {
      resultContent.innerHTML = html;
    }

    // Setup code copy buttons
    setupCodeCopyButtons();

    // Scroll to top
    window.scrollTo(0, 0);
  } catch (error) {
    log.error("Error in ANALYSIS_RESULT handler:", error);
    toastManager.error("Error rendering content: " + error.message);
  }
};

const onStreamStart = () => {
  try {
    // Clear the buffer
    streamBuffer = "";

    // Clean up the DOM
    cleanupResultContent();
  } catch (error) {
    log.error("Error in STREAM_START handler:", error);
  }
};

const onStreamChunk = async (_, chunk) => {
  try {
    // Add chunk to buffer
    streamBuffer += chunk;

    // Process the full accumulated text to ensure proper markdown rendering
    const html = await processMarkdown(streamBuffer);

    // Get the content element
    const resultContent = document.getElementById("result-content");
    if (resultContent) {
      resultContent.innerHTML = html;
    }

    // Setup code copy buttons
    setupCodeCopyButtons();

    // Auto-scroll to the bottom if user is already at the bottom
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  } catch (error) {
    log.error("Error processing stream chunk:", error);
    // Display error but continue operation
    document.getElementById(
      "result-content",
    ).innerHTML += `<p class="error-message">Error rendering chunk: ${error.message}</p>`;
  }
};

const onStreamUpdate = async (_, fullText) => {
  try {
    // Update the stream buffer
    streamBuffer = fullText;

    // If the text is empty, don't process it
    if (!fullText || fullText.trim() === "") {
      return;
    }

    // Process the markdown
    const html = await processMarkdown(fullText);

    // Get the content element
    const resultContent = document.getElementById("result-content");
    if (resultContent) {
      resultContent.innerHTML = html;
    }

    // Setup code copy buttons
    setupCodeCopyButtons();

    // Auto-scroll to the bottom if user is already at the bottom
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  } catch (error) {
    log.error("Error processing stream update:", error);
    // Provide better error visualization
    document.getElementById("result-content").innerHTML = `
      <p class="error-message">Error rendering content: ${error.message}</p>
      <pre>${fullText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
    `;
  }
};

const onStreamEnd = () => {
  try {
    // Streaming is complete, reset buffer
    streamBuffer = "";

    // No need to replace content here as we've been replacing it with each update

    // Make sure all code blocks have copy buttons
    setupCodeCopyButtons();

    // Hide instruction banner when streaming is complete
    const banner = document.getElementById("instruction-banner");
    banner.style.display = "none";

    // Add a small scroll to ensure visible buttons if needed
    const resultContent = document.getElementById("result-content");
    if (resultContent && resultContent.scrollHeight > resultContent.clientHeight) {
      resultContent.scrollBy({ top: 1, behavior: "smooth" });
    }
  } catch (error) {
    log.error("Error in STREAM_END handler:", error);
  }
};

const onScreenSharingDetected = () => {
  isWindowVisible = false;
  document.body.classList.add("invisible-mode");
  toastManager.warning("Screen sharing detected - window hidden. Press " + modifierKey + "+B to show.");
};

const onScrollContent = (_, scrollAmount) => {
  if (isSplitView) {
    // If in split view, scroll the chat messages container
    const messagesContainer = document.getElementById("split-messages-container");
    if (messagesContainer) {
      messagesContainer.scrollBy({
        top: scrollAmount,
        behavior: "smooth",
      });
      return;
    }
  }
  const resultContentWrapper = document.getElementById("result-content-wrapper");
  if (resultContentWrapper) {
    resultContentWrapper.scrollBy({
      top: scrollAmount,
      behavior: "smooth",
    });
  }
};

// Toggle split view functionality
function toggleSplitView(event) {
  if (isChatMode) return;

  let newState;
  if (event && event.forceState !== undefined) {
    newState = event.forceState;
    if (isSplitView === newState) return;
  } else {
    newState = !isSplitView;
  }

  isSplitView = newState;

  const standardView = document.getElementById("standard-view");
  const splitView = document.getElementById("split-view");

  // Hide instruction banner when toggling split view
  const instructionBanner = document.getElementById("instruction-banner");
  if (instructionBanner) {
    instructionBanner.style.display = "none";
  }

  if (isSplitView) {
    // Show split view
    standardView.style.display = "none";
    splitView.style.display = "flex";

    // Clone content from main view to left pane if needed
    const leftContent = document.getElementById("left-result-content");
    const mainContent = document.getElementById("result-content");
    if (leftContent && mainContent && leftContent.innerHTML === "") {
      leftContent.innerHTML = mainContent.innerHTML;
    }

    // Setup resize handle
    setupResizeHandle();

    // Reset message history when toggling to split view
    if (event && event.forceState) {
      resetChat();
    }

    // Focus split chat input
    document.getElementById("split-chat-input").focus();
  } else {
    // Show standard view
    standardView.style.display = "block";
    splitView.style.display = "none";
  }

  // Notify about toggle
  toastManager.success("Split view " + (isSplitView ? "enabled" : "disabled"));
}

// Add a function to clean up the DOM properly
function cleanupResultContent() {
  try {
    if (isSplitView) {
      resetChat();
      return;
    }
    // Get the wrapper
    const wrapper = document.getElementById("result-content-wrapper");
    if (!wrapper) return;

    // Remove all children completely
    while (wrapper.firstChild) {
      wrapper.removeChild(wrapper.firstChild);
    }

    // Create a fresh content element
    const newContent = document.createElement("div");
    newContent.id = "result-content";
    wrapper.appendChild(newContent);

    // Force a repaint
    wrapper.offsetHeight;
  } catch (error) {
    log.error("Error in cleanupResultContent:", error);
  }
}

const onChatMessageResponse = async (_, response) => {
  // Hide typing indicator before showing the AI message
  const typingIndicator = document.getElementById("split-typing-indicator");
  typingIndicator.classList.remove("visible");

  // Add AI message to UI using the markdown processor
  await addAIMessage(response.content);

  // Add to message history
  messageHistory.push(response);

  // Scroll to bottom
  scrollToBottom(document.getElementById("split-messages-container"));
};

// Function to send message
function sendMessage(inputElement) {
  const message = inputElement.value.trim();
  if (!message) return;

  // Add user message to UI
  addMessage(message, "user");

  // Add to message history
  messageHistory.push({ role: "user", content: message });

  // Clear input and reset height
  inputElement.value = "";
  inputElement.style.height = "auto";

  // Scroll to bottom
  const messagesContainer = document.getElementById("split-messages-container");
  scrollToBottom(messagesContainer);

  // Create message array with system prompt if available
  const messageArray = [...messageHistory];
  if (systemPrompt) {
    messageArray.unshift({ role: "system", content: systemPrompt });
  }

  // Send to main process with system prompt information
  ipcRenderer.send(IPC_CHANNELS.SEND_CHAT_MESSAGE, messageArray, systemPrompt);
}

// Add a user message to the UI
async function addMessage(text, sender) {
  const messagesContainer = document.getElementById("split-messages-container");

  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", sender === "user" ? "user-message" : "ai-message");

  // Process markdown for both user and AI messages
  try {
    const html = await processMarkdown(text);
    messageDiv.innerHTML = html;

    // Setup code copy buttons if needed
    setupCodeCopyButtons(messageDiv);
  } catch (error) {
    log.error("Error processing markdown:", error);
    // Fallback to basic formatting if markdown processing fails
    const formattedText = text.replace(/\n/g, "<br>");
    messageDiv.innerHTML = formattedText;
  }

  messagesContainer.appendChild(messageDiv);

  // If this is a user message, show the typing indicator right after it
  if (sender === "user") {
    // Ensure the typing indicator is in the correct position
    const typingIndicator = document.getElementById("split-typing-indicator");
    messagesContainer.appendChild(typingIndicator);
    typingIndicator.classList.add("visible");
  }

  scrollToBottom(messagesContainer);
}

// Add an AI message with proper markdown processing
async function addAIMessage(text) {
  const messagesContainer = document.getElementById("split-messages-container");

  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", "ai-message");

  // Use the advanced markdown processor
  try {
    const html = await processMarkdown(text);
    messageDiv.innerHTML = html;

    // Setup code copy buttons if needed
    setupCodeCopyButtons(messageDiv);
  } catch (error) {
    log.error("Error processing markdown:", error);
    messageDiv.textContent = text;
  }

  messagesContainer.appendChild(messageDiv);
  scrollToBottom(messagesContainer);
}

// Scroll to the bottom of the messages container
function scrollToBottom(container) {
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// Toggle system prompt visibility
function toggleSystemPrompt() {
  const systemPromptContainer = document.getElementById("system-prompt-container");
  const systemPromptTextarea = document.getElementById("system-prompt-textarea");
  const chatInput = document.getElementById("split-chat-input");

  isSystemPromptVisible = !isSystemPromptVisible;

  if (isSystemPromptVisible) {
    // Show system prompt
    systemPromptContainer.style.display = "flex";
    systemPromptTextarea.value = systemPrompt || "";
    systemPromptTextarea.focus();

    // Hide input container temporarily
    chatInput.parentElement.style.display = "none";
  } else {
    // Hide system prompt
    systemPromptContainer.style.display = "none";

    // Show input container
    chatInput.parentElement.style.display = "flex";
    chatInput.focus();
  }
}

// Update system prompt
function updateSystemPrompt() {
  const systemPromptTextarea = document.getElementById("system-prompt-textarea");
  systemPrompt = systemPromptTextarea.value.trim();

  // Save the prompt
  saveSystemPrompt(systemPrompt);

  // Hide system prompt UI
  toggleSystemPrompt();
}

// Cancel system prompt update
function cancelSystemPrompt() {
  // Hide system prompt UI without saving
  toggleSystemPrompt();
}

// Clear system prompt
function clearSystemPrompt() {
  const systemPromptTextarea = document.getElementById("system-prompt-textarea");
  systemPromptTextarea.value = "";
  systemPromptTextarea.focus();

  // Show notification
  toastManager.warning("System prompt cleared");
}

// Save system prompt to file via IPC
function saveSystemPrompt(prompt) {
  try {
    ipcRenderer.send(IPC_CHANNELS.UPDATE_SYSTEM_PROMPT, prompt);
  } catch (error) {
    log.error("Error saving system prompt:", error);
    toastManager.error("Failed to save system prompt");
  }
}

// Load system prompt from file via IPC
async function loadSystemPrompt() {
  try {
    const savedPrompt = await ipcRenderer.invoke(IPC_CHANNELS.GET_SYSTEM_PROMPT);
    if (savedPrompt) {
      systemPrompt = savedPrompt;
      toastManager.success("System prompt loaded");
    }
  } catch (error) {
    log.error("Error loading system prompt:", error);
  }
}

// Update the model badge with current settings
async function updateModelBadge() {
  try {
    let settings;

    try {
      settings = await ipcRenderer.invoke(IPC_CHANNELS.GET_CURRENT_SETTINGS);
    } catch (error) {
      log.error("Error getting model settings from main process:", error);
      // Set default badge text to indicate error
      const badge = document.getElementById("model-badge");
      badge.textContent = `Press ${modifierKey}+, to set model`;
      return;
    }

    const badge = document.getElementById("model-badge");

    let providerName = "";
    switch (settings.aiProvider) {
      case AI_PROVIDERS.OPENAI:
        providerName = "OpenAI";
        break;
      case AI_PROVIDERS.OLLAMA:
        providerName = "Ollama";
        break;
      case AI_PROVIDERS.GEMINI:
        providerName = "Gemini";
        break;
    }

    const modelName = settings.currentModel;
    badge.textContent =
      providerName && modelName ? `${providerName}: ${modelName}` : `Please press ${modifierKey}+, to change model.`;
  } catch (error) {
    log.error("Error updating model badge:", error);
    // Ensure badge always shows something useful even on complete failure
    const badge = document.getElementById("model-badge");
    badge.textContent = "AI: Default Model";
  }
}

// Add copy code functionality
function setupCodeCopyButtons(container = document) {
  try {
    // Find all copy buttons
    const copyButtons = container.querySelectorAll(".copy-code-button");

    if (copyButtons.length === 0) {
      // No code blocks found yet
      return;
    }

    copyButtons.forEach((button) => {
      // Skip if the button already has a listener (check for data attribute)
      if (button.getAttribute("data-has-listener") === "true") {
        return;
      }

      // Add the click event listener
      button.addEventListener("click", function () {
        try {
          // Find the code element within the container
          const pre = this.nextElementSibling;
          if (!pre || !pre.tagName || pre.tagName.toLowerCase() !== "pre") {
            log.error("No pre element found");
            return;
          }

          // Get the text content directly from pre element to ensure we get all content
          let codeText = pre.textContent || "";

          // Make sure we have a string
          if (typeof codeText !== "string") {
            codeText = String(codeText);
          }

          // Copy the code to clipboard
          navigator.clipboard
            .writeText(codeText)
            .then(() => {
              // Visual feedback
              this.textContent = "Copied!";
              this.classList.add("copied");

              // Reset after a short delay
              setTimeout(() => {
                this.textContent = "Copy";
                this.classList.remove("copied");
              }, 2000);
            })
            .catch((err) => {
              log.error("Failed to copy code: ", err);
              this.textContent = "Error";

              setTimeout(() => {
                this.textContent = "Copy";
              }, 2000);
            });
        } catch (err) {
          log.error("Error in copy button handler:", err);
          // Try to recover
          this.textContent = "Error";
          setTimeout(() => {
            this.textContent = "Copy";
          }, 2000);
        }
      });

      // Mark the button as having a listener
      button.setAttribute("data-has-listener", "true");
    });
  } catch (err) {
    log.error("Error setting up copy buttons:", err);
  }
}

// Export to window for chat streaming
window.setupCodeCopyButtons = setupCodeCopyButtons;

// Setup resize handle for split view
function setupResizeHandle() {
  const handle = document.getElementById("resize-handle");
  const container = document.getElementById("split-view");
  const leftPane = document.querySelector(".split-pane.left");
  let isResizing = false;

  handle.addEventListener("mousedown", (e) => {
    isResizing = true;
    handle.classList.add("active");
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    const containerWidth = container.clientWidth;
    const newX = e.clientX;
    const containerRect = container.getBoundingClientRect();
    const newRatio = (newX - containerRect.left) / containerWidth;

    // Limit the resize ratio
    if (newRatio < 0.2 || newRatio > 0.8) return;

    splitViewRatio = newRatio;
    leftPane.style.flex = `0 0 ${newRatio * 100}%`;
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      handle.classList.remove("active");
      document.body.style.cursor = "";
    }
  });
}

const onEventContextMenu = () => {
  ipcRenderer.send(IPC_CHANNELS.SHOW_CONTEXT_MENU);
};

const onEventKeyDown = (e) => {
  try {
    // Unified DevTools hotkey that works on all platforms
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "d") {
      log.info("DevTools hotkey pressed");
      ipcRenderer.send(IPC_CHANNELS.TOGGLE_DEVTOOLS);
      e.preventDefault();
      return;
    }

    // Original DevTools hotkey (Cmd/Ctrl+Shift+I)
    if ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && e.key === "I") {
      log.info("DevTools alternative hotkey pressed");
      ipcRenderer.send(IPC_CHANNELS.TOGGLE_DEVTOOLS);
      e.preventDefault();
      return;
    }

    // Add development-only keyboard shortcut for manual reload (Cmd/Ctrl+Shift+R)
    if ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && e.key === "R") {
      log.info("Reload hotkey pressed");
      ipcRenderer.send(IPC_CHANNELS.DEV_RELOAD);

      e.preventDefault();
      return;
    }

    // Linux-specific fallback for toggling visibility
    if (isLinux) {
      // Handle both Ctrl+B and Alt+B as fallbacks for Linux
      const isCtrlB = e.ctrlKey && e.key.toLowerCase() === "b";
      const isAltB = e.altKey && e.key.toLowerCase() === "b";

      if (isCtrlB || isAltB) {
        log.info("Linux visibility toggle hotkey pressed");
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "T") {
      log.info("Split view toggle hotkey pressed");
      e.preventDefault();
      toggleSplitView();
      return;
    }

    if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "p") {
      log.info("System prompt toggle hotkey pressed");
      e.preventDefault();
      toggleSystemPrompt();
      return;
    }
  } catch (error) {
    log.error("Error handling keyboard shortcut:", error);
    logError(`Keyboard shortcut error: ${error.message}`, {
      key: e.key,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
      shift: e.shiftKey,
      platform: navigator.platform,
    });
  }
};

const onEventMessage = (event) => {
  if (event.data && event.data.type === "model-settings-updated") {
    // Simply refresh the model badge from current settings
    updateModelBadge();
  }
};

// Reset chat function
function resetChat() {
  try {
    // Clear message history
    messageHistory = [];
    window.messageHistory = messageHistory;

    // Clear UI - get the messages container and remove all messages
    const messagesContainer = document.getElementById("split-messages-container");

    // Remove all message elements but keep the typing indicator
    const typingIndicator = document.getElementById("split-typing-indicator");

    // Store the typing indicator to reattach later
    if (typingIndicator) {
      typingIndicator.remove();
    }

    // Clear all messages
    messagesContainer.innerHTML = "";

    // Add back typing indicator
    if (typingIndicator) {
      messagesContainer.appendChild(typingIndicator);
    }

    // Add initial AI greeting message
    const initialMessage = document.createElement("div");
    initialMessage.classList.add("message", "ai-message");
    initialMessage.textContent = "Hello! How can I help you today?";
    messagesContainer.appendChild(initialMessage);

    // Clear stream-related variables
    streamBuffer = "";
    streamingMessageElement = null;

    // Hide typing indicator if it's visible
    if (typingIndicator) {
      typingIndicator.classList.remove("visible");
    }

    // Notify the main process to clear the conversation for this window
    ipcRenderer.send(IPC_CHANNELS.CLEAR_CONVERSATION);

    // Show notification
    toastManager.success("Chat has been reset");
  } catch (error) {
    log.error("Error resetting chat:", error);
    toastManager.error("Failed to reset chat: " + error.message);
  }
}

const onEventDOMContentLoaded = async () => {
  const splitSendBtn = document.getElementById("split-send-btn");
  const splitChatInput = document.getElementById("split-chat-input");
  const toggleSystemPromptBtn = document.getElementById("toggle-system-prompt-btn");

  // Send message for split view chat interface
  if (splitSendBtn && splitChatInput) {
    splitSendBtn.addEventListener("click", () => sendMessage(splitChatInput));

    // Auto-resize textarea as user types
    splitChatInput.addEventListener("input", () => {
      splitChatInput.style.height = "auto";
      splitChatInput.style.height = splitChatInput.scrollHeight + "px";
    });

    // Send message on Command+Enter or Ctrl+Enter or just Enter
    splitChatInput.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        sendMessage(splitChatInput);
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(splitChatInput);
      }
    });
  }

  // System prompt button functionality
  const updateSystemPromptBtn = document.getElementById("update-system-prompt");
  const cancelSystemPromptBtn = document.getElementById("cancel-system-prompt");
  const clearSystemPromptBtn = document.getElementById("clear-system-prompt");

  if (updateSystemPromptBtn) {
    updateSystemPromptBtn.addEventListener("click", updateSystemPrompt);
  }

  if (cancelSystemPromptBtn) {
    cancelSystemPromptBtn.addEventListener("click", cancelSystemPrompt);
  }

  if (clearSystemPromptBtn) {
    clearSystemPromptBtn.addEventListener("click", clearSystemPrompt);
  }

  // Load saved system prompt if available
  await loadSystemPrompt();

  // Add event listener for inline toggle system prompt button
  if (toggleSystemPromptBtn) {
    toggleSystemPromptBtn.addEventListener("click", toggleSystemPrompt);
  }

  // Initialize the hotkeys modal
  hotkeysModal.initHotkeysModal();
};

// Handle the start of a chat message stream
const onChatMessageStreamStart = () => {
  try {
    log.info("Chat stream started");

    // Show typing indicator
    const typingIndicator = document.getElementById("split-typing-indicator");
    if (typingIndicator) {
      typingIndicator.classList.add("visible");
    }

    // Create a streaming message element
    const messagesContainer = document.getElementById("split-messages-container");
    if (!messagesContainer) return;

    // Check if there's already a streaming message element
    if (!streamingMessageElement) {
      streamingMessageElement = document.createElement("div");
      streamingMessageElement.classList.add("message", "ai-message", "streaming-message");
      streamingMessageElement.id = "streaming-message";
      messagesContainer.appendChild(streamingMessageElement);
    }

    // Clear the stream buffer but keep the element
    streamBuffer = "";

    // Scroll to bottom to show typing
    scrollToBottom(messagesContainer);
  } catch (error) {
    log.error("Error in chat stream start handler:", error);
  }
};

// Handle a chunk of the chat message stream
const onChatMessageStreamChunk = async (_, chunk, fullText) => {
  try {
    // Create the streaming message element if it doesn't exist
    if (!streamingMessageElement) {
      const messagesContainer = document.getElementById("split-messages-container");
      if (!messagesContainer) return;

      streamingMessageElement = document.createElement("div");
      streamingMessageElement.classList.add("message", "ai-message", "streaming-message");
      streamingMessageElement.id = "streaming-message";
      messagesContainer.appendChild(streamingMessageElement);

      // Hide typing indicator since we're now showing actual content
      const typingIndicator = document.getElementById("split-typing-indicator");
      if (typingIndicator) {
        typingIndicator.classList.remove("visible");
      }
    }

    // Update the buffer with the new content
    if (fullText && fullText.length > 0) {
      // If fullText is provided, use it (complete replacement)
      streamBuffer = fullText;
    } else if (chunk) {
      // Otherwise append the chunk
      streamBuffer += chunk;
    }

    // Ensure we have content to display
    if (!streamBuffer || streamBuffer.trim() === "") {
      return;
    }

    // Render the markdown
    try {
      const html = await processMarkdown(streamBuffer);
      if (streamingMessageElement) {
        streamingMessageElement.innerHTML = html;

        // Setup code copy buttons
        setupCodeCopyButtons(streamingMessageElement);
      }
    } catch (markdownError) {
      log.error("Error processing markdown:", markdownError);
      // Fallback to plain text if markdown processing fails
      if (streamingMessageElement) {
        streamingMessageElement.textContent = streamBuffer;
      }
    }

    // Auto-scroll if user is at the bottom
    const messagesContainer = document.getElementById("split-messages-container");
    if (
      messagesContainer &&
      messagesContainer.scrollTop + messagesContainer.clientHeight >= messagesContainer.scrollHeight - 50
    ) {
      scrollToBottom(messagesContainer);
    }
  } catch (error) {
    log.error("Error processing chat stream chunk:", error);
  }
};

// Handle the end of a chat message stream
const onChatMessageStreamEnd = async (_, response) => {
  try {
    log.info("Chat stream ended with response:", response);

    // Hide typing indicator if it's still visible
    const typingIndicator = document.getElementById("split-typing-indicator");
    if (typingIndicator) {
      typingIndicator.classList.remove("visible");
    }

    // Get content from response or use the accumulated buffer if response is empty
    const content = response && response.content ? response.content : streamBuffer;

    // Make sure we have some content to display
    if (!content || content.trim() === "") {
      log.warn("No content to display at stream end");
      return;
    }

    // Update the streaming message with finalized content
    if (streamingMessageElement) {
      try {
        const html = await processMarkdown(content);
        streamingMessageElement.innerHTML = html;
        streamingMessageElement.classList.remove("streaming-message");
        streamingMessageElement.removeAttribute("id");

        // Setup code copy buttons one final time
        setupCodeCopyButtons(streamingMessageElement);
      } catch (markdownError) {
        log.error("Error processing final markdown:", markdownError);
        // Fallback to plain text
        streamingMessageElement.textContent = content;
      }

      // Add to message history - create response object if not provided
      const messageToAdd = response || { role: "assistant", content: content };
      messageHistory.push(messageToAdd);

      // Reset stream variables but AFTER we've used them
      const finishedElement = streamingMessageElement;
      streamingMessageElement = null;
      streamBuffer = "";

      // Scroll to bottom one final time
      const messagesContainer = document.getElementById("split-messages-container");
      if (messagesContainer) {
        scrollToBottom(messagesContainer);
      }
    } else {
      log.warn("No streaming message element found at stream end");

      // As a fallback, create a new message if we don't have an element
      if (content) {
        await addAIMessage(content);

        // Add to message history
        const messageToAdd = response || { role: "assistant", content: content };
        messageHistory.push(messageToAdd);
      }
    }
  } catch (error) {
    log.error("Error finalizing chat stream:", error);

    // Try to recover by adding the content as a regular message
    if (streamBuffer) {
      await addAIMessage(streamBuffer);
      messageHistory.push({ role: "assistant", content: streamBuffer });
    }
  }
};

// Set up IPC event listeners
ipcRenderer.on(IPC_CHANNELS.UPDATE_INSTRUCTION, onUpdateInstruction);
ipcRenderer.on(IPC_CHANNELS.HIDE_INSTRUCTION, onHideInstruction);
ipcRenderer.on(IPC_CHANNELS.UPDATE_VISIBILITY, onUpdateVisibility);
ipcRenderer.on(IPC_CHANNELS.NOTIFICATION, onNotification);
ipcRenderer.on(IPC_CHANNELS.LOADING, onLoading);
ipcRenderer.on(IPC_CHANNELS.ANALYSIS_RESULT, onAnalysisResult);
ipcRenderer.on(IPC_CHANNELS.STREAM_START, onStreamStart);
ipcRenderer.on(IPC_CHANNELS.STREAM_CHUNK, onStreamChunk);
ipcRenderer.on(IPC_CHANNELS.STREAM_UPDATE, onStreamUpdate);
ipcRenderer.on(IPC_CHANNELS.STREAM_END, onStreamEnd);
ipcRenderer.on(IPC_CHANNELS.CLEAR_RESULT, cleanupResultContent);
ipcRenderer.on(IPC_CHANNELS.MODEL_CHANGED, updateModelBadge);
ipcRenderer.on(IPC_CHANNELS.SCREEN_SHARING_DETECTED, onScreenSharingDetected);
ipcRenderer.on(IPC_CHANNELS.SCROLL_CONTENT, onScrollContent);
ipcRenderer.on(IPC_CHANNELS.TOGGLE_SPLIT_VIEW, (_, data) => toggleSplitView(data));
ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_RESPONSE, onChatMessageResponse);
ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_STREAM_START, onChatMessageStreamStart);
ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_STREAM_CHUNK, onChatMessageStreamChunk);
ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_STREAM_END, onChatMessageStreamEnd);

document.addEventListener("DOMContentLoaded", onEventDOMContentLoaded);
document.addEventListener("contextmenu", onEventContextMenu);
document.addEventListener("keydown", onEventKeyDown);
window.addEventListener("message", onEventMessage);
document.querySelectorAll(".shortcut").forEach((el) => {
  const text = el.textContent;
  el.textContent = text.replace("⌘", isMac ? "⌘" : "Ctrl");
});

updateModelBadge();
