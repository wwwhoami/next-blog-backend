import {
  ArrayUnique,
  IsArray,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { MAX_DRAFT_CONTENT_LENGTH } from '../constants/draft-content.constants';

export class CreateDraftDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  title?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  excerpt?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(MAX_DRAFT_CONTENT_LENGTH)
  content?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  categoryNames?: string[];
}
