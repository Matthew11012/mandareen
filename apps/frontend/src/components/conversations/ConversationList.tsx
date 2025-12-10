"use client";

import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import type { ConversationSummary } from "@/lib/api/conversations";

// Enriched conversation type with optional preview
export type EnrichedConversation = ConversationSummary & { preview?: string };

interface ConversationListProps {
  conversations: EnrichedConversation[];
  activeConversationId: number | null;
  onSelectConversation: (id: number) => void;
  onDeleteConversation: (id: number, triggerElement: HTMLElement) => void;
  onNewConversation: () => void;
  isMobile: boolean;
  showSidebar: boolean;
  onCloseSidebar: () => void;
  loadingPreviews: boolean;
}

// Format conversation date for display
const formatConversationDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  isMobile,
  showSidebar,
  onCloseSidebar,
  loadingPreviews,
}: ConversationListProps) {
  // Group conversations by time period
  const groupedConversations = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recent: EnrichedConversation[] = [];
    const lastMonth: EnrichedConversation[] = [];
    const older: EnrichedConversation[] = [];

    conversations.forEach((c) => {
      const date = new Date(c.startedAt);
      if (date >= weekAgo) {
        recent.push(c);
      } else if (date >= monthAgo) {
        lastMonth.push(c);
      } else {
        older.push(c);
      }
    });

    return { recent, lastMonth, older };
  }, [conversations]);

  const handleSelectConversation = (id: number) => {
    onSelectConversation(id);
    if (isMobile) {
      onCloseSidebar();
    }
  };

  const handleDeleteClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    id: number
  ) => {
    e.stopPropagation();
    onDeleteConversation(id, e.currentTarget);
  };

  const handleSelectKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    id: number
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void handleSelectConversation(id);
    }
  };

  const renderConversationGroup = (
    conversations: EnrichedConversation[],
    title: string
  ) => {
    if (conversations.length === 0) return null;

    return (
      <>
        <div className="text-[10px] uppercase tracking-wide text-[#8a8f99] px-3 py-1.5 mt-2 font-bold opacity-70">
          {title}
        </div>
        {conversations.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => handleSelectConversation(c.id)}
            onKeyDown={(e) => handleSelectKeyDown(e, c.id)}
            className={`group w-full px-3 py-3 rounded-xl text-left transition-all duration-200 relative overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10] ${
              activeConversationId === c.id
                ? "bg-white/10 text-white shadow-lg shadow-black/20"
                : "text-[#a6a6a6] hover:bg-white/5 hover:text-white"
            }`}
            data-conversation-id={c.id}
          >
            {activeConversationId === c.id && (
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#4040f2]" />
            )}
            <div className="flex items-center justify-between gap-2 pl-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {c.preview || "New conversation"}
                </div>
                <div className="text-[10px] opacity-60 mt-0.5">
                  {formatConversationDate(c.startedAt)}
                </div>
              </div>
              <button
                type="button"
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#0b0c10] cursor-pointer ${
                  activeConversationId === c.id
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100"
                }`}
                onClick={(e) => handleDeleteClick(e, c.id)}
                aria-label="Delete conversation"
              >
                <Trash2 className="w-4 h-4 text-red-400 hover:text-red-300" />
              </button>
            </div>
          </div>
        ))}
      </>
    );
  };

  return (
    <aside
      className={`bg-[#16181d] md:bg-transparent border-r md:border-none border-[#2a2e36] md:p-0 flex flex-col gap-4 transition-all duration-300 ease-in-out ${
        isMobile
          ? `fixed inset-y-0 left-0 z-50 w-72 p-4 ${
              showSidebar ? "translate-x-0 shadow-2xl" : "-translate-x-full"
            }`
          : showSidebar
            ? "w-64 shrink-0"
            : "w-0 shrink-0 opacity-0 overflow-hidden"
      }`}
    >
      <div className="flex items-center justify-between px-1 md:hidden">
        <span className="text-lg font-bold text-white">Chats</span>
        <button onClick={onCloseSidebar} className="text-[#a6a6a6] p-2">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-1 pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {loadingPreviews && conversations.length === 0 ? (
          <div className="text-xs text-[#808080] px-3 py-2 text-center mt-4">
            Loading...
          </div>
        ) : (
          <>
            {renderConversationGroup(groupedConversations.recent, "Recent")}
            {renderConversationGroup(
              groupedConversations.lastMonth,
              "Last 30 Days"
            )}
            {renderConversationGroup(groupedConversations.older, "Older")}
          </>
        )}
      </div>

      <button
        onClick={() => {
          void onNewConversation();
          if (isMobile) {
            onCloseSidebar();
          }
        }}
        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#4040f2] to-[#3b3bff] text-white text-sm font-semibold shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50 hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer"
      >
        <span className="text-xl leading-none font-light group-hover:rotate-90 transition-transform duration-300">
          +
        </span>
        New Conversation
      </button>
    </aside>
  );
}
