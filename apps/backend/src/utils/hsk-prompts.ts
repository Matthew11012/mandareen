export const HSK_PROMPT_APPENDERS = {
  hsk1: "Constrain vocabulary to HSK1 (~150 high-frequency words). Replies should use only very short SVO phrases or one-line answers; do not use subordinate clauses or idioms. Responses may simplify further depending on the user's input or confidence.",
  hsk2: 'Constrain vocabulary to HSK2 (~300 words). Replies may range from single phrases to short compound sentences (≤2 clauses) with simple connectors (和、但是、因为); simplify or expand within this band according to conversational context.',
  hsk3: "Constrain vocabulary to HSK3 (~600 words). Replies may range from short phrases to 1–2 sentence paragraphs using basic subordinate clauses (因为/如果/所以); scale complexity up or down within this band based on the user's engagement.",
  hsk4: 'Constrain vocabulary to HSK4 (~1,200 words). Replies may scale up to natural multi-clause sentences and occasional concise idiomatic turns, but may be simpler for light conversation or when the user shows difficulty; adapt within the HSK4 band.',
  hsk5: 'Constrain vocabulary to HSK5 (~2,500 words). Replies may use fluent, idiomatic phrasing and varied structures up to HSK5 complexity, while simplifying when the conversation is casual or the user requests easier language.',
  hsk6: 'Constrain vocabulary to HSK6 (~5,000 words). Replies may employ near-native phrasing, nuanced expressions, and sophisticated connectors up to HSK6 complexity, but should adapt to simpler forms when appropriate.',
  hsk7_9:
    'Constrain vocabulary to the advanced band (HSK7–9). Replies may use academic, professional, or research-level lexical choices and concise advanced idioms condensed into short answers; simplify register if the user’s input indicates a need.',
} as const;

export type HskPromptKey = keyof typeof HSK_PROMPT_APPENDERS;

const HSK_ALIAS_MAP: Record<string, HskPromptKey> = {
  hsk1: 'hsk1',
  '1': 'hsk1',
  hsk2: 'hsk2',
  '2': 'hsk2',
  hsk3: 'hsk3',
  '3': 'hsk3',
  hsk4: 'hsk4',
  '4': 'hsk4',
  hsk5: 'hsk5',
  '5': 'hsk5',
  hsk6: 'hsk6',
  '6': 'hsk6',
  hsk7: 'hsk7_9',
  hsk8: 'hsk7_9',
  hsk9: 'hsk7_9',
  hsk7_9: 'hsk7_9',
  'hsk7-9': 'hsk7_9',
  '7-9': 'hsk7_9',
  '7_9': 'hsk7_9',
  '7': 'hsk7_9',
  '8': 'hsk7_9',
  '9': 'hsk7_9',
  advanced: 'hsk7_9',
  advancedband: 'hsk7_9',
};

/**
 * Normalizes a string-based HSK selection (e.g., "hsk1", "1", "HSK 2") to a prompt key.
 * Used by conversations service which receives string inputs from the frontend.
 */
export const normalizeHskSelection = (
  value?: string | null,
): HskPromptKey | null => {
  if (!value) return null;
  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[–—−]/g, '-');
  return HSK_ALIAS_MAP[normalized] ?? null;
};

/**
 * Maps a numeric HSK level (1-7) to the corresponding prompt fragment.
 * Used by lesson generation which receives numeric levels from the frontend.
 * - Levels 1-6 map to hsk1-hsk6
 * - Level 7 (or any level >= 7) maps to hsk7_9
 * Returns null if level is invalid or not provided.
 */
export const getHskPromptFragment = (
  level: number | null | undefined,
): string | null => {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 1) {
    return null;
  }

  let key: HskPromptKey;
  if (level >= 7) {
    key = 'hsk7_9';
  } else if (level >= 1 && level <= 6) {
    key = `hsk${level}` as HskPromptKey;
  } else {
    return null;
  }

  return HSK_PROMPT_APPENDERS[key] || null;
};
