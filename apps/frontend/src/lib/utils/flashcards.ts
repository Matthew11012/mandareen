/**
 * Utility functions for working with flashcards and sentence context.
 */

import { flashcardsApi } from "@/lib/api/flashcards";
import type { Message } from "@/lib/api/conversations";
import { toast } from "sonner";

export type SentenceContext = {
  hanzi?: string;
  pinyin?: string;
  translation?: string;
};

/**
 * Extracts sentence-level context from a message for a given token index.
 * This finds which sentence contains the token and extracts the corresponding
 * hanzi, pinyin (per-character aligned), and translation.
 *
 * @param message - The message containing segments and text
 * @param tokenIndex - The index of the token in the segments array
 * @returns Sentence context object or undefined if context cannot be determined
 *
 * @example
 * ```typescript
 * const context = getSentenceContext(message, 5);
 * // Returns: {
 * //   hanzi: "你好世界",
 * //   pinyin: "nǐ hǎo shì jiè",
 * //   translation: "Hello world"
 * // }
 * ```
 */
export function getSentenceContext(
  message: Message,
  tokenIndex: number
): SentenceContext | undefined {
  // Validate inputs
  if (!Array.isArray(message.segments) || message.segments.length === 0) {
    return undefined;
  }
  if (tokenIndex < 0 || tokenIndex >= message.segments.length) {
    return undefined;
  }

  const messageHanzi = message.hanzi || "";
  const segments = message.segments;

  // Calculate the start position of the token in the message
  const tokenStart = segments
    .slice(0, tokenIndex)
    .reduce((acc, s) => acc + (s.text?.length || 0), 0);

  // Split message into sentences by Chinese and English sentence delimiters
  const hanziSentences = messageHanzi
    .split(/(?<=[。！？!?])/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Find which sentence contains the token
  let accLen = 0;
  let sentenceIdx = 0;
  for (let si = 0; si < hanziSentences.length; si++) {
    const sTxt = hanziSentences[si];
    const sLen = sTxt.length;
    if (tokenStart >= accLen && tokenStart < accLen + sLen) {
      sentenceIdx = si;
      break;
    }
    accLen += sLen;
  }

  // Get the chosen sentence hanzi
  const chosenHanzi =
    sentenceIdx >= 0 && sentenceIdx < hanziSentences.length
      ? hanziSentences[sentenceIdx]
      : hanziSentences[0] || messageHanzi;

  // Build per-character pinyin array aligned to message hanzi
  const pinyinTokens = (message.pinyin || "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const chars = Array.from(messageHanzi);
  const perChar: string[] = new Array(chars.length).fill("");
  let t = 0;
  for (let i = 0; i < chars.length; i++) {
    if (/^[\u3400-\u9FFF]$/.test(chars[i])) {
      perChar[i] = pinyinTokens[t] || "";
      if (pinyinTokens[t]) t++;
    }
  }

  // Extract pinyin for the chosen sentence
  const sentStartInMsg = hanziSentences.slice(0, sentenceIdx).join("").length;
  const sentLen = chosenHanzi.length;
  const chosenPinyin = perChar
    .slice(sentStartInMsg, sentStartInMsg + sentLen)
    .join(" ")
    .trim();

  // Extract corresponding translation sentence
  const transSentences = (message.translation || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chosenTrans =
    sentenceIdx >= 0 &&
    sentenceIdx < transSentences.length &&
    transSentences[sentenceIdx]
      ? transSentences[sentenceIdx]
      : undefined;

  return {
    hanzi: chosenHanzi,
    pinyin: chosenPinyin,
    translation: chosenTrans,
  };
}

/**
 * Adds a single word to flashcards with optional sentence context.
 * Shows success/error toast notifications.
 *
 * @param hanzi - The Chinese word (hanzi) to add
 * @param context - Optional sentence context (hanzi, pinyin, translation)
 * @returns Promise that resolves when the flashcard is created
 *
 * @example
 * ```typescript
 * await addSingleToFlashcards("你", {
 *   hanzi: "你好",
 *   pinyin: "nǐ hǎo",
 *   translation: "Hello"
 * });
 * ```
 */
export async function addSingleToFlashcards(
  hanzi: string,
  context?: SentenceContext
): Promise<void> {
  try {
    await flashcardsApi.createWithSentenceContext({
      hanzi: hanzi.trim(),
      sentenceHanzi: context?.hanzi,
      sentencePinyin: context?.pinyin,
      sentenceTranslation: context?.translation,
    });
    toast.success("Added to flashcards");
  } catch (error) {
    toast.error("Failed to add to flashcards");
    // Re-throw to allow caller to handle if needed
    throw error;
  }
}
