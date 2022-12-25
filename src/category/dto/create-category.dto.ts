export class CreateCategoryDto {
  name: string;
  description: string;
  hexColor?: string | null;
}

export class CreateCategoriesDto {
  categories: CreateCategoryDto[];
}
