import React, { useEffect, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeReact from 'rehype-react';
import rehypeSanitize from 'rehype-sanitize';
import { unified } from 'unified';
import { createElement } from 'react';

export interface ResultContentProps {
  markdownContent: string;
}

export const ResultContent: React.FC<ResultContentProps> = ({ markdownContent }) => {
  const resultContentRef = useRef<HTMLDivElement>(null);

  // Function to render code blocks with syntax highlighting
  const CodeBlock = ({ className, children }: { className?: string; children: string }) => {
    // Extract language from className (e.g., "language-javascript")
    const language = className ? className.replace('language-', '') : 'text';
    
    return (
      <div className="code-block-container">
        {language !== 'text' && (
          <div className="code-language-tag">{language}</div>
        )}
        <button
          className="copy-code-button"
          onClick={() => handleCopyCode(children)}
        >
          Copy
        </button>
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            backgroundColor: 'rgba(25, 25, 25, 0.97)',
            margin: 0,
            padding: '16px',
            borderRadius: '6px',
            fontSize: '14px',
            lineHeight: '1.5',
          }}
        >
          {children}
        </SyntaxHighlighter>
      </div>
    );
  };

  // Handle code copying
  const handleCopyCode = (code: string) => {
    try {
      navigator.clipboard.writeText(code).then(() => {
        // Find the button that was clicked and update its text
        const button = document.activeElement as HTMLButtonElement;
        if (button && button.classList.contains('copy-code-button')) {
          const originalText = button.textContent;
          button.textContent = 'Copied!';
          button.classList.add('copied');
          
          setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
          }, 2000);
        }
      });
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  // Set up the markdown processor with our custom components
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSanitize)
    // @ts-ignore - Type issue with the rehypeReact plugin, but it works correctly
    .use(rehypeReact, {
      createElement,
      components: {
        pre: ({ children }: { children: React.ReactNode }) => children, // Pass through to code
        code: ({ className, children }: { className?: string; children: string }) => {
          if (className) {
            return <CodeBlock className={className}>{String(children)}</CodeBlock>;
          }
          return <code>{children}</code>;
        }
      }
    });

  // Effect to scroll to the bottom when content changes
  useEffect(() => {
    if (resultContentRef.current) {
      const element = resultContentRef.current;
      element.scrollTop = element.scrollHeight;
    }
  }, [markdownContent]);

  // Render the markdown content
  const renderContent = () => {
    if (!markdownContent || markdownContent.trim() === '') {
      return null;
    }

    try {
      // Process the markdown with our unified processor
      const content = processor.processSync(markdownContent).result;
      return content;
    } catch (error) {
      console.error('Error rendering markdown:', error);
      return (
        <>
          <div className="error-message">Error rendering content: {String(error)}</div>
          <pre>{markdownContent}</pre>
        </>
      );
    }
  };

  return (
    <div className="result-content" ref={resultContentRef}>
      {renderContent()}
    </div>
  );
}; 