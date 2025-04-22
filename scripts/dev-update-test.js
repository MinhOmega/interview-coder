/**
 * Development script to test the auto-update functionality
 * This script simulates a newer version by modifying the dev-app-update.yml file
 * and creating a mock server that responds with update information
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const app = express();
const port = 3000;

// Configuration
const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const devUpdateConfigPath = path.join(projectRoot, 'dev-app-update.yml');
const updateServerDir = path.join(__dirname, 'update-server');

// Create update server directory if it doesn't exist
if (!fs.existsSync(updateServerDir)) {
  fs.mkdirSync(updateServerDir, { recursive: true });
}

// Read current package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

// Parse version components
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Create next version (increment patch)
const nextVersion = `${major}.${minor}.${patch + 1}`;
console.log(`Current version: ${currentVersion}`);
console.log(`Next version for testing: ${nextVersion}`);

// Serve static files from the update server directory
app.use('/updates', express.static(updateServerDir));

// Create mock latest.yml for the specific platform
function createMockUpdateFiles() {
  // Determine platform
  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';
  const isLinux = process.platform === 'linux';

  // Create the version directory
  const versionDir = path.join(updateServerDir, nextVersion);
  if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(versionDir, { recursive: true });
  }

  // Platform specific filenames
  const mockFiles = [];
  
  if (isMac) {
    // Mock macOS update files
    const latestMacYml = {
      version: nextVersion,
      files: [
        {
          url: `Interview Coder-${nextVersion}-mac.zip`,
          sha512: 'mock-sha512-hash-mac',
          size: 12345678,
        }
      ],
      path: `Interview Coder-${nextVersion}-mac.zip`,
      sha512: 'mock-sha512-hash-mac',
      releaseDate: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(updateServerDir, 'latest-mac.yml'),
      JSON.stringify(latestMacYml, null, 2)
    );
    
    // Create empty zip file for mock
    fs.writeFileSync(
      path.join(versionDir, `Interview Coder-${nextVersion}-mac.zip`),
      'Mock update file'
    );
    
    mockFiles.push('latest-mac.yml');
  }
  
  if (isWindows) {
    // Mock Windows update files
    const latestWinYml = {
      version: nextVersion,
      files: [
        {
          url: `Interview Coder Setup ${nextVersion}.exe`,
          sha512: 'mock-sha512-hash-win',
          size: 12345678,
        }
      ],
      path: `Interview Coder Setup ${nextVersion}.exe`,
      sha512: 'mock-sha512-hash-win',
      releaseDate: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(updateServerDir, 'latest.yml'),
      JSON.stringify(latestWinYml, null, 2)
    );
    
    // Create empty exe file for mock
    fs.writeFileSync(
      path.join(versionDir, `Interview Coder Setup ${nextVersion}.exe`),
      'Mock update file'
    );
    
    mockFiles.push('latest.yml');
  }
  
  if (isLinux) {
    // Mock Linux update files
    const latestLinuxYml = {
      version: nextVersion,
      files: [
        {
          url: `interview-coder-${nextVersion}.AppImage`,
          sha512: 'mock-sha512-hash-linux',
          size: 12345678,
        }
      ],
      path: `interview-coder-${nextVersion}.AppImage`,
      sha512: 'mock-sha512-hash-linux',
      releaseDate: new Date().toISOString()
    };
    
    fs.writeFileSync(
      path.join(updateServerDir, 'latest-linux.yml'),
      JSON.stringify(latestLinuxYml, null, 2)
    );
    
    // Create empty AppImage file for mock
    fs.writeFileSync(
      path.join(versionDir, `interview-coder-${nextVersion}.AppImage`),
      'Mock update file'
    );
    
    mockFiles.push('latest-linux.yml');
  }

  return mockFiles;
}

// Update the dev-app-update.yml to use the local server
function updateDevConfig() {
  const devUpdateConfig = 
`provider: generic
url: http://localhost:${port}/updates`;

  fs.writeFileSync(devUpdateConfigPath, devUpdateConfig);
  console.log(`Updated ${devUpdateConfigPath} to use local update server`);
}

// Start server
function startServer() {
  const mockFiles = createMockUpdateFiles();
  updateDevConfig();
  
  app.listen(port, () => {
    console.log(`
=======================================================
Update Test Server running at http://localhost:${port}
=======================================================

Current version: ${currentVersion}
Test version: ${nextVersion}

Mock update files created:
${mockFiles.map(file => `- ${file}`).join('\n')}

To test updates:
1. Start your Electron app in development mode
2. The app should detect a new version (${nextVersion})
3. Follow the update prompts in the app

To reset dev-app-update.yml to GitHub provider:
node scripts/reset-dev-config.js

Press Ctrl+C to stop the server
=======================================================
`);
  });
}

// Create Reset Script
function createResetScript() {
  const resetScript = `
/**
 * Reset dev-app-update.yml to use GitHub provider
 */
const fs = require('fs');
const path = require('path');

const devUpdateConfigPath = path.join(__dirname, '..', 'dev-app-update.yml');
const resetConfig = 
\`provider: github
owner: minhomega
repo: interview-coder
private: false
releaseType: release\`;

fs.writeFileSync(devUpdateConfigPath, resetConfig);
console.log('Reset dev-app-update.yml to use GitHub provider');
`;

  fs.writeFileSync(path.join(__dirname, 'reset-dev-config.js'), resetScript);
  console.log('Created reset script at scripts/reset-dev-config.js');
}

// Run everything
startServer();
createResetScript(); 