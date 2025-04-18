const { ipcRenderer } = require("electron");
const unified = require("unified").unified;
const remarkGfm = require("remark-gfm").default;
const remarkParse = require("remark-parse").default;
const remarkRehype = require("remark-rehype").default;
const rehypeRaw = require("rehype-raw").default;
const rehypeStringify = require("rehype-stringify").default;
const { IPC_CHANNELS, AI_PROVIDERS } = require("./js/constants");
const { isMac, isLinux, modifierKey } = require("./js/config");
const toastManager = require("./js/toast-manager");

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify);

let isWindowVisible = true;
let streamBuffer = "";

let systemPrompt = "";
let isSystemPromptVisible = false;

let messageHistory = [];
let isSplitView = false;
let isChatMode = false;

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
    console.error("Error in LOADING handler:", error);
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
    console.error("Error in ANALYSIS_RESULT handler:", error);
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
    console.error("Error in STREAM_START handler:", error);
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
    console.error("Error processing stream chunk:", error);
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
    console.error("Error processing stream update:", error);
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
    console.error("Error in STREAM_END handler:", error);
  }
};

const onScreenSharingDetected = () => {
  isWindowVisible = false;
  document.body.classList.add("invisible-mode");
  toastManager.warning("Screen sharing detected - window hidden. Press " + modifierKey + "+B to show.");
};

const onScrollContent = (_, scrollAmount) => {
  const resultContentWrapper = document.getElementById("result-content-wrapper");
  if (resultContentWrapper) {
    resultContentWrapper.scrollBy({
      top: scrollAmount,
      behavior: "smooth",
    });
  }
};

// Toggle split view functionality
function toggleSplitView() {
  if (isChatMode) return; // Don't allow toggling split view in chat-only mode

  isSplitView = !isSplitView;

  const standardView = document.getElementById("standard-view");
  const splitView = document.getElementById("split-view");

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
    console.error("Error in cleanupResultContent:", error);
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
    console.error("Error processing markdown:", error);
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
    console.error("Error processing markdown:", error);
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
    console.error("Error saving system prompt:", error);
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
    console.error("Error loading system prompt:", error);
  }
}

// Update the model badge with current settings
async function updateModelBadge() {
  try {
    let settings;

    try {
      settings = await ipcRenderer.invoke(IPC_CHANNELS.GET_CURRENT_SETTINGS);
    } catch (error) {
      console.error("Error getting model settings from main process:", error);
      // Set default badge text to indicate error
      const badge = document.getElementById("model-badge");
      badge.textContent = `Press ${modifierKey}+M to set model`;
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
      providerName && modelName ? `${providerName}: ${modelName}` : `Please press ${modifierKey}+M to change model.`;
  } catch (error) {
    console.error("Error updating model badge:", error);
    // Ensure badge always shows something useful even on complete failure
    const badge = document.getElementById("model-badge");
    badge.textContent = "AI: Default Model";
  }
}

function markdownProcess(markdown) {
  // First safely handle HTML elements while preserving HTML tags like <sup>
  const safeMarkdown = markdown
    // Code blocks with language - escape HTML inside code blocks
    .replace(/```(\w+)\n([\s\S]*?)```/g, (_, lang, code) => {
      return "```" + lang + "\n" + code.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "\n```";
    })
    // Code blocks without language - escape HTML inside code blocks
    .replace(/```\n([\s\S]*?)```/g, (_, code) => {
      return "```\n" + code.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "\n```";
    })
    // Inline code blocks - escape HTML within them
    .replace(/`([^`]+)`/g, (_, code) => {
      return "`" + code.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "`";
    });

  // Create a temp div to handle HTML strings safely
  const tempDiv = document.createElement("div");

  // Process the markdown with HTML preserved
  let processedContent = safeMarkdown
    // Code blocks with language
    .replace(/```(\w+)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    })
    // Code blocks without language
    .replace(/```\n([\s\S]*?)```/g, (_, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    })
    // Inline code blocks
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Headers
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Lists
    .replace(/^\* (.+)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)\n/g, "<ul>$1</ul>")
    // Links
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    // Paragraphs
    .replace(/\n\n/g, "</p><p>");

  tempDiv.innerHTML = processedContent;

  // Fix any broken HTML structure
  if (!processedContent.startsWith("<p>")) {
    processedContent = "<p>" + processedContent;
  }
  if (!processedContent.endsWith("</p>")) {
    processedContent = processedContent + "</p>";
  }

  return processedContent;
}

async function processMarkdown(markdown) {
  try {
    // Check if we have any content to process
    if (!markdown || markdown.trim() === "") {
      return "";
    }

    let html = "";
    if (processor) {
      try {
        const file = await processor.process(markdown);
        html = String(file);

        // Ensure inline code blocks are properly styled
        const tempWrapper = document.createElement("div");
        tempWrapper.innerHTML = html;

        // Add class to inline code elements if not already present
        tempWrapper.querySelectorAll("code:not([class])").forEach((codeEl) => {
          // Skip if inside a pre element (block code)
          if (codeEl.parentElement.tagName !== "PRE") {
            codeEl.classList.add("inline-code");
          }
        });

        html = tempWrapper.innerHTML;
      } catch (err) {
        console.error("Error using unified processor:", err);
        // Fall back to our custom markdown processor
        html = markdownProcess(markdown);
      }
    } else {
      // Use our custom markdown processor if unified isn't available
      html = markdownProcess(markdown);
    }

    // Add copy buttons to code blocks and language tags
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;

    // Find all pre > code elements and wrap them with copy button and language tag
    wrapper.querySelectorAll("pre > code").forEach((codeBlock) => {
      const pre = codeBlock.parentNode;

      // Skip if already processed
      if (pre.parentNode && pre.parentNode.classList.contains("code-block-container")) {
        return;
      }

      const container = document.createElement("div");
      container.className = "code-block-container";

      // Create copy button
      const copyButton = document.createElement("button");
      copyButton.className = "copy-code-button";
      copyButton.textContent = "Copy";

      // Extract language from class
      let language = "";
      if (codeBlock.className) {
        const langMatch = codeBlock.className.match(/language-(\w+)/);
        if (langMatch && langMatch[1]) {
          language = langMatch[1];

          // Create language tag
          const langTag = document.createElement("div");
          langTag.className = "code-language-tag";
          langTag.textContent = language;
          container.appendChild(langTag);
        }
      }

      // Move the pre element into the container
      pre.parentNode.insertBefore(container, pre);
      container.appendChild(copyButton);
      container.appendChild(pre);
    });

    return wrapper.innerHTML;
  } catch (err) {
    console.error("Error in markdown processing:", err);
    return `<p class="error-message">Error processing markdown: ${err.message}</p>`;
  }
}

// Add copy code functionality
function setupCodeCopyButtons() {
  try {
    // Find all copy buttons
    const copyButtons = document.querySelectorAll(".copy-code-button");

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
            console.error("No pre element found");
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
              console.error("Failed to copy code: ", err);
              this.textContent = "Error";

              setTimeout(() => {
                this.textContent = "Copy";
              }, 2000);
            });
        } catch (err) {
          console.error("Error in copy button handler:", err);
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
    console.error("Error setting up code copy buttons:", err);
  }
}

// Update the model badge with current settings
async function updateModelBadge() {
  try {
    let settings;

    try {
      settings = await ipcRenderer.invoke(IPC_CHANNELS.GET_CURRENT_SETTINGS);
    } catch (error) {
      console.error("Error getting model settings from main process:", error);
      // Set default badge text to indicate error
      const badge = document.getElementById("model-badge");
      badge.textContent = `Press ${modifierKey}+M to set model`;
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
      providerName && modelName ? `${providerName}: ${modelName}` : `Please press ${modifierKey}+M to change model.`;
  } catch (error) {
    console.error("Error updating model badge:", error);
    // Ensure badge always shows something useful even on complete failure
    const badge = document.getElementById("model-badge");
    badge.textContent = "AI: Default Model";
  }
}

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
  if ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && e.key === "I") {
    ipcRenderer.send(IPC_CHANNELS.TOGGLE_DEVTOOLS);
    e.preventDefault();
  }

  // Add development-only keyboard shortcut for manual reload (Cmd/Ctrl+Shift+R)
  if ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && e.key === "R") {
    ipcRenderer.send(IPC_CHANNELS.DEV_RELOAD);
    e.preventDefault();
  }

  // Linux-specific fallback for toggling visibility
  if (isLinux) {
    // Handle both Ctrl+B and Alt+B as fallbacks for Linux
    const isCtrlB = e.ctrlKey && e.key.toLowerCase() === "b";
    const isAltB = e.altKey && e.key.toLowerCase() === "b";

    if (isCtrlB || isAltB) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "T") {
    e.preventDefault();
    toggleSplitView();
  }
  if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "p") {
    e.preventDefault();
    toggleSystemPrompt();
  }
};

const onEventMessage = (event) => {
  if (event.data && event.data.type === "model-settings-updated") {
    // Simply refresh the model badge from current settings
    updateModelBadge();
  }
};

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
  const systemPromptBtn = document.getElementById("btn-system-prompt");
  const updateSystemPromptBtn = document.getElementById("update-system-prompt");
  const cancelSystemPromptBtn = document.getElementById("cancel-system-prompt");
  const clearSystemPromptBtn = document.getElementById("clear-system-prompt");

  if (systemPromptBtn) {
    systemPromptBtn.addEventListener("click", toggleSystemPrompt);
  }

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
};

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
ipcRenderer.on(IPC_CHANNELS.TOGGLE_SPLIT_VIEW, toggleSplitView);
ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_RESPONSE, onChatMessageResponse);

document.addEventListener("contextmenu", onEventContextMenu);

document.addEventListener("keydown", onEventKeyDown);

window.addEventListener("message", onEventMessage);
document.querySelectorAll(".shortcut").forEach((el) => {
  const text = el.textContent;
  el.textContent = text.replace("⌘", isMac ? "⌘" : "Ctrl");
});
document.addEventListener("DOMContentLoaded", onEventDOMContentLoaded);

updateModelBadge();
