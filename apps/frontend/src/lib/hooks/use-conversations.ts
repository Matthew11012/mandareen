"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationsApi, type ConversationSummary, type Message } from "@/lib/api/conversations";

const qk = {
  conversations: ["conversations"] as const,
  messages: (id: number) => ["conversations", id, "messages"] as const,
};

export function useConversationsList() {
  return useQuery({
    queryKey: qk.conversations,
    queryFn: () => conversationsApi.list(),
  });
}

export function useMessages(conversationId: number | null) {
  return useQuery({
    queryKey: conversationId ? qk.messages(conversationId) : ["messages", "none"],
    queryFn: () => conversationsApi.listMessages(conversationId as number),
    enabled: typeof conversationId === "number" && conversationId > 0,
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => conversationsApi.start(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => conversationsApi.delete(id),
    onSuccess: async (_res, id) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.conversations }),
        qc.removeQueries({ queryKey: qk.messages(id) }),
      ]);
    },
  });
}

export function useSendMessage() {
  return useMutation({
    mutationFn: (params: { id: number; hanzi: string }) =>
      conversationsApi.send(params.id, params.hanzi),
  });
}

export function useSendAudio() {
  return useMutation({
    mutationFn: (params: { id: number; audio: Blob }) =>
      conversationsApi.sendAudio(params.id, params.audio),
  });
}

// Helpers for client-side preview enrichment (same behavior left to caller to trigger)
export function sortConversationsByStartedAt(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}


