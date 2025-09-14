export interface AssessmentWord {
  text: string;
  pinyin: string;
  hskLevel: number;
  definition: string;
}

export interface AssessmentPassage {
  id: string;
  title: string;
  content: string;
  pinyin: string;
  translation: string;
  words: AssessmentWord[];
  targetHskLevel?: number;
}

export type WordStatus = "known" | "partial" | "unknown";

export interface WordResponse {
  word: string;
  status: WordStatus;
  startIndex: number;
  endIndex: number;
}

export interface PassageResponse {
  passageId: string;
  wordResponses: WordResponse[];
}

export interface AssessmentSession {
  id?: string;
  passages: AssessmentPassage[];
  responses: PassageResponse[];
  currentPassageIndex: number;
  isComplete: boolean;
  startedAt: Date;
  visitedPassages: number[];
}

export interface AssessmentSubmission {
  wordAssessments: Array<{
    word: string;
    knowledge: "known" | "partial" | "unknown";
    hskLevel: number;
  }>;
}
