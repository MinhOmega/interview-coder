// Simple script to compile TypeScript files to JavaScript
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Function to recursively copy files
function copyFiles(src, dest, extensions) {
  if (!fs.existsSync(src)) {
    console.log(`Source directory doesn't exist: ${src}`);
    return;
  }

  // Create destination directory if it doesn't exist
  fs.ensureDirSync(dest);

  // Get all files in the source directory
  const files = fs.readdirSync(src);

  // Process each file
  files.forEach(file => {
    const sourcePath = path.join(src, file);
    const destPath = path.join(dest, file);
    
    // Check if it's a directory
    if (fs.statSync(sourcePath).isDirectory()) {
      // Recursively copy directory
      copyFiles(sourcePath, destPath, extensions);
    } else {
      // Check if file has one of the specified extensions
      const ext = path.extname(file).toLowerCase();
      if (extensions.includes(ext)) {
        // If it's a .ts file, convert to .js
        if (ext === '.ts') {
          const content = fs.readFileSync(sourcePath, 'utf8');
          const destJsPath = destPath.replace('.ts', '.js');
          
          // Simple transformation to convert TypeScript to JavaScript
          // This is very basic and won't handle complex TypeScript features
          let jsContent = content
            .replace(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g, 'const { $1 } = require("$2")')
            .replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require("$2")')
            .replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require("$2")')
            .replace(/export\s+default\s+(\w+)/g, 'module.exports = $1')
            .replace(/export\s+{([^}]+)}/g, 'module.exports = { $1 }')
            .replace(/export\s+const\s+(\w+)/g, 'const $1 = module.exports.$1')
            .replace(/export\s+function\s+(\w+)/g, 'function $1')
            .replace(/export\s+interface\s+(\w+)[^{]*{[^}]*}/g, '// interface $1 removed')
            .replace(/export\s+type\s+(\w+)[^=]*=[^;]*;/g, '// type $1 removed')
            .replace(/interface\s+(\w+)[^{]*{[^}]*}/g, '// interface $1 removed')
            .replace(/type\s+(\w+)[^=]*=[^;]*;/g, '// type $1 removed')
            .replace(/<[^>]+>/g, ''); // Remove generic type parameters
          
          fs.writeFileSync(destJsPath, jsContent);
          console.log(`Converted: ${sourcePath} -> ${destJsPath}`);
        } else {
          // Otherwise just copy the file
          fs.copyFileSync(sourcePath, destPath);
          console.log(`Copied: ${sourcePath} -> ${destPath}`);
        }
      }
    }
  });
}

// Clear dist directory
console.log('Clearing dist directory...');
fs.removeSync('dist');
fs.ensureDirSync('dist');

// Copy TypeScript files to dist and convert to JavaScript
console.log('Copying and converting files...');
copyFiles('src', 'dist', ['.ts', '.html', '.css']);

console.log('Compilation complete!'); 