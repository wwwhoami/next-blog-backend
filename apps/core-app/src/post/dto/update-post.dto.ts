import { CreateCategoryDto } from '@core/src/category/dto/create-category.dto';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';

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
