import { IsArray, IsString, IsInt, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum WordKnowledgeLevel {
  UNKNOWN = 'unknown',
  PARTIAL = 'partial',
  KNOWN = 'known',
}

export class WordAssessmentDto {
  @IsString()
  word: string;

  @IsEnum(WordKnowledgeLevel)
  knowledge: WordKnowledgeLevel;

  @IsInt()
  hskLevel: number;
}

export class SubmitAssessmentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WordAssessmentDto)
  wordAssessments: WordAssessmentDto[];
} 