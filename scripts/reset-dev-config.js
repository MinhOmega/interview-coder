
/**
 * Reset dev-app-update.yml to use GitHub provider
 */
const fs = require('fs');
const path = require('path');

const devUpdateConfigPath = path.join(__dirname, '..', 'dev-app-update.yml');
const resetConfig = 
`provider: github
owner: minhomega
repo: interview-coder
private: false
releaseType: release`;

fs.writeFileSync(devUpdateConfigPath, resetConfig);
console.log('Reset dev-app-update.yml to use GitHub provider');
