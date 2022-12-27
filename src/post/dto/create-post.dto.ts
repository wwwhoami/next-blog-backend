import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { CreateCategoryDto } from 'src/category/dto/create-category.dto';

export class CreatePostData {
  @IsString()
  title: string;

  @IsString()
  slug: string;

  @IsString()
  excerpt: string;

  @IsString()
  content: string;

  @IsBoolean()
  published: boolean;

  @IsUrl()
  coverImage: string;
}

export class CreatePostDto {
  @IsDefined()
  @ValidateNested({ each: true })
  @Type(() => CreatePostData)
  post: CreatePostData;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryDto)
  categories?: CreateCategoryDto[];
}
