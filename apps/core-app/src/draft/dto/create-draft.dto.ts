import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_DRAFT_CONTENT_LENGTH } from '../constants/draft-content.constants';

export class CreateDraftDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DRAFT_CONTENT_LENGTH)
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryNames?: string[];
}
