// Shared pinyin utilities

/**
 * Convert numeric pinyin (e.g. "ni3 hao3") to tone marks ("nǐ hǎo").
 * Safe for already-marked strings and handles 'v' as 'ü'.
 */
export function toToneMarks(line?: string): string | undefined {
  if (!line) return undefined;
  try {
    const map: Record<string, string[]> = {
      a: ['ā', 'á', 'ǎ', 'à'],
      e: ['ē', 'é', 'ě', 'è'],
      i: ['ī', 'í', 'ǐ', 'ì'],
      o: ['ō', 'ó', 'ǒ', 'ò'],
      u: ['ū', 'ú', 'ǔ', 'ù'],
      v: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
      ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
    };
    const placeOn = (s: string, tone: number) => {
      for (const ch of ['a', 'e', 'o', 'i', 'u', 'ü']) {
        const idx = s.toLowerCase().indexOf(ch);
        if (idx !== -1) {
          const repl = map[ch]?.[tone];
          if (!repl) return s;
          const marked =
            s.substring(0, idx) +
            (s[idx] === s[idx].toUpperCase() ? repl.toUpperCase() : repl) +
            s.substring(idx + 1);
          return marked;
        }
      }
      return s;
    };
    return line
      .split(/\s+/)
      .map((syll) => {
        const m = syll.match(/^(.*?)([1-5])$/);
        if (!m) return syll.replace(/v/g, 'ü');
        const base = m[1].replace(/v/g, 'ü');
        const toneNum = parseInt(m[2], 10);
        if (toneNum === 5) {
          // Neutral tone: strip the digit and return base without diacritics
          return base;
        }
        const tone = toneNum - 1;
        return placeOn(base, tone);
      })
      .join(' ');
  } catch {
    return line;
  }
}
