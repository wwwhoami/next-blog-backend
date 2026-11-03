import { CreateCategoryDto } from '@core/src/category/dto/create-category.dto';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';

/**
 * Legacy content-update payload retained for generated metadata compatibility.
 * Post content changes must use the draft revision workflow.
 */
export class UpdatePostDto {
  @IsString()
  title: string;

  @IsString()
  excerpt: string;

  @IsString()
  content: string;

  @IsBoolean()
  published: boolean;

  @IsUrl()
  coverImage: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryDto)
  categories?: CreateCategoryDto[];
}
