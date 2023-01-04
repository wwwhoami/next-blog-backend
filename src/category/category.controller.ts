import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import {
  GetCategoryCombinationsDto,
  GetCategoryDto,
} from './dto/get-category-dto';
import {
  CategoryEntity,
  CategoryWithHotness,
} from './entities/category.entity';

@Controller('category')
@ApiTags('category')
@ApiExtraModels(CategoryEntity, CategoryWithHotness) // Add this decorator
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        oneOf: [
          { $ref: getSchemaPath(CategoryEntity) },
          { $ref: getSchemaPath(CategoryWithHotness) },
        ],
      },
    },
  })
  @Get()
  getMany(
    @Query() getCategoriesQuery: GetCategoryDto,
  ): Promise<CategoryEntity[] | CategoryWithHotness[]> {
    return this.categoryService.getMany(getCategoriesQuery);
  }

  @Get('combo')
  getCombinations(
    @Query() getCategoriesQuery: GetCategoryCombinationsDto,
  ): Promise<string[][]> {
    return this.categoryService.getCombinations(getCategoriesQuery);
  }
}
