# Auto-Update System for Interview Coder

This document provides information about the auto-update system implemented in Interview Coder.

## Testing in Development Mode

To test the auto-update system in development without deploying a real update:

### Method 1: Using Local Server

1. Run the test server:
   ```
   npm run update:test
   ```

2. In another terminal, start the app in dev mode:
   ```
   npm run dev
   ```

   Or use the combined command:
   ```
   npm run dev:update
   ```

3. The app should detect the "update" from the local server.

4. To reset the configuration:
   ```
   npm run update:reset
   ```

### Method 2: Using GitHub

1. Ensure `dev-app-update.yml` is configured for GitHub:
   ```yaml
   provider: github
   owner: minhomega
   repo: interview-coder
   private: false
   releaseType: release
   ```

2. Start the app in dev mode:
   ```
   npm run dev
   ```

3. Manually trigger update check from the app menu.

## Development Files

The auto-update system consists of these key files:

- **js/updater.js**: Main updater module with core functionality
- **dev-app-update.yml**: Configuration for testing in development
- **scripts/dev-update-test.js**: Test server for simulating updates
- **scripts/reset-dev-config.js**: Resets dev configuration to GitHub

## Debugging

Logs for the auto-update system can be found in:

- **macOS**: `~/Library/Logs/interview-coder/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\interview-coder\logs\main.log`
- **Linux**: `~/.config/interview-coder/logs/main.log`

## Troubleshooting

If updates aren't working:

1. Check internet connectivity
2. Verify app has correct permissions
3. Look for errors in the log files
4. Ensure the app is correctly code-signed (for production builds)
5. Verify GitHub release tags match the expected format

## Notes for Maintainers

When creating releases:
- Use semantic versioning (e.g., `1.2.3`)
- Ensure release assets are properly named
- Test the update flow before full release 