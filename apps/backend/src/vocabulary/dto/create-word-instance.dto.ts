import { IsInt, IsString, IsOptional, IsPositive } from 'class-validator';

export class CreateWordInstanceDto {
  @IsString()
  hanzi: string;

  @IsInt()
  @IsPositive()
  startIndex: number;

  @IsInt()
  @IsPositive()
  endIndex: number;

  @IsString()
  context: string;

  @IsOptional()
  @IsInt()
  sectionId?: number;

  @IsOptional()
  @IsInt()
  messageId?: number;
}
