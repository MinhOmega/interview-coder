const { ipcRenderer } = require("electron");
const log = require("electron-log");
const { IPC_CHANNELS } = require("./constants");
const toastify = require("toastify-js");

let updateStatus = {
  available: false,
  downloaded: false,
  info: null,
  progress: 0
};

// Initialize UI elements for update status
const createUpdateUI = () => {
  // Create update notification badge
  const updateBadge = document.createElement("div");
  updateBadge.id = "update-badge";
  updateBadge.classList.add("update-badge", "hidden");
  updateBadge.innerHTML = `
    <div class="update-badge-inner">
      <span class="update-badge-icon">⟳</span>
      <span class="update-badge-text">Update</span>
    </div>
  `;
  document.body.appendChild(updateBadge);

  // Create update modal
  const updateModal = document.createElement("div");
  updateModal.id = "update-modal";
  updateModal.classList.add("update-modal", "hidden");
  updateModal.innerHTML = `
    <div class="update-modal-content">
      <div class="update-modal-header">
        <h2>Application Update</h2>
        <button class="close-btn" id="update-modal-close">×</button>
      </div>
      <div class="update-modal-body">
        <div id="update-status-message">Checking for updates...</div>
        <div id="update-progress-container" class="hidden">
          <div id="update-progress-bar">
            <div id="update-progress-fill" style="width: 0%"></div>
          </div>
          <div id="update-progress-text">0%</div>
        </div>
      </div>
      <div class="update-modal-footer">
        <button id="update-check-btn">Check for Updates</button>
        <button id="update-download-btn" class="hidden">Download</button>
        <button id="update-install-btn" class="hidden">Install & Restart</button>
        <button id="update-dismiss-btn">Dismiss</button>
      </div>
    </div>
  `;
  document.body.appendChild(updateModal);

  // Add styles for the update UI
  const style = document.createElement("style");
  style.textContent = `
    .update-badge {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #4a90e2;
      color: white;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      z-index: 9999;
      transition: all 0.3s ease;
    }
    .update-badge:hover {
      transform: scale(1.1);
    }
    .update-badge-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .update-badge-icon {
      font-size: 18px;
      animation: spin 2s linear infinite;
    }
    .update-badge-text {
      font-size: 8px;
      margin-top: -2px;
    }
    .update-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }
    .update-modal-content {
      background-color: #fff;
      border-radius: 8px;
      width: 400px;
      max-width: 90%;
      color: #333;
    }
    .update-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      border-bottom: 1px solid #eee;
    }
    .update-modal-header h2 {
      margin: 0;
      font-size: 18px;
    }
    .close-btn {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #999;
    }
    .update-modal-body {
      padding: 20px;
    }
    .update-modal-footer {
      padding: 15px 20px;
      border-top: 1px solid #eee;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .update-modal button {
      padding: 8px 16px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
    }
    #update-check-btn, #update-download-btn, #update-install-btn {
      background-color: #4a90e2;
      color: white;
    }
    #update-dismiss-btn {
      background-color: #f1f1f1;
      color: #333;
    }
    .error-recovery-btn {
      margin-top: 10px;
      padding: 6px 12px;
      background-color: #f0ad4e;
      color: white;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 14px;
    }
    .error-recovery-btn:hover {
      background-color: #ec971f;
    }
    #update-progress-container {
      margin-top: 15px;
    }
    #update-progress-bar {
      height: 10px;
      background-color: #eee;
      border-radius: 5px;
      overflow: hidden;
      margin-bottom: 5px;
    }
    #update-progress-fill {
      height: 100%;
      background-color: #4a90e2;
      width: 0%;
      transition: width 0.3s ease;
    }
    #update-progress-text {
      text-align: right;
      font-size: 12px;
      color: #666;
    }
    .hidden {
      display: none !important;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  // Initialize event listeners
  setupEventListeners();
};

// Setup event listeners for UI elements
const setupEventListeners = () => {
  // Badge click to show modal
  const updateBadge = document.getElementById("update-badge");
  updateBadge.addEventListener("click", () => {
    showUpdateModal();
  });

  // Close button
  const closeBtn = document.getElementById("update-modal-close");
  closeBtn.addEventListener("click", () => {
    hideUpdateModal();
  });

  // Dismiss button
  const dismissBtn = document.getElementById("update-dismiss-btn");
  dismissBtn.addEventListener("click", () => {
    hideUpdateModal();
  });

  // Check for updates button
  const checkBtn = document.getElementById("update-check-btn");
  checkBtn.addEventListener("click", () => {
    checkForUpdates();
  });

  // Download button
  const downloadBtn = document.getElementById("update-download-btn");
  downloadBtn.addEventListener("click", () => {
    downloadUpdate();
  });

  // Install button
  const installBtn = document.getElementById("update-install-btn");
  installBtn.addEventListener("click", () => {
    installUpdate();
  });

  // Register IPC listeners for update status changes
  ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, (_, data) => {
    updateUpdateStatus(data);
  });
};

// Show the update modal
const showUpdateModal = () => {
  const modal = document.getElementById("update-modal");
  modal.classList.remove("hidden");
};

// Hide the update modal
const hideUpdateModal = () => {
  const modal = document.getElementById("update-modal");
  modal.classList.add("hidden");
};

// Check for updates
const checkForUpdates = async () => {
  try {
    updateStatusMessage("Checking for updates...");
    const result = await ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES);
    if (!result.success) {
      throw new Error(result.error || "Failed to check for updates");
    }
  } catch (error) {
    log.error("Error checking for updates:", error);
    updateStatusMessage(`Error checking for updates: ${error.message}`);
    showToast("Error checking for updates", "error");
  }
};

// Download update
const downloadUpdate = async () => {
  try {
    // Check if we have a manual update (with download URL)
    if (updateStatus.info && updateStatus.info.downloadUrl) {
      // For manual updates, open the browser to the release page
      const { shell } = require('electron');
      shell.openExternal(updateStatus.info.downloadUrl);
      updateStatusMessage("Download page opened in your browser");
      return;
    }
    
    // Normal auto-update flow
    updateStatusMessage("Starting download...");
    const result = await ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_UPDATE);
    if (!result.success) {
      throw new Error(result.error || result.reason || "Failed to download update");
    }
    if (result.alreadyDownloaded) {
      updateStatusMessage("Update already downloaded and ready to install");
    }
    if (result.manual) {
      updateStatusMessage("Manual download required - browser opened");
    }
  } catch (error) {
    log.error("Error downloading update:", error);
    updateStatusMessage(`Error downloading update: ${error.message}`);
    showToast("Error downloading update", "error");
  }
};

// Install update
const installUpdate = async () => {
  try {
    updateStatusMessage("Installing update and restarting...");
    const result = await ipcRenderer.invoke(IPC_CHANNELS.INSTALL_UPDATE);
    if (!result.success) {
      throw new Error(result.error || result.reason || "Failed to install update");
    }
  } catch (error) {
    log.error("Error installing update:", error);
    updateStatusMessage(`Error installing update: ${error.message}`);
    showToast("Error installing update", "error");
  }
};

// Update the status message in the modal
const updateStatusMessage = (message) => {
  const statusElement = document.getElementById("update-status-message");
  if (statusElement) {
    statusElement.textContent = message;
  }
};

// Update progress bar
const updateProgressBar = (percent) => {
  const progressFill = document.getElementById("update-progress-fill");
  const progressText = document.getElementById("update-progress-text");
  const progressContainer = document.getElementById("update-progress-container");
  
  if (progressContainer) {
    progressContainer.classList.remove("hidden");
  }
  
  if (progressFill && progressText) {
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${percent.toFixed(1)}%`;
  }
};

// Show/hide buttons based on update status
const updateButtons = () => {
  const checkBtn = document.getElementById("update-check-btn");
  const downloadBtn = document.getElementById("update-download-btn");
  const installBtn = document.getElementById("update-install-btn");
  
  if (updateStatus.downloaded) {
    checkBtn.classList.add("hidden");
    downloadBtn.classList.add("hidden");
    installBtn.classList.remove("hidden");
  } else if (updateStatus.available) {
    checkBtn.classList.add("hidden");
    downloadBtn.classList.remove("hidden");
    installBtn.classList.add("hidden");
  } else {
    checkBtn.classList.remove("hidden");
    downloadBtn.classList.add("hidden");
    installBtn.classList.add("hidden");
  }
};

// Show/hide update badge
const updateBadgeVisibility = () => {
  const badge = document.getElementById("update-badge");
  if (updateStatus.available || updateStatus.downloaded) {
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
};

// Update UI based on status event from main process
const updateUpdateStatus = (data) => {
  const { status, message, progress, info } = data;
  
  switch (status) {
    case "checking":
      updateStatusMessage(message);
      break;
    
    case "available":
      updateStatus.available = true;
      updateStatus.info = info;
      updateStatusMessage(message);
      updateButtons();
      updateBadgeVisibility();
      showToast("Update available!", "info");
      break;
    
    case "available-manual":
      updateStatus.available = true;
      updateStatus.info = info;
      updateStatusMessage(message);
      
      // For manual updates, update UI differently
      const downloadBtn = document.getElementById("update-download-btn");
      const checkBtn = document.getElementById("update-check-btn");
      
      if (downloadBtn && checkBtn) {
        downloadBtn.textContent = "Open Download Page";
        downloadBtn.classList.remove("hidden");
        checkBtn.classList.add("hidden");
      }
      
      updateBadgeVisibility();
      showToast("Update available! Manual download required.", "info");
      break;
    
    case "not-available":
      updateStatus.available = false;
      updateStatusMessage(message);
      updateButtons();
      updateBadgeVisibility();
      showToast("Your app is up to date", "success");
      break;
    
    case "downloading":
      updateStatusMessage(message);
      if (progress && progress.percent) {
        updateProgressBar(progress.percent);
      }
      break;
    
    case "downloaded":
      updateStatus.downloaded = true;
      updateStatus.available = true;
      updateStatus.info = info;
      updateStatusMessage(message);
      updateButtons();
      updateBadgeVisibility();
      showToast("Update ready to install!", "success");
      showUpdateModal();
      break;
    
    case "error":
      updateStatusMessage(message);
      showToast(message, "error");
      
      // Add a "Try Manual Check" button when there's an error
      const errorBtn = document.createElement("button");
      errorBtn.textContent = "Try Manual Check";
      errorBtn.className = "error-recovery-btn";
      errorBtn.onclick = checkForUpdatesManual;
      
      const statusElement = document.getElementById("update-status-message");
      if (statusElement && !document.querySelector(".error-recovery-btn")) {
        statusElement.appendChild(document.createElement("br"));
        statusElement.appendChild(document.createElement("br"));
        statusElement.appendChild(errorBtn);
      }
      break;
  }
};

// Show toast notification
const showToast = (message, type = "info") => {
  const bgColor = {
    info: "#4a90e2",
    success: "#5cb85c",
    warning: "#f0ad4e",
    error: "#d9534f"
  };
  
  toastify({
    text: message,
    duration: 3000,
    close: true,
    gravity: "bottom",
    position: "right",
    backgroundColor: bgColor[type],
    stopOnFocus: true
  }).showToast();
};

// Check current update status on page load
const checkCurrentUpdateStatus = async () => {
  try {
    const status = await ipcRenderer.invoke(IPC_CHANNELS.GET_UPDATE_STATUS);
    if (status.updateDownloaded || status.updateAvailable) {
      updateStatus.downloaded = status.updateDownloaded;
      updateStatus.available = status.updateAvailable;
      updateStatus.info = status.currentUpdateInfo;
      updateButtons();
      updateBadgeVisibility();
    }
  } catch (error) {
    log.error("Error getting current update status:", error);
  }
};

// Check for updates manually via GitHub API
const checkForUpdatesManual = async () => {
  try {
    updateStatusMessage("Checking for updates via GitHub...");
    const result = await ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES_MANUAL);
    if (!result.success) {
      throw new Error(result.error || "Failed to check for updates manually");
    }
  } catch (error) {
    log.error("Error checking for updates manually:", error);
    updateStatusMessage(`Error checking for updates: ${error.message}`);
    showToast("Error checking for updates", "error");
  }
};

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  createUpdateUI();
  checkCurrentUpdateStatus();
});

module.exports = {
  createUpdateUI,
  checkForUpdates,
  checkForUpdatesManual
}; 