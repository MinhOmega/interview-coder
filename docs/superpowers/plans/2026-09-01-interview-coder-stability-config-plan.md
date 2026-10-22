# Interview Coder Stability and Project Configuration Implementation Plan

1. Add Node test infrastructure and repository-local ESLint configuration.
2. Extract and test project-configuration parsing, merging, validation, atomic persistence, and secret-safe behavior.
3. Integrate root configuration loading and automatic settings-window persistence with legacy user-data fallback.
4. Add Russian response-language support and a safe example configuration.
5. Extract and test scroll-position and render-generation logic.
6. Integrate scheduled streaming renders into standard and split-chat views; remove queued smooth and forced scrolling.
7. Consolidate macOS screen-capture permission handling, remove invalid permission calls and TCC resets, and fix screenshot format/error handling.
8. Repair confirmed adjacent runtime and markup defects.
9. Run tests, lint, syntax checks, and an Electron startup smoke test; update documentation where behavior changed.
