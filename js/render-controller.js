function captureScrollState(container, threshold = 80) {
  if (!container) return { nearBottom: false, scrollTop: 0 };
  const distanceFromBottom = container.scrollHeight - container.clientHeight - container.scrollTop;
  return {
    nearBottom: distanceFromBottom <= threshold,
    scrollTop: container.scrollTop,
  };
}

function restoreScrollState(container, state) {
  if (!container || !state) return;
  const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = state.nearBottom ? maximum : Math.min(state.scrollTop, maximum);
}

function createRenderController({
  getContainer,
  getTarget,
  renderMarkdown,
  afterApply = () => {},
  scheduleFrame = (callback) => requestAnimationFrame(callback),
}) {
  let generation = 0;
  let scheduled = false;
  let pendingText = "";

  async function commit(text, token) {
    const html = await renderMarkdown(text);
    if (token !== generation) return false;

    const container = getContainer();
    const target = getTarget();
    if (!container || !target) return false;

    const scrollState = captureScrollState(container);
    target.innerHTML = html;
    afterApply(target);
    restoreScrollState(container, scrollState);
    return true;
  }

  function update(text) {
    pendingText = text;
    generation += 1;
    if (scheduled) return generation;

    scheduled = true;
    scheduleFrame(() => {
      scheduled = false;
      const token = generation;
      const textToRender = pendingText;
      void commit(textToRender, token);
    });
    return generation;
  }

  async function renderNow(text) {
    pendingText = text;
    generation += 1;
    return commit(text, generation);
  }

  function reset() {
    generation += 1;
    pendingText = "";
  }

  return { renderNow, reset, update };
}

module.exports = {
  captureScrollState,
  createRenderController,
  restoreScrollState,
};
