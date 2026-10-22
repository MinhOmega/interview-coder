# Response Profiles and Chat Access Implementation Plan

## Objective

Implement the approved response-size profiles, enforce output-token limits across every provider and generation path, replace the legacy verbose screenshot prompt, and expose the existing split-view chat through visible controls.

## Task 1: Response-profile domain module

Files:

- create `js/response-profiles.js`;
- create `test/response-profiles.test.js`.

Steps:

1. Write failing tests for Easy, Medium, Hard, and Custom limit resolution.
2. Test integer and 128–8192 custom validation boundaries.
3. Test concise instructions, code-line limits, and absence of legacy/bilingual requirements.
4. Implement immutable profile metadata, validation, effective-limit resolution, and prompt-instruction construction.
5. Run the focused test file.

## Task 2: Configuration integration

Files:

- modify `js/config-manager.js`;
- modify `js/project-config.js`;
- modify `interview-coder.config.example.json`;
- modify `test/project-config.test.js`;
- add or update config-manager tests as needed.

Steps:

1. Add `responseProfile: "easy"` and a valid default custom limit to defaults.
2. Validate supported profile names and integer custom limits in project JSON.
3. Expose selected profile and effective limit through config-manager getters.
4. Preserve backward compatibility: absent fields resolve to Easy; explicit invalid fields fail visibly.
5. Update the example without adding real credentials.
6. Run configuration tests.

## Task 3: Prompt simplification

Files:

- modify `js/ai-processing.js`;
- modify `js/direct-answer-prompt.js`;
- modify `js/ui-implementation-prompt.js` only where needed;
- modify `js/chat-handler.js`;
- modify/add prompt tests.

Steps:

1. Replace the mandatory four-section screenshot template with a small task-context prompt.
2. Append the selected response-profile instruction and existing language instruction exactly once.
3. Ensure Easy and Medium prompts forbid boilerplate, full files, and bilingual comments.
4. Apply the same instruction to quick answers, UI mode, multi-screenshot requests, and split-view chat.
5. Add a regression test based on the supplied oversized syntax-error response requirements.

## Task 4: Provider token propagation

Files:

- modify `js/ai-providers.js`;
- modify `js/chat-handler.js`;
- modify `js/azure-foundry-provider.js`;
- modify `js/ollama-provider.js` if its separate paths require it;
- create provider option tests or extract a testable option builder.

Steps:

1. Pass an explicit effective output limit from processing code into provider generation methods.
2. Map it to Gemini `maxOutputTokens`.
3. Control Gemini 2.5 Flash thinking so small profiles are not consumed by hidden reasoning tokens.
4. Map it to OpenAI/Azure `max_tokens`.
5. Map it to Ollama `options.num_predict` for chat, generate, retry, and fallback calls.
6. Ensure streaming and non-streaming calls use the same limit.
7. Remove hard-coded 8192/2048/4096 response limits where the selected profile should apply.
8. Never retry a rejected request without a limit.

## Task 5: Settings UI

Files:

- modify `model-selector.html`;
- modify `model-selector.js`;
- modify `css/model-selector.css`;
- update UI-related tests where practical.

Steps:

1. Add a collapsible Response Size section beside Response Language.
2. Add Easy, Medium, Hard, and Custom cards with token counts and intended use.
3. Reveal a numeric 128–8192 input only for Custom.
4. Restore the selected profile and custom value on load.
5. Validate before saving and keep the settings window open on failure.
6. Persist both fields through the existing settings IPC path.

## Task 6: Chat discoverability

Files:

- modify `index.html`;
- modify `renderer.js`;
- modify `css/styles.css`;
- modify `main.js` or `js/window-manager.js` only if a new IPC path is required.

Steps:

1. Add a visible Chat toolbar button that opens split view instead of blindly toggling it closed.
2. Focus the message field after opening.
3. Add a New Chat button inside the chat pane using the existing reset conversation path.
4. Preserve Command/Ctrl+T, Command/Ctrl+N, Enter, and Shift+Enter behavior.
5. Ensure repeated initialization does not duplicate handlers.

## Task 7: Verification and delivery

1. Run focused response-profile, config, prompt, and provider tests.
2. Run `npm test`.
3. Run `npm run lint`.
4. Run syntax checks and `git diff --check`.
5. Launch Electron and manually verify settings restoration, Easy screenshot output, Chat button, New Chat button, and existing shortcuts.
6. Review the diff for accidental credentials and preserve unrelated user changes.
7. Commit the implementation separately from the design and plan documents.
