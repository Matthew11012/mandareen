export interface Word {
  text: string;
  pinyin: string;
  hskLevel: number;
  definition: string;
}

export interface Passage {
  id: string;
  title: string;
  content: string;
  targetHskLevel: number;
  words: Word[];
  translation: string;
  pinyin: string;
  segments?: Array<{
    text: string;
    startIndex: number;
    endIndex: number;
    isWord: boolean;
    hskLevel?: number;
    pinyin?: string;
    definition?: string;
  }>;
}
