import React from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Permits only absolute https URLs. Anything else — javascript:, data:,
 * relative, or malformed — is treated as unsafe so the link is rendered as
 * inert text rather than a clickable anchor. Markdown is AI-generated, so
 * its hrefs are untrusted input.
 */
function isSafeHref(href: string | undefined): href is string {
  if (!href) return false;
  try {
    return new URL(href).protocol === 'https:';
  } catch {
    return false;
  }
}

const components: Components = {
  a: ({ href, children, node: _node, ...props }) => {
    if (!isSafeHref(href)) {
      return <span {...props}>{children}</span>;
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  }
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => (
  <div className={`markdown-body ${className ?? ''}`.trim()}>
    <Markdown remarkPlugins={[remarkGfm]} components={components}>{content}</Markdown>
  </div>
);
