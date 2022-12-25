import { Injectable } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { CreateCategoriesDto } from './dto/create-category.dto';
import {
  GetCategoryCombinationsDto,
  GetCategoryDto,
} from './dto/get-category-dto';
import { CategoryEntity } from './entities/category.entity';

@Injectable()
export class CategoryService {
  constructor(private categoryRepository: CategoryRepository) {}

  getCategories(params: GetCategoryDto): Promise<CategoryEntity[]> {
    return this.categoryRepository.getCategories(params);
  }

  getCategoryCombinations({
    searchTerm,
  }: GetCategoryCombinationsDto): Promise<string[][]> {
    if (searchTerm)
      return this.categoryRepository.getCategoryCombinationsForSearchTerm(
        searchTerm,
      );

    return this.categoryRepository.getCategoryCombinations();
  }

  createCategory(categoriesToCreate: CreateCategoriesDto) {
    return this.categoryRepository.createCategory(categoriesToCreate);
  }
}
