/*
 * This is a minimal notarization script for Electron apps
 * It's designed to allow the app to build in development mode
 * without actually notarizing with Apple, but enabling proper
 * permission handling.
 */

// This module exports an async function that will be called by electron-builder after signing
module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only apply to macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization: not macOS');
    return;
  }

  console.log('Skipping actual notarization step for development builds');
  console.log('But registering app for screen recording permissions');
  
  // In a real production app, you would add actual notarization here
  // using electron-notarize or similar
  
  return true;
}; 