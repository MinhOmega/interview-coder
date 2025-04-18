let Toastify;
const { IPC_CHANNELS } = require("./constants");

const isMainProcess = process && process.type === "browser";

try {
  Toastify = require("toastify-js");
} catch (error) {
  console.log("Trying alternative ways to load Toastify:", error.message);
  
  if (typeof window !== "undefined" && window.Toastify) {
    console.log("Using Toastify from window object");
    Toastify = window.Toastify;
  } else {
    console.error("Toastify could not be loaded - using fallback implementation");
    
    Toastify = function (options) {
      console.log(`TOAST [${options.className || 'default'}]: ${options.text}`);
      return {
        showToast: function () {
          console.log("Toast would show now (fallback)");
          if (typeof document !== "undefined") {
            console.warn("Toast notification:", options.text);
          }
        },
      };
    };
  }
}

const DEFAULT_CONFIG = {
  duration: 5000,
  gravity: "bottom",
  position: "right",
  stopOnFocus: true,
  className: "toast-notification",
  offset: {
    y: 10,
  },
  close: true,
  oldestFirst: false,
};

const DURATIONS = {
  success: 5000,
  warning: 5000,
  error: 5000,
  info: 5000,
};

const COLORS = {
  success: "linear-gradient(to right, rgba(76, 175, 80, 0.95), rgba(56, 142, 60, 0.95))",
  warning: "linear-gradient(to right, rgba(255, 152, 0, 0.95), rgba(230, 81, 0, 0.95))",
  error: "linear-gradient(to right, rgba(244, 67, 54, 0.95), rgba(198, 40, 40, 0.95))",
  info: "linear-gradient(to right, rgba(33, 150, 243, 0.95), rgba(13, 71, 161, 0.95))",
};

/**
 * Create and display a toast notification
 *
 * @param {Object} options Toast notification options
 * @param {string} options.message The message to display
 * @param {string} options.type Notification type: 'success', 'warning', 'error', 'info'
 * @param {number} options.duration Duration in ms (overrides default for type)
 * @param {Function} options.callback Function to execute on toast click
 * @param {boolean} options.close Show close button (default: true)
 * @returns {Object} The Toastify instance
 */
function showToast({ message, type = "success", duration, callback, close = true }) {
  if (isMainProcess) {
    const { BrowserWindow } = require("electron");
    try {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const mainWindow = windows[0];
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATION, {
            body: message,
            type: type,
            duration: duration || DURATIONS[type],
          });
        } else {
          console.log(`[${type.toUpperCase()}]: ${message} (Window not available)`);
        }
      } else {
        console.log(`[${type.toUpperCase()}]: ${message} (No windows found)`);
      }
    } catch (error) {
      console.error("Error sending toast from main process:", error);
      console.log(`[${type.toUpperCase()}]: ${message}`);
    }
    return null;
  }

  if (typeof document === "undefined") {
    console.log(`[${type.toUpperCase()}]: ${message} (No document available)`);
    return null;
  }

  const config = {
    ...DEFAULT_CONFIG,
    text: message,
    duration: duration || DURATIONS[type] || DEFAULT_CONFIG.duration,
    close,
    style: {
      background: COLORS[type] || COLORS.info,
    },
    onClick: callback || function () {},
  };

  config.className = `toast-notification ${type}`;

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        try {
          const toast = Toastify(config);
          toast.showToast();
        } catch (err) {
          console.error("Failed to show toast after DOM ready:", err);
        }
      });
      return null;
    } else {
      const toast = Toastify(config);
      toast.showToast();
      return toast;
    }
  } catch (error) {
    console.error("Error showing toast notification:", error);
    if (error.stack) console.error("Stack:", error.stack);

    console.log(`[${type.toUpperCase()}]: ${message}`);
    return null;
  }
}

const success = (message, options = {}) => showToast({ message, type: "success", ...options });

const warning = (message, options = {}) => showToast({ message, type: "warning", ...options });

const error = (message, options = {}) => showToast({ message, type: "error", ...options });

const info = (message, options = {}) => showToast({ message, type: "info", ...options });

module.exports = {
  showToast,
  success,
  warning,
  error,
  info,
};
