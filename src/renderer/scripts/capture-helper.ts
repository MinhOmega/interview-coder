export {};

declare global {
  interface Window {
    api: {
      send: (channel: string, data?: any) => void;
      receive: (channel: string, func: Function) => void;
      invoke: (channel: string, data?: any) => Promise<any>;
    };
  }
}

// DOM elements
const selectionArea = document.getElementById('selection-area') as HTMLElement;
const instructions = document.getElementById('instructions') as HTMLElement;
const captureBtn = document.getElementById('capture-btn') as HTMLElement;
const cancelBtn = document.getElementById('cancel-btn') as HTMLElement;
const notification = document.getElementById('notification') as HTMLElement;

// Selection state
let isSelecting = false;
let startX = 0;
let startY = 0;
let endX = 0;
let endY = 0;

// Show notification
function showNotification(message: string): void {
  notification.textContent = message;
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// Update selection area position and dimensions
function updateSelectionArea(): void {
  // Calculate the rectangle dimensions
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  
  // Calculate the rectangle position (top-left corner)
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  
  // Update the style
  selectionArea.style.display = 'block';
  selectionArea.style.left = `${left}px`;
  selectionArea.style.top = `${top}px`;
  selectionArea.style.width = `${width}px`;
  selectionArea.style.height = `${height}px`;
  
  // Show capture button if selection area is valid
  if (width > 10 && height > 10) {
    const btnY = top + height + 10;
    const btnX = left + width / 2 - 50;
    
    captureBtn.style.display = 'block';
    captureBtn.style.top = `${btnY}px`;
    captureBtn.style.left = `${btnX}px`;
  } else {
    captureBtn.style.display = 'none';
  }
}

// Mouse event handlers
document.addEventListener('mousedown', (e: MouseEvent) => {
  isSelecting = true;
  startX = e.clientX;
  startY = e.clientY;
  
  // Reset end position
  endX = startX;
  endY = startY;
  
  // Hide instructions while selecting
  instructions.style.opacity = '0.3';
  
  // Update selection
  updateSelectionArea();
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (!isSelecting) return;
  
  endX = e.clientX;
  endY = e.clientY;
  
  // Update selection
  updateSelectionArea();
});

document.addEventListener('mouseup', () => {
  if (!isSelecting) return;
  
  isSelecting = false;
  
  // Handle small or invalid selections
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  
  if (width < 10 || height < 10) {
    selectionArea.style.display = 'none';
    instructions.style.opacity = '1';
    return;
  }
  
  // Show instructions for next steps
  instructions.textContent = 'Press Capture or press Cancel (Esc)';
  instructions.style.opacity = '1';
});

// Capture button click handler
captureBtn.addEventListener('click', () => {
  // Only proceed if we have a valid selection area
  if (selectionArea.style.display !== 'block') return;
  
  // Calculate the dimensions
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  
  // Send information about selected area to main process
  window.api.send('area-selected', { 
    x: Math.round(left), 
    y: Math.round(top), 
    width: Math.round(width), 
    height: Math.round(height) 
  });
  
  showNotification('Area captured successfully');
});

// Cancel button and Escape key handler
function cancelCapture(): void {
  selectionArea.style.display = 'none';
  captureBtn.style.display = 'none';
  instructions.textContent = 'Click and drag to select an area for screenshot';
  instructions.style.opacity = '1';
  
  window.api.send('area-selection-cancelled');
}

cancelBtn.addEventListener('click', cancelCapture);

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    cancelCapture();
  }
});

// Notify the main process that the capture helper is ready
window.api.send('area-capture-ready');

// Enable full screen capture
document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Capture full screen on Enter key
  if (e.key === 'Enter') {
    window.api.send('full-screen-captured');
    showNotification('Full screen captured');
  }
}); 