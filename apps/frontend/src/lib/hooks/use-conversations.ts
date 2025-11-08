"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
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
    onMutate: async () => {
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: qk.conversations });
      // Snapshot previous value
      const previous = qc.getQueryData<ConversationSummary[]>(qk.conversations);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        qc.setQueryData(qk.conversations, context.previous);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => conversationsApi.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.conversations });
      await qc.cancelQueries({ queryKey: qk.messages(id) });
      
      const previousConversations = qc.getQueryData<ConversationSummary[]>(qk.conversations);
      const previousMessages = qc.getQueryData<Message[]>(qk.messages(id));
      
      // Optimistically remove conversation
      if (previousConversations) {
        qc.setQueryData(
          qk.conversations,
          previousConversations.filter((c) => c.id !== id)
        );
      }
      
      return { previousConversations, previousMessages, deletedId: id };
    },
    onError: (_err, id, context) => {
      // Rollback on error
      if (context?.previousConversations) {
        qc.setQueryData(qk.conversations, context.previousConversations);
      }
      if (context?.previousMessages) {
        qc.setQueryData(qk.messages(id), context.previousMessages);
      }
    },
    onSuccess: async (_res, id) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.conversations }),
        qc.removeQueries({ queryKey: qk.messages(id) }),
      ]);
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: number; hanzi: string }) =>
      conversationsApi.send(params.id, params.hanzi),
    onMutate: async ({ id, hanzi }) => {
      await qc.cancelQueries({ queryKey: qk.messages(id) });
      
      const previous = qc.getQueryData<Message[]>(qk.messages(id));
      
      // Optimistically add user message
      const tempUser: Message = {
        id: Date.now(),
        role: "user",
        hanzi,
        pinyin: "",
        translation: "",
        createdAt: new Date().toISOString(),
        _loadingPinyin: true,
        _loadingTranslation: true,
      };
      
      if (previous) {
        qc.setQueryData(qk.messages(id), [...previous, tempUser]);
      }
      
      return { previous, tempUser, conversationId: id };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) {
        qc.setQueryData(qk.messages(id), context.previous);
      }
    },
    onSuccess: async ({ user }, { id }, context) => {
      // Replace temp user with server user
      const current = qc.getQueryData<Message[]>(qk.messages(id));
      if (current && context?.tempUser) {
        qc.setQueryData(
          qk.messages(id),
          current.map((m) => (m.id === context.tempUser.id ? user : m))
        );
      }
    },
  });
}

export function useSendAudio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: number; audio: Blob }) =>
      conversationsApi.sendAudio(params.id, params.audio),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: qk.messages(id) });
      
      const previous = qc.getQueryData<Message[]>(qk.messages(id));
      
      return { previous, conversationId: id };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) {
        qc.setQueryData(qk.messages(id), context.previous);
      }
    },
    onSuccess: async ({ user }, { id }) => {
      // Add user message with loading flags
      const current = qc.getQueryData<Message[]>(qk.messages(id));
      if (current) {
        const userMessageWithLoading: Message = {
          ...user,
          _loadingPinyin: true,
          _loadingTranslation: true,
        };
        qc.setQueryData(qk.messages(id), [...current, userMessageWithLoading]);
      }
    },
  });
}

export function useUpdateMessagesCache() {
  const queryClient = useQueryClient();
  
  return useCallback((conversationId: number, updater: (prev: Message[]) => Message[]) => {
    queryClient.setQueryData<Message[]>(
      qk.messages(conversationId),
      (old) => updater(old ?? [])
    );
  }, [queryClient]);
}

// Helpers for client-side preview enrichment (same behavior left to caller to trigger)
export function sortConversationsByStartedAt(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}


