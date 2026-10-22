const assert = require("node:assert/strict");
const test = require("node:test");

const { guardNavigation } = require("../js/navigation-guard");

test("renderer navigation and new windows are blocked", () => {
  const handlers = new Map();
  const webContents = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    setWindowOpenHandler(handler) {
      handlers.set("window-open", handler);
    },
  };

  guardNavigation(webContents);

  let blocked = false;
  handlers.get("will-navigate")({ preventDefault() { blocked = true; } });
  assert.equal(blocked, true);
  assert.deepEqual(handlers.get("window-open")(), { action: "deny" });
});
