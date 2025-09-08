// Basic type definitions for database entities
export interface User {
  id: number;
  email: string;
  password_hashed?: string;
  levelPlaced?: number | null;
  googleId?: string;
  createdAt: Date;
}

export interface VocabularyItem {
  id: number;
  hanzi: string;
  pinyin: string;
  definition: string;
  hskLevel?: number;
  isCustom: boolean;
}

export interface Assessment {
  id: number;
  userId: number;
  levelPlaced: number;
  createdAt: Date;
}

export interface WordInstance {
  id: number;
  vocabId: number;
  startIndex: number;
  endIndex: number;
  context: string;
  sectionId?: number;
  messageId?: number;
}

// Utility type for Prisma query results
export type PrismaResult<T> = T | null;

// Safe query result wrapper
export interface SafeQueryResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
}
