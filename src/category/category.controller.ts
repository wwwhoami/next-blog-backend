import { Controller, Get, Query } from '@nestjs/common';
import { CategoryService } from './category.service';
import { GetCategoryDto } from './dto/get-category-dto';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  getCategories(@Query() getCategoriesQuery: GetCategoryDto) {
    return this.categoryService.getCategories(getCategoriesQuery);
  }

  @Get('combo')
  getCategoryCombinations(@Query() getCategoriesQuery: GetCategoryDto) {
    return this.categoryService.getCategoryCombinations(getCategoriesQuery);
  }
}
