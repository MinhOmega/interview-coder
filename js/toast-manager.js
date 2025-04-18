/**
 * Toast notification manager using Toastify-js
 */
let Toastify;

// Try to load Toastify from either the module or the global scope
try {
  Toastify = require('toastify-js');
} catch (error) {
  // If require fails, Toastify might be loaded from CDN
  if (typeof window !== 'undefined' && window.Toastify) {
    Toastify = window.Toastify;
  } else {
    console.error('Toastify could not be loaded:', error);
    // Create a dummy function that logs to console instead
    Toastify = function(options) {
      console.log(`TOAST [${options.className}]: ${options.text}`);
      return {
        showToast: function() { 
          console.log('Toast would show now');
        }
      };
    };
  }
}

// Default toast configuration
const DEFAULT_CONFIG = {
  duration: 5000,
  gravity: "bottom", // top or bottom
  position: "right", // left, center or right
  stopOnFocus: true, // Stop timeout when hovering
  className: "toast-notification",
  offset: {
    y: 60 // Offset from the bottom or top edge
  },
  close: true,
  oldestFirst: false
};

// Duration presets by type
const DURATIONS = {
  success: 5000,
  warning: 5000,
  error: 5000,
  info: 5000
};

// Background colors by type
const COLORS = {
  success: "linear-gradient(to right, rgba(76, 175, 80, 0.95), rgba(56, 142, 60, 0.95))",
  warning: "linear-gradient(to right, rgba(255, 152, 0, 0.95), rgba(230, 81, 0, 0.95))",
  error: "linear-gradient(to right, rgba(244, 67, 54, 0.95), rgba(198, 40, 40, 0.95))",
  info: "linear-gradient(to right, rgba(33, 150, 243, 0.95), rgba(13, 71, 161, 0.95))"
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
function showToast({
  message,
  type = 'success',
  duration,
  callback,
  close = true
}) {
  // Configure toast based on type and options
  const config = {
    ...DEFAULT_CONFIG,
    text: message,
    duration: duration || DURATIONS[type] || DEFAULT_CONFIG.duration,
    close,
    style: {
      background: COLORS[type] || COLORS.info
    },
    onClick: callback || function() {}
  };

  // Add CSS class for the notification type
  config.className = `toast-notification ${type}`;
  
  // Create and show toast
  try {
    const toast = Toastify(config);
    toast.showToast();
    return toast;
  } catch (error) {
    console.error("Error showing toast notification:", error, error.stack);
    // Fallback to console if toast fails
    console.log(`[${type.toUpperCase()}]: ${message}`);
    return null;
  }
}

// Helper functions for different toast types
const success = (message, options = {}) => 
  showToast({ message, type: 'success', ...options });

const warning = (message, options = {}) => 
  showToast({ message, type: 'warning', ...options });

const error = (message, options = {}) => 
  showToast({ message, type: 'error', ...options });

const info = (message, options = {}) => 
  showToast({ message, type: 'info', ...options });

module.exports = {
  showToast,
  success,
  warning,
  error,
  info
}; 