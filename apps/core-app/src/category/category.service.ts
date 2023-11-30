import { Injectable } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { CreateCategoriesDto } from './dto/create-category.dto';
import {
  GetCategoryCombinationsDto,
  GetCategoryDto,
} from './dto/get-category-dto';
import {
  CategoryNoDescription,
  CategoryWithHotness,
} from './entities/category.entity';

@Injectable()
export class CategoryService {
  constructor(private categoryRepository: CategoryRepository) {}

  getMany(
    params: GetCategoryDto,
  ): Promise<CategoryNoDescription[] | CategoryWithHotness[]> {
    if (params.searchTerm)
      return this.categoryRepository.findMany({
        ...params,
        searchTerm: params.searchTerm,
      });

    return this.categoryRepository.getMany(params);
  }

  getCombinations({
    searchTerm,
  }: GetCategoryCombinationsDto): Promise<Map<string, Set<string>>> {
    if (searchTerm)
      return this.categoryRepository.getCombinationsForSearchTerm(searchTerm);

    return this.categoryRepository.getCombinations();
  }

  create(categoriesToCreate: CreateCategoriesDto) {
    return this.categoryRepository.create(categoriesToCreate);
  }
}
