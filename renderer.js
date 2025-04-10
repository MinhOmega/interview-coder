const { ipcRenderer } = require("electron");
const unified = require("unified").unified;
const remarkGfm = require("remark-gfm").default;
const remarkParse = require("remark-parse").default;
const remarkStringify = require("remark-stringify").default;
const remarkRehype = require("remark-rehype").default;
const processor = unified().use(remarkParse).use(remarkRehype).use(remarkStringify).use(remarkGfm);
const { IPC_CHANNELS } = require("./js/constants");

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
  document.getElementById("loading-content").style.display = isLoading ? "flex" : "none";
  document.getElementById("result-content").style.display = isLoading ? "none" : "block";
});

ipcRenderer.on(IPC_CHANNELS.ANALYSIS_RESULT, async (_, markdown) => {
  const html = await processMarkdown(markdown);
  document.getElementById("result-content").innerHTML = html;

  // Setup code copy buttons after content is added
  setupCodeCopyButtons();

  // Scroll to top
  window.scrollTo(0, 0);
});

// Setup for streaming results
ipcRenderer.on(IPC_CHANNELS.STREAM_START, () => {
  document.getElementById("result-content").innerHTML = "";
});

// Track current markdown accumulation state for improved streaming
let streamBuffer = "";

ipcRenderer.on(IPC_CHANNELS.STREAM_CHUNK, async (_, chunk) => {
  try {
    // Add chunk to buffer
    streamBuffer += chunk;

    // Process the full accumulated text to ensure proper markdown rendering
    const html = await processMarkdown(streamBuffer);
    document.getElementById("result-content").innerHTML = html;

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
  // Replace the content with the full updated text (better for Gemini streaming)
  try {
    // Update the stream buffer
    streamBuffer = fullText;

    // If the text is empty, don't process it
    if (!fullText || fullText.trim() === "") {
      return;
    }

    const html = await processMarkdown(fullText);
    document.getElementById("result-content").innerHTML = html;

    // Setup code copy buttons after content is updated
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
  // Streaming is complete, reset buffer
  streamBuffer = "";

  // Make sure all code blocks have copy buttons
  setupCodeCopyButtons();

  // Hide instruction banner when streaming is complete
  const banner = document.getElementById("instruction-banner");
  banner.style.display = "none";

  // Add a small scroll to ensure visible buttons if needed
  const resultContent = document.getElementById("result-content");
  if (resultContent.scrollHeight > resultContent.clientHeight) {
    resultContent.scrollBy({ top: 1, behavior: "smooth" });
  }
});

ipcRenderer.on(IPC_CHANNELS.CLEAR_RESULT, () => {
  document.getElementById("result-content").innerHTML = "";
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

// Update the model badge with current settings
async function updateModelBadge() {
  try {
    let settings;

    try {
      settings = await ipcRenderer.invoke(IPC_CHANNELS.GET_CURRENT_SETTINGS);
    } catch (error) {
      console.error("Error getting model settings from main process:", error);

      // Try to get settings from localStorage as fallback
      try {
        const savedSettings = localStorage.getItem("model-settings");
        if (savedSettings) {
          settings = JSON.parse(savedSettings);
        } else {
          // Fallback to default settings
          settings = {
            aiProvider: "openai",
            currentModel: "gpt-4o-mini",
          };
        }
      } catch (localStorageErr) {
        console.error("Error retrieving from localStorage:", localStorageErr);
        // Fallback to default settings
        settings = {
          aiProvider: "openai",
          currentModel: "gpt-4o-mini",
        };
      }
    }

    const badge = document.getElementById("model-badge");

    let providerName = "";
    switch (settings.aiProvider) {
      case "openai":
        providerName = "OpenAI";
        break;
      case "ollama":
        providerName = "Ollama";
        break;
      case "gemini":
        providerName = "Gemini";
        break;
      default:
        providerName = settings.aiProvider || "AI";
    }

    const modelName = settings.currentModel || "Default Model";
    badge.textContent = `${providerName}: ${modelName}`;

    // Save current settings to localStorage for persistence
    try {
      localStorage.setItem("model-settings", JSON.stringify(settings));
    } catch (err) {
      console.error("Error saving settings to localStorage:", err);
    }
  } catch (error) {
    console.error("Error updating model badge:", error);
    // Ensure badge always shows something useful even on complete failure
    const badge = document.getElementById("model-badge");
    badge.textContent = "AI: Default Model";
  }
}

function markdownProcess(markdown) {
  return (
    markdown
      // Escape HTML
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
      })
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
      .replace(/\n\n/g, "</p><p>")
  );
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
      } catch (err) {
        html = markdownProcess(markdown);
      }
    } else {
      html = markdownProcess(markdown);
    }
    // Add copy buttons to code blocks and language tags
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;

    // Find all pre > code elements and wrap them with copy button and language tag
    wrapper.querySelectorAll("pre > code").forEach((codeBlock) => {
      const pre = codeBlock.parentNode;
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
  } catch (err) {}
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

  // Get all existing notifications
  const notifications = container.getElementsByClassName("notification");
  const offset = (notifications.length - 1) * 10; // Stack effect

  // Position the new notification
  notification.style.transform = `translateX(50px) translateY(-${offset}px)`;

  // Determine display duration based on notification type and message length
  let duration = 3500; // Default
  if (type === "error") {
    duration = 7000; // Errors show longer
  } else if (type === "info") {
    duration = 5000; // Info shows medium length
  } else if (message.length > 100) {
    duration = 6000; // Longer messages show longer
  }

  // Trigger reflow to ensure animation works
  void notification.offsetWidth;
  notification.classList.add("visible");
  notification.style.transform = `translateX(0) translateY(-${offset}px)`;

  // Add a subtle indicator for longer notifications
  if (duration > 3500) {
    const indicator = document.createElement("div");
    indicator.className = "notification-timer";
    notification.appendChild(indicator);
    
    // Animate the indicator to show how long the notification will stay
    indicator.style.animation = `notification-timer ${duration/1000}s linear`;
  }

  // Log to console for debugging
  console.log(`Notification (${type}): ${message}`);

  // Hide after duration
  setTimeout(() => {
    notification.classList.remove("visible");
    notification.style.transform = `translateX(50px) translateY(-${offset}px)`;

    // Remove from DOM after animation completes
    setTimeout(() => {
      notification.remove();
      // Reposition remaining notifications
      Array.from(notifications).forEach((n, i) => {
        if (n !== notification) { // Skip the one we're removing
          n.style.transform = `translateX(0) translateY(-${i * 10}px)`;
        }
      });
    }, 300);
  }, duration);
}

// Initialize
updateModelBadge();

// Listen for postMessage from model-selector window
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "model-settings-updated") {
    updateModelBadge();
  }
});

// Update shortcut labels based on platform
document.querySelectorAll(".shortcut").forEach((el) => {
  const text = el.textContent;
  el.textContent = text.replace("⌘", isMac ? "⌘" : "Ctrl");
});
