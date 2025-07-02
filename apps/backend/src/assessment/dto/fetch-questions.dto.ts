import { IsOptional, IsInt, Min, Max } from 'class-validator';

export class FetchQuestionsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  maxLevel?: number = 7; // Maximum HSK level to include (default: 7)

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  passageCount?: number = 4; // Number of passages to generate (default: 4)
} 