let unified, remarkGfm, remarkParse, remarkRehype, rehypeRaw, rehypeStringify;
let rehypeSlug, rehypeAutolinkHeadings, rehypePrismPlus, rehypeFormat;

// Using a try-catch for each import to gracefully handle any import failures
try {
  // For unified, we're accessing the specific unified function
  unified = require("unified").unified;
} catch (error) {
  console.error("Error importing unified:", error);
  unified = null;
}

// Helper function to safely import modules
function safeImport(moduleName, exportName = 'default') {
  try {
    const module = require(moduleName);
    // Some modules use named exports, others use default
    return module[exportName] || module;
  } catch (error) {
    console.error(`Error importing ${moduleName}:`, error);
    return null;
  }
}

// Import all dependencies safely
remarkGfm = safeImport("remark-gfm");
remarkParse = safeImport("remark-parse");
remarkRehype = safeImport("remark-rehype");
rehypeRaw = safeImport("rehype-raw");
rehypeStringify = safeImport("rehype-stringify");
rehypeSlug = safeImport("rehype-slug");
rehypeAutolinkHeadings = safeImport("rehype-autolink-headings");
rehypePrismPlus = safeImport("rehype-prism-plus");
rehypeFormat = safeImport("rehype-format");

// Create the processor only if all imports were successful
let processor = null;

if (unified && remarkParse && remarkGfm && remarkRehype && 
    rehypeRaw && rehypeSlug && rehypeAutolinkHeadings && 
    rehypePrismPlus && rehypeFormat && rehypeStringify) {
  
  console.log("Successfully initialized all markdown processor dependencies");
  
  processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings)
    .use(rehypePrismPlus)
    .use(rehypeFormat)
    .use(rehypeStringify);
  
  console.log("Markdown processor successfully created");
} else {
  console.warn("Failed to initialize markdown processor - some dependencies couldn't be loaded");
}

/**
 * Process markdown content into HTML with proper syntax highlighting
 * @param {string} markdown - Raw markdown content
 * @returns {Promise<string>} - HTML content
 */
async function processMarkdown(markdown) {
  try {
    // Check if we have any content to process
    if (!markdown || markdown.trim() === "") {
      return "";
    }

    let html = "";
    // If processor initialization failed, use the fallback
    if (!processor) {
      console.warn("Using fallback markdown processor due to missing dependencies");
      html = markdownProcess(markdown);
    } else {
      try {
        // Process the markdown with unified processor
        const file = await processor.process(markdown);
        html = String(file);
      } catch (err) {
        console.error("Error using unified processor:", err);
        // Fall back to our custom markdown processor
        html = markdownProcess(markdown);
      }
    }

    // Post-process the HTML to add styling and interactivity
    const tempWrapper = document.createElement("div");
    tempWrapper.innerHTML = html;

    // Add class to inline code elements if not already present
    tempWrapper.querySelectorAll("code:not([class])").forEach((codeEl) => {
      // Skip if inside a pre element (block code)
      if (codeEl.parentElement.tagName !== "PRE") {
        codeEl.classList.add("inline-code");
      }
    });

    // Add table styling for better display
    tempWrapper.querySelectorAll("table").forEach((tableEl) => {
      tableEl.classList.add("markdown-table");

      // Add wrapper for responsive tables
      if (!tableEl.parentElement.classList.contains("table-wrapper")) {
        const tableWrapper = document.createElement("div");
        tableWrapper.classList.add("table-wrapper");
        tableEl.parentNode.insertBefore(tableWrapper, tableEl);
        tableWrapper.appendChild(tableEl);
      }
    });

    // Style table headers
    tempWrapper.querySelectorAll("thead").forEach((theadEl) => {
      theadEl.classList.add("markdown-thead");
    });

    // Style table cells
    tempWrapper.querySelectorAll("td, th").forEach((cellEl) => {
      cellEl.classList.add("markdown-cell");
    });

    // Find all pre > code elements and wrap them with copy button and language tag
    tempWrapper.querySelectorAll("pre > code").forEach((codeBlock) => {
      const pre = codeBlock.parentNode;

      // Skip if already processed
      if (pre.parentNode && pre.parentNode.classList.contains("code-block-container")) {
        return;
      }

      const container = document.createElement("div");
      container.className = "code-block-container";

      // Create copy button
      const copyButton = document.createElement("button");
      copyButton.className = "copy-code-button";
      copyButton.textContent = "Copy";

      // Extract language from class
      let language = "";
      if (codeBlock.className) {
        const langMatch = codeBlock.className.match(/language-(\w+)/);
        if (langMatch && langMatch[1]) {
          language = langMatch[1];

          // Create language tag
          const langTag = document.createElement("div");
          langTag.className = "code-language-tag";
          langTag.textContent = language;
          container.appendChild(langTag);
        }
      }

      // Move the pre element into the container
      pre.parentNode.insertBefore(container, pre);
      container.appendChild(copyButton);
      container.appendChild(pre);
    });

    return tempWrapper.innerHTML;
  } catch (err) {
    console.error("Error in markdown processing:", err);
    return `<p class="error-message">Error processing markdown: ${err.message}</p>`;
  }
}

/**
 * Fallback markdown processor using regex for when unified fails
 * @param {string} markdown - Raw markdown content
 * @returns {string} - HTML content
 */
function markdownProcess(markdown) {
  // First safely handle HTML elements while preserving HTML tags like <sup>
  const safeMarkdown = markdown
    // Code blocks with language - escape HTML inside code blocks
    .replace(/```(\w+)\n([\s\S]*?)```/g, (_, lang, code) => {
      return "```" + lang + "\n" + code.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "\n```";
    })
    // Code blocks without language - escape HTML inside code blocks
    .replace(/```\n([\s\S]*?)```/g, (_, code) => {
      return "```\n" + code.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "\n```";
    })
    // Inline code blocks - escape HTML within them
    .replace(/`([^`]+)`/g, (_, code) => {
      return "`" + code.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "`";
    });

  // Create a temp div to handle HTML strings safely
  const tempDiv = document.createElement("div");

  // Process the markdown with HTML preserved
  let processedContent = safeMarkdown
    // Code blocks with language
    .replace(/```(\w+)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    })
    // Code blocks without language
    .replace(/```\n([\s\S]*?)```/g, (_, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    })
    // Inline code blocks
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Headers
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Lists
    .replace(/^\* (.+)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)\n/g, "<ul>$1</ul>")
    // Links
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    // Tables - table header row
    .replace(/\|(.+)\|\s*\n\|(\s*:?-+:?\s*\|)+\s*\n/gm, (match, headerRow) => {
      const headers = headerRow
        .split("|")
        .map((header) => header.trim())
        .filter(Boolean);
      let headerHTML = '<div class="table-wrapper"><table class="markdown-table"><thead class="markdown-thead"><tr>';

      headers.forEach((header) => {
        headerHTML += `<th class="markdown-cell">${header}</th>`;
      });

      headerHTML += "</tr></thead><tbody>";
      return headerHTML;
    })
    // Tables - table rows
    .replace(/\|(.+)\|\s*\n/gm, (match, rowContent) => {
      // Skip if it's a separator row with dashes
      if (rowContent.match(/^\s*:?-+:?\s*\|/)) {
        return "";
      }

      const cells = rowContent
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
      let rowHTML = "<tr>";

      cells.forEach((cell) => {
        rowHTML += `<td class="markdown-cell">${cell}</td>`;
      });

      rowHTML += "</tr>";
      return rowHTML;
    })
    // Close table tags
    .replace(/<\/tr>\s*(?!<tr>|<\/tbody>)/g, "</tr></tbody></table></div>")
    // Paragraphs
    .replace(/\n\n/g, "</p><p>");

  tempDiv.innerHTML = processedContent;

  // Fix any broken HTML structure
  if (!processedContent.startsWith("<p>")) {
    processedContent = "<p>" + processedContent;
  }
  if (!processedContent.endsWith("</p>")) {
    processedContent = processedContent + "</p>";
  }

  return processedContent;
}

// Export the relevant functions and variables
module.exports = {
  processor,
  processMarkdown,
  markdownProcess,
  // Also export imported modules for reference if needed
  modules: {
    unified,
    remarkGfm,
    remarkParse,
    remarkRehype,
    rehypeRaw,
    rehypeStringify,
    rehypeSlug,
    rehypeAutolinkHeadings,
    rehypePrismPlus,
    rehypeFormat
  }
}; 