import { IsArray, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateDraftDto } from './create-draft.dto';

export class UpdateDraftDto extends CreateDraftDto {
  @IsOptional()
  @IsUUID()
  coverMediaId?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsUUID('4', { each: true })
  mediaIds?: string[];
}
