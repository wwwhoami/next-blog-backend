import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { CreateCategoryDto } from 'src/category/dto/create-category.dto';
export class CreatePostDto {
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
