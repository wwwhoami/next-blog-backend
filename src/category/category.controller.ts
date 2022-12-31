import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import {
  GetCategoryCombinationsDto,
  GetCategoryDto,
} from './dto/get-category-dto';
import { CategoryEntity } from './entities/category.entity';

@Controller('category')
@ApiTags('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  getMany(
    @Query() getCategoriesQuery: GetCategoryDto,
  ): Promise<CategoryEntity[]> {
    return this.categoryService.getMany(getCategoriesQuery);
  }

  @Get('combo')
  getCombinations(
    @Query() getCategoriesQuery: GetCategoryCombinationsDto,
  ): Promise<string[][]> {
    return this.categoryService.getCombinations(getCategoriesQuery);
  }
}
