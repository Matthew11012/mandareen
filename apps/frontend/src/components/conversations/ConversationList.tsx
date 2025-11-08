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

  const renderConversationGroup = (
    conversations: EnrichedConversation[],
    title: string
  ) => {
    if (conversations.length === 0) return null;

    return (
      <>
        <div className="text-[10px] uppercase tracking-wide text-[#8a8f99] px-3 py-1.5 mt-2">
          {title} ({conversations.length})
        </div>
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group relative w-full px-3 py-2 rounded-lg border transition-colors duration-150 ${
              activeConversationId === c.id
                ? "bg-[#2d3548] border-[#4040f2] text-[#c7cdff] shadow-sm"
                : "bg-[#20242b] border-[#2e323a] text-[#a6a6a6] hover:bg-[#252932] hover:border-[#4040f2]"
            }`}
            data-conversation-id={c.id}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSelectConversation(c.id);
                }}
                className="flex-1 text-left min-w-0 cursor-pointer"
                title={c.preview || new Date(c.startedAt).toLocaleString()}
                aria-label={`${c.preview || "Conversation"} from ${formatConversationDate(c.startedAt)}`}
              >
                <div className="text-base font-medium truncate w-full">
                  {c.preview || `Conversation #${c.id}`}
                </div>
                <div className="text-[10px] text-[#808080]">
                  {formatConversationDate(c.startedAt)}
                </div>
              </button>
              <button
                onClick={(e) => handleDeleteClick(e, c.id)}
                className={`flex items-center justify-center w-6 h-6 rounded transition-colors duration-150 cursor-pointer touch-manipulation ${
                  activeConversationId === c.id
                    ? "text-[#c7cdff] hover:bg-red-600/20 hover:text-red-400"
                    : "text-[#808080] hover:bg-red-600/20 hover:text-red-400"
                }`}
                aria-label="Delete conversation"
                title="Delete conversation"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </>
    );
  };

  return (
    <aside
      className={`bg-[#1b1f26] border border-[#2a2e36] md:rounded-xl p-3 flex flex-col gap-3 transition-all duration-300 ease-in-out ${
        isMobile
          ? `fixed inset-y-0 left-0 z-50 w-64 ${
              showSidebar ? "translate-x-0" : "-translate-x-full"
            }`
          : showSidebar
            ? "w-64 shrink-0"
            : "w-64 shrink-0"
      }`}
    >
      <div className="px-2 text-xs uppercase tracking-wide text-[#8a8f99]">
        Conversations
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto max-h-[75vh] pr-1">
        {loadingPreviews && conversations.length === 0 ? (
          <div className="text-xs text-[#808080] px-3 py-2">
            Loading conversations...
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
        className="mt-auto w-full py-2 rounded-lg bg-[#4040f2] text-white text-sm hover:bg-[#3636d9] cursor-pointer"
      >
        + New Conversation
      </button>
    </aside>
  );
}
