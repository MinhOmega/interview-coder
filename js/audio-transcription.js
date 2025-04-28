const { ipcMain, BrowserWindow } = require('electron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const log = require('electron-log');
const { IPC_CHANNELS, AI_PROVIDERS } = require('./constants');
const configManager = require('./config-manager');
const toastManager = require('./toast-manager');

let isTranscribing = false;
let geminiAI = null;
let audioChunksBuffer = [];
const CHUNK_PROCESSING_INTERVAL = 2000; // Process audio chunks every 2 seconds (more frequent for real-time)
let processingInterval = null;
let currentMimeType = 'audio/webm';
let lastTranscriptionText = '';

/**
 * Initializes the audio transcription module
 * @param {Object} aiProviders - The AI providers module
 */
function initialize(aiProviders) {
  geminiAI = aiProviders.getGeminiAI();
  
  if (!geminiAI) {
    log.warn('Gemini AI client not initialized. Audio transcription may not work properly.');
  }
  
  setupEventHandlers();
}

/**
 * Sets up IPC event handlers for audio transcription
 */
function setupEventHandlers() {
  // Handle start transcription request from renderer
  ipcMain.on(IPC_CHANNELS.START_AUDIO_TRANSCRIPTION, (event, mimeType) => {
    const sender = event.sender;
    currentMimeType = mimeType || 'audio/webm';
    log.info(`Starting audio transcription with format: ${currentMimeType}`);
    startTranscription(sender);
  });
  
  // Handle stop transcription request from renderer
  ipcMain.on(IPC_CHANNELS.STOP_AUDIO_TRANSCRIPTION, () => {
    stopTranscription();
  });
  
  // Handle audio data from renderer
  ipcMain.on(IPC_CHANNELS.AUDIO_DATA, async (event, data) => {
    if (!isTranscribing) return;
    
    try {
      // Handle data in new format (object with buffer and mimeType)
      if (data && typeof data === 'object' && data.buffer) {
        audioChunksBuffer.push({
          buffer: data.buffer,
          mimeType: data.mimeType || currentMimeType
        });
      } else if (data && typeof data === 'object' && data.hasData) {
        // This is a ping with no data - we'll just note that audio is being captured
        log.info('Audio ping received');
      } else {
        // Legacy format support
        audioChunksBuffer.push({
          buffer: data,
          mimeType: currentMimeType
        });
      }
    } catch (error) {
      log.error('Error storing audio chunk:', error);
    }
  });
}

/**
 * Starts the audio transcription process
 * @param {WebContents} sender - The sender of the event
 */
function startTranscription(sender) {
  if (isTranscribing) {
    log.info('Transcription already in progress');
    return;
  }
  
  log.info('Starting audio transcription');
  
  // Get current AI settings
  const settings = configManager.getCurrentSettings();
  
  // We'll specifically use Gemini AI for transcription
  if (!geminiAI && settings.aiProvider === AI_PROVIDERS.GEMINI) {
    const apiKey = configManager.getApiKey();
    if (apiKey) {
      try {
        geminiAI = new GoogleGenerativeAI(apiKey);
        log.info('Gemini AI client initialized for transcription');
      } catch (error) {
        log.error('Failed to initialize Gemini AI client:', error);
        toastManager.error('Failed to start transcription: API client not initialized');
        return;
      }
    } else {
      log.error('No API key available for Gemini');
      toastManager.error('Failed to start transcription: No API key available');
      return;
    }
  } else if (!geminiAI) {
    // Try to initialize with the current API key regardless of provider
    const apiKey = configManager.getApiKey();
    if (apiKey) {
      try {
        geminiAI = new GoogleGenerativeAI(apiKey);
        log.info('Gemini AI client initialized for transcription using current API key');
      } catch (error) {
        log.error('Failed to initialize Gemini AI client:', error);
        toastManager.error('Failed to start transcription: API client not initialized');
        return;
      }
    } else {
      log.error('No API key available');
      toastManager.error('Failed to start transcription: No API key available');
      return;
    }
  }
  
  // Clear the audio chunks buffer
  audioChunksBuffer = [];
  lastTranscriptionText = '';
  
  isTranscribing = true;
  
  // Set up interval for processing audio chunks
  processingInterval = setInterval(() => {
    if (audioChunksBuffer.length > 0 && sender) {
      processAudioChunks(audioChunksBuffer, sender);
      audioChunksBuffer = []; // Clear the buffer after processing
    }
  }, CHUNK_PROCESSING_INTERVAL);
  
  // Notify renderer that transcription has started
  sender.send(IPC_CHANNELS.TRANSCRIPTION_STARTED);
  toastManager.info('Audio transcription started');
}

/**
 * Stops the audio transcription process
 */
function stopTranscription() {
  if (!isTranscribing) {
    return;
  }
  
  log.info('Stopping audio transcription');
  isTranscribing = false;
  
  // Clear the processing interval
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
  
  // Process any remaining audio chunks
  const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents);
  if (mainWindow && audioChunksBuffer.length > 0) {
    processAudioChunks(audioChunksBuffer, mainWindow.webContents);
    audioChunksBuffer = []; // Clear the buffer
  }
  
  // Notify all windows that transcription has stopped
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.TRANSCRIPTION_STOPPED);
    }
  });
  
  toastManager.info('Audio transcription stopped');
}

/**
 * Process audio chunks for transcription
 * @param {Array<Object>} audioChunks - Array of audio chunks
 * @param {WebContents} sender - The sender WebContents to send results to
 */
async function processAudioChunks(audioChunks, sender) {
  if (!isTranscribing || audioChunks.length === 0) return;
  
  try {
    // Get current settings to use the same model as configured in settings
    const settings = configManager.getCurrentSettings();
    
    // Use a model that supports audio transcription (Gemini 1.5)
    const transcriptionModel = "gemini-1.5-flash"; // This model supports audio input
    
    log.info(`Processing ${audioChunks.length} audio chunks using model: ${transcriptionModel}`);
    
    if (geminiAI) {
      try {
        // Use the specified transcription model
        const model = geminiAI.getGenerativeModel({ model: transcriptionModel });
        
        // Simple prompt for direct audio transcription
        const prompt = "Transcribe this audio accurately. Continue from previous context if any.";
        
        // Extract buffers and combine them
        const buffers = audioChunks
          .filter(chunk => chunk.buffer)
          .map(chunk => chunk.buffer);
        
        if (buffers.length === 0) {
          log.info('No audio data to process');
          return;
        }
        
        const combinedBuffer = Buffer.concat(buffers);
        const base64Audio = combinedBuffer.toString('base64');
        
        // Determine the most common MIME type
        const mimeType = audioChunks[0]?.mimeType || currentMimeType;
        
        // Send request to Gemini API
        const result = await model.generateContent({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Audio
                }
              }
            ]
          }]
        });
        
        const transcription = result.response.text().trim();
        
        if (transcription && transcription !== "") {
          // Only send the new part of the transcription to avoid repetition
          if (lastTranscriptionText && transcription.startsWith(lastTranscriptionText)) {
            const newText = transcription.substring(lastTranscriptionText.length).trim();
            if (newText) {
              sender.send(IPC_CHANNELS.TRANSCRIPTION_RESULT, newText);
              log.info(`Generated new transcription segment: ${newText}`);
            }
          } else {
            // Send full transcription for this chunk
            sender.send(IPC_CHANNELS.TRANSCRIPTION_RESULT, transcription);
            log.info(`Generated transcription: ${transcription}`);
          }
          
          // Update the last transcription text
          lastTranscriptionText = transcription;
        }
      } catch (error) {
        log.error('Transcription error:', error);
        
        // Check if this is an unsupported model error
        const errorMsg = error.message || '';
        if (errorMsg.includes('not supported') || errorMsg.includes('doesn\'t support')) {
          sender.send(IPC_CHANNELS.TRANSCRIPTION_ERROR, 
            "Unable to transcribe audio. Make sure you have a compatible model selected.");
          
          // Stop transcription since we have a model compatibility issue
          stopTranscription();
        }
      }
    } else {
      // Fallback message when Gemini not available
      sender.send(IPC_CHANNELS.TRANSCRIPTION_ERROR, "Gemini API not configured for audio transcription");
      stopTranscription();
    }
  } catch (error) {
    log.error('Error processing audio for transcription:', error);
    sender.send(IPC_CHANNELS.TRANSCRIPTION_ERROR, error.message);
  }
}

/**
 * Checks if transcription is currently active
 * @returns {boolean} True if transcription is active, false otherwise
 */
function isTranscriptionActive() {
  return isTranscribing;
}

module.exports = {
  initialize,
  startTranscription,
  stopTranscription,
  isTranscriptionActive
}; 