import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { CreateCategoryDto } from 'src/category/dto/create-category.dto';

export class UpdatePostData {
  @IsNumber()
  id: number;

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
}

export class UpdatePostDto {
  @IsDefined()
  @ValidateNested({ each: true })
  @Type(() => UpdatePostData)
  post: UpdatePostData;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryDto)
  categories?: CreateCategoryDto[];
}
