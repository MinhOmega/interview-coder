const assert = require("node:assert/strict");
const test = require("node:test");
const { getResponseLanguageInstruction } = require("../js/language-instructions");

test("adds a Russian response instruction without translating code identifiers", () => {
  const instruction = getResponseLanguageInstruction("ru");
  assert.match(instruction, /Respond in Russian/);
  assert.match(instruction, /identifiers/);
});

test("does not add an instruction for English or unknown languages", () => {
  assert.equal(getResponseLanguageInstruction("en"), "");
  assert.equal(getResponseLanguageInstruction("unknown"), "");
});
