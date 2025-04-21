const { ipcRenderer } = require("electron");
const { IPC_CHANNELS } = require("./constants");
const log = require("electron-log");

// Handle displaying hotkey information
function showHotkeysModal(hotkeys) {
  // Create modal container
  const existingModal = document.getElementById("hotkeys-modal");
  if (existingModal) {
    document.body.removeChild(existingModal);
  }

  const modal = document.createElement("div");
  modal.id = "hotkeys-modal";
  modal.className = "modal";

  // Create modal content
  const modalContent = document.createElement("div");
  modalContent.className = "modal-content";

  // Create header
  const header = document.createElement("div");
  header.className = "modal-header";

  const title = document.createElement("h2");
  title.textContent = "Keyboard Shortcuts";

  const closeBtn = document.createElement("span");
  closeBtn.className = "close-btn";
  closeBtn.innerHTML = "&times;";
  closeBtn.onclick = () => {
    document.body.removeChild(modal);
  };

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Create body
  const body = document.createElement("div");
  body.className = "modal-body";

  // Create table for hotkeys
  const table = document.createElement("table");
  table.className = "hotkeys-table";

  // Add headers
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const keyHeader = document.createElement("th");
  keyHeader.textContent = "Shortcut";
  const descHeader = document.createElement("th");
  descHeader.textContent = "Description";

  headerRow.appendChild(keyHeader);
  headerRow.appendChild(descHeader);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Add hotkey rows
  const tbody = document.createElement("tbody");

  hotkeys.forEach((hotkey) => {
    const row = document.createElement("tr");

    const keyCell = document.createElement("td");
    keyCell.className = "key-cell";
    keyCell.textContent = hotkey.key;

    const descCell = document.createElement("td");
    descCell.textContent = hotkey.description;

    row.appendChild(keyCell);
    row.appendChild(descCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  body.appendChild(table);

  // Create footer
  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const closeButtonFooter = document.createElement("button");
  closeButtonFooter.textContent = "Close";
  closeButtonFooter.className = "modal-button";
  closeButtonFooter.onclick = () => {
    document.body.removeChild(modal);
  };

  footer.appendChild(closeButtonFooter);

  // Assemble modal
  modalContent.appendChild(header);
  modalContent.appendChild(body);
  modalContent.appendChild(footer);
  modal.appendChild(modalContent);

  // Add modal to body
  document.body.appendChild(modal);

  // Close modal when clicking outside
  window.onclick = (event) => {
    if (event.target === modal) {
      document.body.removeChild(modal);
    }
  };

  // Close modal with Escape key
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById("hotkeys-modal")) {
      document.body.removeChild(modal);
    }
  });
}

// Initialize hotkey modal functionality
function initHotkeysModal() {
  // Add event listener for showing hotkeys
  ipcRenderer.on(IPC_CHANNELS.SHOW_HOTKEYS_INFO, (_, hotkeys) => {
    showHotkeysModal(hotkeys);
  });

  log.info("Hotkeys modal initialized");
}

module.exports = {
  initHotkeysModal,
  showHotkeysModal
}; 