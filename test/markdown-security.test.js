const assert = require("node:assert/strict");
const test = require("node:test");

const { processMarkdown, markdownProcess } = require("../js/markdown-processor");

test("rendered Markdown removes executable HTML and unsafe links", async () => {
  const previousDocument = global.document;
  global.document = {
    createElement() {
      return { innerHTML: "", querySelectorAll: () => [] };
    },
  };

  try {
    const html = await processMarkdown(
      '# Heading\n\n<img src=x onerror="alert(1)">\n\n<script>alert(2)</script>\n\n[bad](javascript:alert(3))\n\n```js\nconst answer = 42;\n```',
    );

    assert.match(html, /<h1/);
    assert.match(html, /language-js/);
    assert.match(html, /href="#markdown-heading"/);
    assert.match(html, /id="markdown-heading"/);
    assert.doesNotMatch(html, /<img|onerror|<script|javascript:/i);
  } finally {
    global.document = previousDocument;
  }
});

test("safe Markdown links remain visible", async () => {
  const previousDocument = global.document;
  global.document = {
    createElement() {
      return { innerHTML: "", querySelectorAll: () => [] };
    },
  };

  try {
    const html = await processMarkdown("[docs](https://example.com/docs)");
    assert.match(html, /href="https:\/\/example\.com\/docs"/);
  } finally {
    global.document = previousDocument;
  }
});

test("fallback Markdown never returns executable markup", () => {
  const previousDocument = global.document;
  global.document = {
    createElement() {
      return { innerHTML: "" };
    },
  };

  try {
    const html = markdownProcess('<svg onload="alert(1)"></svg>\n\n[bad](javascript:alert(2))');
    assert.doesNotMatch(html, /<svg|onload|javascript:/i);
  } finally {
    global.document = previousDocument;
  }
});
