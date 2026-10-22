# Gemini Thinking Output Reserve Design

## Problem

The response-profile limit is currently passed directly to Gemini as `maxOutputTokens`. For thinking models, that provider limit covers both hidden reasoning and the visible answer. `gemini-3.5-flash` defaults to medium thinking, so an Easy request with a 256-token limit can spend nearly the whole allowance on reasoning and return a fragment such as `**Причина ошибки:** С`.

The profile label must continue to describe the maximum useful visible response. Hidden provider reasoning must not consume that entire allowance.

## Goals

- Keep the existing visible-answer targets: Easy 256, Medium 768, and Hard 2048 tokens.
- Prevent short Gemini answers from being starved by hidden reasoning.
- Preserve the concise prompt rules and avoid automatic retries that can unexpectedly double cost.
- Apply the same Gemini configuration to screenshot analysis, direct answers, and chat.
- Keep OpenAI, Azure, and Ollama behavior unchanged.

## Provider Budgeting

`getGeminiOutputOptions` will treat its input as the visible-answer target and derive two independent settings:

| Visible target | Gemini 3 thinking level | Hidden reserve | Provider `maxOutputTokens` |
| --- | --- | ---: | ---: |
| up to 256 | `minimal` when supported, otherwise `low` | 128 | visible target + 128 |
| 257–768 | `low` | 256 | visible target + 256 |
| above 768 | `medium` | up to 512 | visible target + `min(512, floor(target / 4))` |

This rule also defines Custom behavior. For example, Custom 128 receives a provider cap of 256, while Custom 4096 receives a cap of 4608. The prompt still instructs the model to keep the visible response within the selected 128 or 4096 token target.

The known-minimal set is explicit: `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`, and `gemini-3-flash-preview`, including dated suffixes. These models use `minimal` for Easy. `gemini-3.7-flash`, including dated suffixes, does not support `minimal` and uses `low` for Easy. Unknown Gemini model families keep their provider defaults rather than receiving a potentially invalid thinking setting, and retain the original provider cap.

Gemini 2.5 Flash keeps numeric `thinkingBudget`: Easy and Medium use zero thinking and need no reserve; Hard and larger Custom limits add the configured thinking budget to the provider cap so the visible target remains available.

## Data Flow

The selected response profile continues to produce one visible token target and one prompt instruction. Every Gemini call path passes the target and model name through the existing `getGeminiOutputOptions` helper. The helper is the only place that adds a hidden reserve and selects the model-compatible thinking control, preventing screenshot and chat behavior from drifting apart.

No response is truncated after generation. Post-generation string truncation could cut code or Markdown in the same way as the current bug. The prompt remains responsible for visible brevity, while the provider cap remains a final safety ceiling.

## Diagnostics and Failure Handling

Gemini generation logs the terminal finish reason and usage metadata when the SDK supplies them. If a response still ends with `MAX_TOKENS`, the application preserves the partial response and logs the condition; it does not silently issue a second paid request.

Transport errors such as `ECONNRESET` remain separate from output truncation. This change does not claim to repair blocked or interrupted access to `generativelanguage.googleapis.com`.

## Tests

Unit tests will cover:

- Gemini 3.5 Flash Easy: `minimal`, 128-token reserve, provider cap 384;
- Gemini 3.5 Flash Medium: `low`, 256-token reserve, provider cap 1024;
- Gemini 3.5 Flash Hard: `medium`, 512-token reserve, provider cap 2560;
- a Gemini 3 model without `minimal` support falling back to `low`;
- Gemini 2.5 Flash preserving zero-thinking Easy/Medium behavior and adding its Hard thinking budget to the provider cap;
- Custom boundary values and an unknown-model no-op fallback;
- all existing response-profile, provider, and UI tests.

Live Gemini generation is optional because it spends the user's API quota and depends on network availability. The deterministic provider-option tests are the required regression check.

## Out of Scope

- Migrating the legacy `@google/generative-ai` dependency to `@google/genai`;
- changing profile labels or their visible token targets;
- automatic continuation or retry of token-limited answers;
- repairing VPN, DNS, TLS, or regional connectivity failures.
