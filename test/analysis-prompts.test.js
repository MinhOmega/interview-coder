const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAnalysisPrompt,
  createUIResponsePrompt,
} = require("../js/analysis-prompts");
const { createDirectAnswerPrompt } = require("../js/direct-answer-prompt");

test("Easy analysis prompt is Russian, compact, and free of the legacy template", () => {
  const prompt = createAnalysisPrompt(1, "ru", "easy", 1024);
  assert.match(prompt, /Respond in Russian/);
  assert.match(prompt, /within 256 output tokens/);
  assert.match(prompt, /at most 12 lines of code/);
  assert.doesNotMatch(prompt, /Analyzing the Problem|My Thoughts|# Implementation|# Complexity|bilingual/i);
});

test("Medium analysis prompt keeps a minimal-patch format", () => {
  const prompt = createAnalysisPrompt(2, "en", "medium", 1024);
  assert.match(prompt, /2 screenshots/);
  assert.match(prompt, /smallest useful patch/);
  assert.match(prompt, /at most 40 lines of code/);
});

test("small UI profiles do not request a full implementation", () => {
  const prompt = createUIResponsePrompt(1, "ru", "easy", 1024);
  assert.match(prompt, /Do not attempt a complete implementation/);
  assert.match(prompt, /within 256 output tokens/);
  assert.doesNotMatch(prompt, /COMPLETE, COMPREHENSIVE/);
});

test("Hard UI profile retains the full implementation task with a hard cap", () => {
  const prompt = createUIResponsePrompt(1, "en", "hard", 1024);
  assert.match(prompt, /COMPLETE, COMPREHENSIVE/);
  assert.match(prompt, /within 2048 output tokens/);
});

test("quick answer prompt uses the same response profile and language", () => {
  const prompt = createDirectAnswerPrompt(1, "ru", "easy", 1024);
  assert.match(prompt, /Respond in Russian/);
  assert.match(prompt, /within 256 output tokens/);
  assert.doesNotMatch(prompt, /Quick Analysis|bilingual/i);
});
