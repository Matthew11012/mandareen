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
export function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-white mt-4 mb-2 scroll-mt-24">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold text-white mt-3 mb-2 scroll-mt-24">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-white mt-2 mb-1 scroll-mt-24">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-semibold text-white/90 mt-2 mb-1 scroll-mt-24 tracking-tight">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-sm font-semibold text-white/80 mt-1 mb-1 scroll-mt-24 uppercase tracking-wide">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-xs font-medium text-white/70 mt-1 mb-1 scroll-mt-24 tracking-wide">
              {children}
            </h6>
          ),
          p: ({ children }) => (
            <p className="text-white/80 leading-relaxed mb-3 [&:last-child]:mb-0 [&:only-child]:mb-0">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="text-white font-semibold">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="text-white/90 italic">{children}</em>
          ),
          ul: ({ children }) => (
            <ul
              className="list-disc space-y-1 mb-3 text-white/80 pl-6
              [&_ul]:list-[circle] [&_ul_ul]:list-[square] [&_ul_ul_ul]:list-[disc]
              [&_ol]:list-decimal [&_ol_ol]:list-[lower-alpha] [&_ol_ol_ol]:list-[lower-roman]"
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              className="list-decimal space-y-1 mb-3 text-white/80 pl-6
              [&_ol]:list-[lower-alpha] [&_ol_ol]:list-[lower-roman] [&_ol_ol_ol]:list-[decimal]
              [&_ul]:list-[circle] [&_ul_ul]:list-[square]"
            >
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed [&>p]:mb-1 [&>p]:mt-0 [&>p]:inline [&>strong]:font-semibold pl-1">
              {children}
            </li>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
              <table className="min-w-full border-collapse border border-[#4040f2]/12 rounded-lg overflow-hidden bg-[#131b33] shadow-md shadow-[#4040f2]/12">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#4040f2]/60 text-white">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="[&_tr:nth-child(even)]:bg-[#4040f2]/20">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-[#4040f2]/20 last:border-b-0">
              {children}
            </tr>
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
            <td className="px-3 py-2 text-white/90 text-sm">{children}</td>
          ),
          code: ({ children, className }) => {
            const isBlock = Boolean(className?.includes("language-"));
            if (isBlock) {
              return (
                <code className="block bg-[#0f1628] border border-[#4040f2]/18 rounded-lg p-3 text-sm font-mono text-white/90 overflow-x-auto mb-3 shadow-md shadow-[#4040f2]/10">
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-[#4040f2]/18 px-1.5 py-0.5 rounded text-sm font-mono text-white shadow-sm shadow-[#4040f2]/20">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-[#0f1628] border border-[#4040f2]/18 rounded-lg p-3 overflow-x-auto mb-3 shadow-md shadow-[#4040f2]/10">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#4040f2]/50 bg-[#4040f2]/8 pl-4 py-2 mb-3 text-white/80 italic rounded-md">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-[#4040f2]/20 my-4" />,
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-[#aab4ff] hover:text-white underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0f14] rounded"
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
    </div>
  );
}
