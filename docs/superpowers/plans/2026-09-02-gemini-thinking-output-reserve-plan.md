# Gemini Thinking Output Reserve Implementation Plan

## Objective

Prevent Gemini thinking models from consuming the visible response-profile allowance while keeping Easy, Medium, Hard, and Custom answers concise.

## Tasks

1. Extend `test/provider-output-options.test.js` with failing regression cases for Gemini 3.5 Flash Easy/Medium/Hard, Gemini 3.7 Flash fallback, Gemini 2.5 Flash Hard, Custom boundaries, dated model names, and unknown models.
2. Update `js/provider-output-options.js` so known Gemini thinking models receive a profile-derived thinking level or budget and an appropriate hidden-token reserve.
3. Add a small pure Gemini response-diagnostics helper with tests. It will extract finish reason and usage metadata without exposing prompts, images, API keys, or generated reasoning.
4. Call the diagnostics helper after Gemini streaming and non-streaming completions in the shared screenshot provider and both chat paths.
5. Run the focused tests, full `npm test`, `npm run lint`, and an Electron startup smoke test. Do not make a live paid Gemini request.
6. Review the diff for unrelated changes, update the code graph, and commit the implementation.

## Acceptance Criteria

- `getGeminiOutputOptions(256, "gemini-3.5-flash")` produces `thinkingLevel: "minimal"` and a provider cap of 384.
- Medium and Hard produce the agreed 1024 and 2560 caps with `low` and `medium` thinking.
- Gemini 3.7 Flash uses `low` instead of unsupported `minimal` for Easy.
- Gemini 2.5 Flash keeps thinking disabled for Easy/Medium and reserves its Hard thinking budget outside the visible target.
- Unknown models preserve the original limit and receive no guessed thinking configuration.
- Screenshot and chat paths use the same option helper.
- `MAX_TOKENS` is diagnosable from logs and never triggers an automatic paid retry.
- Existing tests and lint pass.
