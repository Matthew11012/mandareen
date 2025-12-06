"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type MarkdownRendererProps = {
  content: string;
  className?: string;
};

/**
 * Accessible Markdown renderer with GFM support.
 * Keeps consistent styling and semantics for curriculum content.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={cn("markdown-content", className)}
      components={{
        h1: ({ children }) => (
          <h1 className="text-xl font-bold text-white mt-4 mb-2 scroll-mt-24">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-semibold text-white mt-3 mb-2 scroll-mt-24">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-white mt-2 mb-1 scroll-mt-24">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="text-white/80 leading-relaxed mb-3">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="text-white font-semibold">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="text-white/90 italic">{children}</em>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-1 mb-3 text-white/80 ml-2">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-1 mb-3 text-white/80 ml-2">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        table: ({ children }) => (
          <div className="overflow-x-auto mb-3">
            <table className="min-w-full border-collapse border border-white/20 rounded-lg overflow-hidden">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-white/10">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-white/10 last:border-b-0">{children}</tr>
        ),
        th: ({ children }) => (
          <th
            scope="col"
            className="px-3 py-2 text-left text-white font-semibold text-sm"
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-white/80 text-sm">{children}</td>
        ),
        code: ({ children, className }) => {
          const isBlock = Boolean(className?.includes("language-"));
          if (isBlock) {
            return (
              <code className="block bg-white/5 rounded-lg p-3 text-sm font-mono text-white/90 overflow-x-auto mb-3">
                {children}
              </code>
            );
          }
          return (
            <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono text-blue-300">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-white/5 rounded-lg p-3 overflow-x-auto mb-3">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-blue-500/50 pl-4 py-1 mb-3 text-white/70 italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-white/10 my-4" />,
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0f14] rounded"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

