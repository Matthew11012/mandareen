import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface SegmentResult {
  word: string;
  startIndex: number;
  endIndex: number;
  vocabItem?: any;
}

@Injectable()
export class SegmentationService {
  constructor(private prisma: PrismaService) {}

  async segmentText(text: string): Promise<SegmentResult[]> {
    const segments: SegmentResult[] = [];
    const textLength = text.length;
    
    const vocabularyItems = await this.prisma.vocabularyItem.findMany({
      select: { id: true, hanzi: true, pinyin: true, definition: true, hskLevel: true }
    });
    
    const vocabMap = new Map(vocabularyItems.map(item => [item.hanzi, item]));
    
    let i = 0;
    while (i < textLength) {
      let matchFound = false;
      
      // Try longest match first (4 characters down to 1)
      for (let len = Math.min(4, textLength - i); len >= 1; len--) {
        const substring = text.substring(i, i + len);
        const vocabItem = vocabMap.get(substring);
        
        if (vocabItem) {
          segments.push({
            word: substring,
            startIndex: i,
            endIndex: i + len,
            vocabItem: vocabItem,
          });
          i += len;
          matchFound = true;
          break;
        }
      }
      
      // If no match found, treat as single character
      if (!matchFound) {
        const char = text.charAt(i);
        if (this.isChinese(char)) {
          segments.push({
            word: char,
            startIndex: i,
            endIndex: i + 1,
            vocabItem: vocabMap.get(char),
          });
        }
        i++;
      }
    }
    
    return segments;
  }

  private isChinese(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
           (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
           (code >= 0x20000 && code <= 0x2a6df); // CJK Extension B
  }
} 