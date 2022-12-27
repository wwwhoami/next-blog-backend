import { IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  hexColor?: string | null;
}

export class CreateCategoriesDto {
  categories: CreateCategoryDto[];
}
