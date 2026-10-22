# Interview Coder Stability and Project Configuration Design

Date: 2026-09-01

## Objective

Stabilize scrolling and streamed Markdown rendering across the standard and split-chat views, repair macOS screen-capture permission handling, add a local project configuration file with automatic UI synchronization, and address adjacent reproducible defects found during the audit.

The work must preserve the current Electron application structure and existing user settings while avoiding a broad renderer rewrite.

## Scope

### Included

- Stable manual scrolling before, during, and after streamed AI responses.
- Correct auto-scroll behavior in both the standard result view and split chat.
- A render scheduler that prevents excessive and out-of-order Markdown updates.
- Correct macOS screen-capture permission checks and guidance.
- Removal of automatic TCC permission resets and invalid Electron media permission calls.
- A root-level `interview-coder.config.json` containing project settings and API keys.
- Automatic creation and synchronization of the project configuration from the settings UI.
- A safe committed example configuration and Git ignore rule for the secret-bearing file.
- Russian as a supported response language.
- Validation, atomic writes, restrictive local file permissions, and secret-safe logging.
- Repairs for nearby confirmed defects: false-positive Gemini key validation, an undeclared platform variable, duplicate HTML IDs, unsafe error rendering, screenshot format mismatch, and the non-functional lint command.
- Automated tests for pure configuration and scroll/render state logic plus a manual Electron smoke test.

### Excluded

- A full modular rewrite of `renderer.js`.
- A new settings framework or dependency-heavy state-management system.
- Migration to a different Electron security architecture.
- Changes intended to bypass interview monitoring or screen-sharing detection.
- Changes to AI prompts beyond response-language support and the minimum required configuration integration.

## Architecture

### Stream rendering and scroll controller

The renderer will use one small controller for each scrollable surface. The controller owns:

- the accumulated Markdown source;
- the latest render generation number;
- the scheduled animation-frame render;
- the user's pre-render scroll intent;
- restoration of either bottom-following or the current visual anchor.

Incoming chunks update the buffer and request a render. At most one render is scheduled per animation frame. Each asynchronous Markdown conversion receives a monotonically increasing generation number. A completed render is applied only if it is still the newest generation, preventing an older conversion from replacing newer content.

Before replacing rendered content, the controller records whether the user is near the bottom and records the current scroll offset. After the replacement:

- a user who was near the bottom remains at the bottom;
- a user reading earlier content retains the same viewport position;
- completion of a stream does not force a scroll;
- manual hotkey scrolling uses an immediate bounded offset and does not queue smooth animations.

The standard result wrapper and split-chat messages container use the same state rules. Copy-button setup runs only after an applied render rather than for superseded renders.

### macOS screen-capture permissions

Permission handling will have one authoritative flow:

1. Read `systemPreferences.getMediaAccessStatus("screen")`.
2. If access is not granted, attempt `desktopCapturer.getSources` once, which is the supported capture operation and may cause macOS to surface the relevant system behavior.
3. If capture remains unavailable, show a clear message with a control that opens the Screen Recording system settings.
4. Require an application restart after the user grants access.

The application will not call `askForMediaAccess("screen")`, because Electron does not accept `screen` for that API. It will never run `tccutil reset` automatically. Permission errors from both `desktopCapturer` and the `screencapture` fallback will be normalized into the same actionable result.

The command-line screenshot fallback will write content matching its filename extension. Temporary screenshots continue to use unique names.

## Project configuration

### Files

- `interview-coder.config.json`: local configuration and secrets; created or updated by the application and ignored by Git.
- `interview-coder.config.example.json`: committed schema example with empty keys.
- Existing user-data settings file: retained as a backward-compatible fallback.

### Schema

```json
{
  "aiProvider": "gemini",
  "currentModel": "gemini-2.5-flash",
  "responseLanguage": "ru",
  "ollamaUrl": "http://127.0.0.1:11434",
  "azureEndpoint": "",
  "apiKeys": {
    "openai": "",
    "gemini": "",
    "azure-foundry": ""
  }
}
```

Known fields are validated and normalized. Unknown fields are preserved when the UI updates the file so future or user-added settings are not silently destroyed. Invalid field types, unsupported providers, unsupported response languages, and an empty model for a configured cloud provider produce a clear configuration error.

### Loading precedence

Settings are merged in this order, from lowest to highest priority:

1. Built-in defaults.
2. Existing user-data settings.
3. Root-level project configuration.

This preserves current installations while making project configuration authoritative when present. API clients initialize from the merged result at startup.

### Saving

Saving through the settings window creates or updates `interview-coder.config.json`. The save operation:

1. Reads and validates the existing file if present.
2. Merges UI-owned fields while preserving unknown fields and keys for other providers.
3. Writes a temporary file in the project root.
4. Applies user-only permissions (`0600`) on macOS/Linux.
5. Atomically renames the temporary file over the target.
6. Updates in-memory settings and active AI clients only after the write succeeds.

A malformed existing file is never overwritten automatically. The UI reports the path and parsing problem so the user can repair it.

API keys must never be logged. User-visible key fields remain masked after loading. The actual local configuration is included in `.gitignore`; only the empty example is committed.

## Russian response support

The language registry adds:

```text
ru: Russian (Русский)
```

The settings window exposes the new language card and persists `responseLanguage: "ru"`. Prompt generation instructs the selected provider to answer in Russian while leaving source code, identifiers, API names, and technical tokens unchanged where translation would reduce correctness.

## Adjacent defect repairs

- Gemini API-key validation will perform a real provider request and distinguish invalid credentials, quota/rate limits, network failures, and successful validation.
- `renderer.js` will import or otherwise correctly define the Windows platform flag used by error diagnostics.
- Duplicate toolbar element IDs will be replaced with unique IDs or classes.
- Runtime error text will be assigned through `textContent` or explicitly escaped DOM nodes instead of interpolated into `innerHTML`.
- CSS hints such as broad `will-change: contents` and unnecessary forced compositing will be removed where they destabilize scrolling or create excessive repaint work.
- Scrollbar styling will target the actual scroll containers.
- ESLint will receive a repository-local configuration compatible with the existing CommonJS/Electron code. Generated output and dependencies remain excluded.

## Error handling

- Rendering failure keeps the latest plain-text response visible and does not destroy the user's scroll position.
- A superseded asynchronous Markdown render exits without touching the DOM.
- Configuration errors identify the file and field without printing secret values.
- Atomic configuration write failure leaves the previous file intact and keeps the settings window open.
- Missing screen-capture permission produces one actionable notification instead of repeated failing prompts.
- Provider validation reports authentication, quota, connectivity, and unexpected failures separately where the API exposes that distinction.

## Verification

### Automated

- Syntax-check every JavaScript source file with Node.
- Run the repaired ESLint command.
- Test configuration precedence, schema validation, unknown-field preservation, malformed-file protection, atomic save behavior, permissions, and secret-safe error formatting.
- Test scroll-state calculations for top, middle, near-bottom, content growth, and container resize cases.
- Test render-generation ordering so an older asynchronous render cannot replace a newer one.
- Test Russian language selection and persistence.

Pure logic will be extracted into small CommonJS modules so it can be tested without booting Electron. Tests will use Node's built-in test runner to avoid adding a test framework.

### Manual Electron smoke test

- Start the application on macOS.
- Load the root project configuration and initialize Gemini without opening settings first.
- Generate a long streamed response and scroll repeatedly at the top, middle, and bottom.
- Repeat in split-chat mode.
- Confirm no jump occurs after stream completion.
- Save provider, model, language, and key through the UI; restart and verify automatic reload.
- Select Russian and confirm a Russian response with unchanged code identifiers.
- Verify denied screen-capture access gives one actionable message, then grant access, restart, and capture successfully.
- Confirm the saved screenshot's extension and encoded format agree.

## Acceptance criteria

- Manual scrolling remains smooth and does not jump during or after streaming.
- Auto-scroll follows new output only while the user is already near the bottom.
- Standard and split views behave consistently.
- No invalid `askForMediaAccess("screen")` or automatic `tccutil reset` remains.
- Screen-capture denial is recoverable through clear macOS instructions.
- The local root configuration is automatically created and updated by the settings UI.
- Project configuration overrides legacy user settings at startup.
- The secret-bearing configuration cannot be committed under normal Git usage.
- Russian appears in settings and produces Russian AI responses.
- Gemini credentials are actually validated.
- `npm run lint`, automated tests, syntax checks, and the Electron smoke test pass.
