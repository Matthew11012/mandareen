/**
 * Utility functions for working with text segments.
 */

export type Segment = {
  text: string;
  startIndex: number;
  endIndex: number;
  isWord: boolean;
  pinyin?: string;
};

/**
 * Builds fallback segments from hanzi and pinyin strings when backend segments are not available.
 * This creates interactive word-level segments for UI components like TokenRenderer.
 *
 * @param hanzi - The Chinese text (hanzi) to segment
 * @param pinyin - Optional pinyin string with space-separated syllables
 * @returns Array of segments with indices, word flags, and pinyin mapping
 *
 * @example
 * ```typescript
 * const segments = buildFallbackSegments("你好世界", "nǐ hǎo shì jiè");
 * // Returns: [
 * //   { text: "你", startIndex: 0, endIndex: 1, isWord: true, pinyin: "nǐ" },
 * //   { text: "好", startIndex: 1, endIndex: 2, isWord: true, pinyin: "hǎo" },
 * //   { text: "世", startIndex: 2, endIndex: 3, isWord: true, pinyin: "shì" },
 * //   { text: "界", startIndex: 3, endIndex: 4, isWord: true, pinyin: "jiè" }
 * // ]
 * ```
 */
export function buildFallbackSegments(
  hanzi: string,
  pinyin?: string
): Segment[] {
  const chars = Array.from(hanzi || "");
  const ps = (pinyin || "").split(/\s+/).filter(Boolean);
  let pi = 0;
  const isCJK = (ch: string) => /[\u3400-\u9FFF]/.test(ch);
  const segs: Segment[] = [];
  let buffer = "";
  let bufStart = 0;

  const flushBuffer = (idx: number) => {
    if (buffer.length > 0) {
      segs.push({
        text: buffer,
        startIndex: bufStart,
        endIndex: idx,
        isWord: false,
      });
      buffer = "";
    }
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (isCJK(ch)) {
      flushBuffer(i);
      segs.push({
        text: ch,
        startIndex: i,
        endIndex: i + 1,
        isWord: true,
        pinyin: ps[pi++] || "",
      });
    } else {
      if (buffer.length === 0) bufStart = i;
      buffer += ch;
    }
  }
  flushBuffer(chars.length);
  return segs;
}

