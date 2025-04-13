const { ipcRenderer } = require("electron");
const unified = require("unified").unified;
const remarkGfm = require("remark-gfm").default;
const remarkParse = require("remark-parse").default;
const remarkStringify = require("remark-stringify").default;
const remarkRehype = require("remark-rehype").default;
const rehypeRaw = require("rehype-raw").default;
const rehypeStringify = require("rehype-stringify").default;
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(remarkStringify);
const { IPC_CHANNELS, AI_PROVIDERS } = require("./js/constants");

const isMac = navigator.platform.includes("Mac");
const modifierKey = isMac ? "Command" : "Ctrl";

let isWindowVisible = true;

ipcRenderer.on(IPC_CHANNELS.UPDATE_INSTRUCTION, (_, instruction) => {
  const banner = document.getElementById("instruction-banner");
  banner.innerHTML = instruction.replace(/\n/g, "<br>");
  banner.style.display = "block";
});

// Initialize context menu for element inspection
document.addEventListener("contextmenu", (e) => {
  ipcRenderer.send(IPC_CHANNELS.SHOW_CONTEXT_MENU);
});

// Register keyboard shortcut for DevTools (Cmd/Ctrl+Shift+I)
document.addEventListener("keydown", (e) => {
  if ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && e.key === "I") {
    ipcRenderer.send(IPC_CHANNELS.TOGGLE_DEVTOOLS);
    e.preventDefault();
  }

  // Add development-only keyboard shortcut for manual reload (Cmd/Ctrl+Shift+R)
  if ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && e.key === "R") {
    ipcRenderer.send(IPC_CHANNELS.DEV_RELOAD);
    e.preventDefault();
  }
});

ipcRenderer.on(IPC_CHANNELS.HIDE_INSTRUCTION, () => {
  const banner = document.getElementById("instruction-banner");
  banner.style.display = "none";
});

ipcRenderer.on(IPC_CHANNELS.UPDATE_VISIBILITY, (_, isVisible) => {
  isWindowVisible = isVisible;
  document.body.classList.toggle("invisible-mode", !isWindowVisible);
});

ipcRenderer.on(IPC_CHANNELS.NOTIFICATION, (_, data) => {
  showNotification(data.body, data.type || "success");
});

ipcRenderer.on(IPC_CHANNELS.WARNING, (_, message) => {
  showNotification(message, "warning");
});

ipcRenderer.on(IPC_CHANNELS.ERROR, (_, message) => {
  showNotification(message, "error");
});

ipcRenderer.on(IPC_CHANNELS.LOADING, (_, isLoading) => {
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
});

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

ipcRenderer.on(IPC_CHANNELS.ANALYSIS_RESULT, async (_, markdown) => {
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
    showNotification("Error rendering content: " + error.message, "error");
  }
});

// Setup for streaming results
ipcRenderer.on(IPC_CHANNELS.STREAM_START, () => {
  try {
    // Clear the buffer
    streamBuffer = "";

    // Clean up the DOM
    cleanupResultContent();
  } catch (error) {
    console.error("Error in STREAM_START handler:", error);
  }
});

// Track current markdown accumulation state for improved streaming
let streamBuffer = "";

ipcRenderer.on(IPC_CHANNELS.STREAM_CHUNK, async (_, chunk) => {
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
});

ipcRenderer.on(IPC_CHANNELS.STREAM_UPDATE, async (_, fullText) => {
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
});

ipcRenderer.on(IPC_CHANNELS.STREAM_END, () => {
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
});

ipcRenderer.on(IPC_CHANNELS.CLEAR_RESULT, () => {
  try {
    // Clean up the DOM completely
    cleanupResultContent();
  } catch (error) {
    console.error("Error in CLEAR_RESULT handler:", error);
  }
});

// Update AI provider/model badge display
ipcRenderer.on(IPC_CHANNELS.MODEL_CHANGED, () => {
  updateModelBadge();
});

// Handle screen sharing detection
ipcRenderer.on(IPC_CHANNELS.SCREEN_SHARING_DETECTED, () => {
  // Make the window nearly invisible
  isWindowVisible = false;
  document.body.classList.add("invisible-mode");

  // Show temporary notification
  showNotification("Screen sharing detected - window hidden. Press " + modifierKey + "+B to show.", "warning");
});

// Handle content scrolling from keyboard shortcuts
ipcRenderer.on(IPC_CHANNELS.SCROLL_CONTENT, (_, scrollAmount) => {
  const resultContentWrapper = document.getElementById("result-content-wrapper");
  if (resultContentWrapper) {
    resultContentWrapper.scrollBy({
      top: scrollAmount,
      behavior: "smooth",
    });
  }
});

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
        // Try using the unified processor first
        // Create a custom processor for each run to avoid state issues
        const customProcessor = unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkRehype, { allowDangerousHtml: true })
          .use(rehypeRaw)
          .use(rehypeStringify);

        const file = await customProcessor.process(markdown);
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

// Show notification
function showNotification(message, type = "success") {
  const container = document.getElementById("notification-container");
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.className = `notification ${type}`;

  container.appendChild(notification);

  const notifications = container.getElementsByClassName("notification");
  const offset = (notifications.length - 1) * 10; // Stack effect

  notification.style.transform = `translateX(50px) translateY(-${offset}px)`;

  void notification.offsetWidth;
  notification.classList.add("visible");
  notification.style.transform = `translateX(0) translateY(-${offset}px)`;

  setTimeout(() => {
    notification.classList.remove("visible");
    notification.style.transform = `translateX(50px) translateY(-${offset}px)`;

    setTimeout(() => {
      notification.remove();
      Array.from(notifications).forEach((n, i) => {
        n.style.transform = `translateX(0) translateY(-${i * 10}px)`;
      });
    }, 300);
  }, 3500);
}

// Initialize
updateModelBadge();

// Listen for postMessage from model-selector window
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "model-settings-updated") {
    // Simply refresh the model badge from current settings
    updateModelBadge();
  }
});

// Update shortcut labels based on platform
document.querySelectorAll(".shortcut").forEach((el) => {
  const text = el.textContent;
  el.textContent = text.replace("⌘", isMac ? "⌘" : "Ctrl");
});
