const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const statAsync = promisify(fs.stat);

// Configuration
const packageJson = require('../package.json');
const version = packageJson.version;
const basePath = path.join(__dirname, '../dist');
const outputPath = path.join(__dirname, 'update-server');

const generateChecksum = async (filePath) => {
  const fileBuffer = await readFileAsync(filePath);
  const hashSum = crypto.createHash('sha512');
  hashSum.update(fileBuffer);
  const hex = hashSum.digest('base64');
  const stats = await statAsync(filePath);
  return { 
    sha512: hex, 
    size: stats.size 
  };
};

const generateUpdateYml = async () => {
  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }
  
  try {
    // Generate checksums for DMG files
    const x64DmgPath = path.join(basePath, `Interview-Coder-x64.dmg`);
    const arm64DmgPath = path.join(basePath, `Interview-Coder-arm64.dmg`);
    
    // Generate checksums for ZIP files
    const x64ZipPath = path.join(basePath, `Interview-Coder-x64.zip`);
    const arm64ZipPath = path.join(basePath, `Interview-Coder-arm64.zip`);
    
    const x64DmgInfo = await generateChecksum(x64DmgPath);
    const arm64DmgInfo = await generateChecksum(arm64DmgPath);
    const x64ZipInfo = await generateChecksum(x64ZipPath);
    const arm64ZipInfo = await generateChecksum(arm64ZipPath);
    
    // Create latest-mac.yml
    const latestMacYml = `version: ${version}
files:
  - url: Interview-Coder-x64.dmg
    sha512: ${x64DmgInfo.sha512}
    size: ${x64DmgInfo.size}
  - url: Interview-Coder-arm64.dmg
    sha512: ${arm64DmgInfo.sha512}
    size: ${arm64DmgInfo.size}
  - url: Interview-Coder-x64.zip
    sha512: ${x64ZipInfo.sha512}
    size: ${x64ZipInfo.size}
  - url: Interview-Coder-arm64.zip
    sha512: ${arm64ZipInfo.sha512}
    size: ${arm64ZipInfo.size}
path: Interview-Coder-x64.dmg
sha512: ${x64DmgInfo.sha512}
releaseDate: '${new Date().toISOString()}'
`;

    // Create latest-mac-zip.yml
    const latestMacZipYml = `version: ${version}
files:
  - url: Interview-Coder-x64.zip
    sha512: ${x64ZipInfo.sha512}
    size: ${x64ZipInfo.size}
  - url: Interview-Coder-arm64.zip
    sha512: ${arm64ZipInfo.sha512}
    size: ${arm64ZipInfo.size}
path: Interview-Coder-x64.zip
sha512: ${x64ZipInfo.sha512}
releaseDate: '${new Date().toISOString()}'
`;

    // Write YML files
    await writeFileAsync(path.join(outputPath, 'latest-mac.yml'), latestMacYml);
    await writeFileAsync(path.join(outputPath, 'latest-mac-zip.yml'), latestMacZipYml);
    
    console.log('Generated update YML files successfully!');
  } catch (error) {
    console.error('Error generating checksums:', error);
  }
};

generateUpdateYml().catch(console.error); 