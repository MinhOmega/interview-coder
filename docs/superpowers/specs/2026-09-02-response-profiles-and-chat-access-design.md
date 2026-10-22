# Response Profiles and Chat Access Design

## Goal

Reduce unnecessary output-token usage and prevent routine screenshot analysis from producing oversized explanations or complete source files. Make the existing split-view chat discoverable without requiring users to know a keyboard shortcut.

## Scope

This change covers every model-generation path:

- standard screenshot analysis;
- quick-answer screenshot mode;
- UI implementation screenshot mode;
- multi-screenshot analysis;
- split-view chat;
- Gemini, OpenAI, Azure Foundry, and Ollama providers.

Input-token usage is outside the limit described here. Images, prompts, and conversation history still consume input tokens. The selected limit controls model output.

## Response Profiles

The settings window will offer four mutually exclusive response profiles:

| Profile | Output-token limit | Intended behavior |
| --- | ---: | --- |
| `easy` | 256 | Direct answer, one or two short explanations, no full source listing. |
| `medium` | 768 | Junior-interview-level explanation, root cause, and the smallest useful code fragment. |
| `hard` | 2048 | Complete solution for a complex task, while avoiding repetition and unrelated theory. |
| `custom` | 128–8192 | User-defined hard output limit with the same concise-answer rules. |

`easy` is the default for new installations and for existing configurations that do not contain a profile.

The token cap and the response-style instruction are both required. A cap alone can cut an answer in the middle, while a prompt alone can be ignored. Together they make the model plan a response that fits the selected budget.

All profiles instruct the model to:

- avoid restating the question;
- lead with the answer or fix;
- omit repeated conclusions and generic theory;
- show a patch or minimal fragment instead of a complete file when possible;
- preserve code, identifiers, commands, and error messages in their original form;
- continue honoring the configured response language.

The current mandatory `Analyzing the Problem`, `My Thoughts`, `Implementation`, and `Complexity` template is removed from routine responses. It is the primary source of oversized output because it requires the model to repeat its reasoning, generate a complete implementation, analyze complexity, and duplicate code comments in two languages even for a simple error screenshot.

The profile-specific formats are:

- `easy`: answer or diagnosis first, no more than three short bullets, and at most 12 lines of code when code is necessary;
- `medium`: diagnosis, brief reason, and a minimal patch or fragment, with at most 40 lines of code;
- `hard`: structured explanation and complete code only when the task genuinely requires it;
- `custom`: concise structure selected according to the available custom budget, without mandatory boilerplate sections.

If a useful answer cannot fit the selected profile, the model must provide the most important diagnosis or next action and suggest switching to a larger profile. It must not begin a long source listing that will be cut off by the hard token cap.

Code comments are not translated or duplicated. Explanatory prose follows the selected response language, while source code and technical identifiers remain unchanged.

Only `hard`, `custom` with sufficient budget, or an explicit user request permits a complete source-file listing. Provider safety limits remain authoritative: when a model supports fewer output tokens than requested, the application uses the lower supported value.

## Configuration

The root `interview-coder.config.json` gains two optional fields:

```json
{
  "responseProfile": "easy",
  "customMaxOutputTokens": 1024
}
```

`responseProfile` accepts `easy`, `medium`, `hard`, or `custom`. `customMaxOutputTokens` must be an integer from 128 through 8192 and is used only when the profile is `custom`.

Loading an older configuration supplies `easy` without rewriting the file immediately. Saving settings persists the selected profile and custom limit through the existing atomic, permission-restricted project-config writer.

Malformed profile values or out-of-range custom limits produce a visible settings error and do not overwrite the last valid configuration.

## Architecture and Data Flow

A focused response-profile module will own:

- profile names and fixed token limits;
- custom-limit normalization and validation;
- construction of the concise response instruction;
- resolution of the effective output-token limit.

The config manager exposes the selected profile and resolved limit. Screenshot prompt builders and the split-view chat system prompt append the profile instruction alongside the language instruction.

The existing monolithic screenshot prompt is split into a small task-context prompt and the selected response-profile instruction. Easy and Medium never inherit the legacy mandatory long-form response template. Hard may request deeper analysis, but it still avoids repeated reasoning and bilingual comments.

Generation calls receive the effective limit explicitly rather than reading UI state. Each provider maps it to its native option:

- Gemini: `maxOutputTokens`;
- OpenAI and Azure Foundry: `max_tokens`;
- Ollama chat/generate: `options.num_predict`.

Gemini 2.5 Flash uses dynamic thinking by default and bills thinking tokens as output. For Easy and Medium, the application sets `thinkingBudget` to `0`; for Hard and larger Custom budgets it caps thinking at 512 tokens. Other Gemini model families keep their provider defaults unless their thinking controls are known to be compatible.

Streaming and non-streaming calls must use the same value. Retry and fallback paths must preserve the limit rather than reverting to the previous hard-coded defaults.

## Settings UI

The model-selection window gains a collapsible "Response size" section near "Response Language". It contains cards for Easy, Medium, Hard, and Custom. Each card shows the intended use and exact maximum token count.

Selecting Custom reveals a numeric input constrained to 128–8192. The Save Settings action validates the value before sending the existing settings IPC request. Loading settings restores the selected card and custom value.

No separate profile is maintained per model or per mode. A single global selection keeps cost and response length predictable.

## Chat Discoverability

The existing split-view chat remains the implementation; a second chat system will not be added.

The main toolbar gains a visible Chat button. Activating it opens split view and focuses the right-side message field. The chat pane gains a New Chat button that clears its conversation after an explicit click. Existing shortcuts remain available:

- Command/Ctrl+T toggles split view;
- Command/Ctrl+N starts a new chat;
- Enter sends a message;
- Shift+Enter inserts a line break.

The left pane continues to show the latest screenshot result, allowing follow-up requests such as asking for a shorter explanation or a minimal correction.

## Error Handling

- Reject non-integer, non-finite, or out-of-range custom limits before saving.
- Reject unsupported profile names while validating the project JSON.
- Fall back to `easy` only when the field is absent, not when an explicitly invalid value is present.
- Clamp valid requested limits to provider/model constraints when those constraints are known.
- Preserve the active profile across provider changes and failed generation attempts.
- Display a concise error if a provider rejects its token option; do not silently retry with an unlimited response.

## Testing

Automated tests will cover:

- fixed profile-to-token mappings;
- the `easy` default for legacy configurations;
- custom-limit lower and upper boundaries;
- rejection of invalid profile names and custom limits;
- concise prompt instructions for each profile;
- interaction between Russian-language and response-profile instructions;
- propagation of the effective limit into every provider, including streaming and fallback paths;
- settings serialization and restoration;
- chat controls opening split view, focusing the input, and starting a new conversation;
- absence of the legacy long-form section requirements in Easy and Medium prompts;
- Easy output instructions limiting prose to three bullets and code to 12 lines;
- Medium output instructions limiting code to 40 lines;
- absence of bilingual code-comment requirements in every profile.

Manual verification will confirm that ordinary error screenshots produce short answers, complex tasks can use a larger profile, split-view chat is accessible from the toolbar, and existing keyboard shortcuts continue to work.

The supplied oversized-response sample is the regression reference: it contains 243 lines and 1,297 words for a syntax-error screenshot. With Easy selected, the equivalent response must contain only the likely syntax cause, the smallest corrective example, and at most two additional observations, all within the 256-token provider cap.

## Out of Scope

- Limiting image or conversation input tokens;
- estimating monetary cost before a request;
- maintaining different limits for different providers or modes;
- automatically classifying task difficulty;
- truncating an already-rendered response in the renderer.
