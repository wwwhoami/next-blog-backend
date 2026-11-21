import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class CreateCommentDto {
  @IsOptional()
  @IsNumber()
  ancestorId?: number;

  @IsNumber()
  postId: number;

  @IsString()
  content: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Image IDs in gallery order',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @IsUUID('4', { each: true })
  mediaIds?: string[];
}

export class CreateResponseToCommentDto extends CreateCommentDto {
  declare ancestorId: number;
}
