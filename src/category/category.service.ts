import { Injectable } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { GetCategoryDto } from './dto/get-category-dto';
import { CategoryEntity } from './entities/category.entity';

@Injectable()
export class CategoryService {
  constructor(private categoryRepository: CategoryRepository) {}

  getCategories(params: GetCategoryDto): Promise<CategoryEntity[]> {
    return this.categoryRepository.getCategories(params);
  }

  getCategoryCombinations({ searchTerm }: GetCategoryDto): Promise<string[][]> {
    if (searchTerm)
      return this.categoryRepository.getCategoryCombinationsForSearchTerm(
        searchTerm,
      );

    return this.categoryRepository.getCategoryCombinations();
  }
}
