const assert = require("node:assert/strict");
const test = require("node:test");
const {
  captureScrollState,
  createRenderController,
  restoreScrollState,
} = require("../js/render-controller");

test("captures and restores bottom-following intent", () => {
  const container = { scrollHeight: 1000, clientHeight: 300, scrollTop: 680 };
  const state = captureScrollState(container, 30);
  assert.equal(state.nearBottom, true);

  container.scrollHeight = 1400;
  restoreScrollState(container, state);
  assert.equal(container.scrollTop, 1100);
});

test("preserves manual position away from the bottom", () => {
  const container = { scrollHeight: 1000, clientHeight: 300, scrollTop: 250 };
  const state = captureScrollState(container);
  container.scrollHeight = 1500;
  restoreScrollState(container, state);
  assert.equal(container.scrollTop, 250);
});

test("discards an older asynchronous markdown render", async () => {
  const resolvers = new Map();
  const target = { innerHTML: "" };
  const container = { scrollHeight: 100, clientHeight: 100, scrollTop: 0 };
  const controller = createRenderController({
    getContainer: () => container,
    getTarget: () => target,
    renderMarkdown: (text) => new Promise((resolve) => resolvers.set(text, resolve)),
    scheduleFrame: (callback) => callback(),
  });

  controller.update("old");
  controller.update("new");
  resolvers.get("new")("<p>new</p>");
  await Promise.resolve();
  resolvers.get("old")("<p>old</p>");
  await Promise.resolve();

  assert.equal(target.innerHTML, "<p>new</p>");
});
