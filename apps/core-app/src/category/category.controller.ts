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
  CategoryNoDescription,
  CategoryWithHotness,
} from './entities/category.entity';

@Controller('category')
@ApiTags('category')
@ApiExtraModels(CategoryNoDescription, CategoryWithHotness)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        oneOf: [
          { $ref: getSchemaPath(CategoryNoDescription) },
          { $ref: getSchemaPath(CategoryWithHotness) },
        ],
      },
    },
  })
  @Get()
  getMany(
    @Query() getCategoriesQuery: GetCategoryDto,
  ): Promise<CategoryNoDescription[] | CategoryWithHotness[]> {
    return this.categoryService.getMany(getCategoriesQuery);
  }

  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'array',
        },
      },
      example: [
        ['aggredior', ['aggredior', 'acer', 'tero']],
        ['acer', ['acer', 'aggredior']],
        ['tero', ['tero', 'aggredior']],
      ],
    },
  })
  @Get('combo')
  async getCombinations(
    @Query() getCategoriesQuery: GetCategoryCombinationsDto,
  ): Promise<Array<[string, Array<string>]>> {
    const combinationsMap =
      await this.categoryService.getCombinations(getCategoriesQuery);

    // Convert Map<string, Set<string>> to array
    // to make convertable to JSON
    const array: [string, string[]][] = Array.from(
      combinationsMap.entries(),
    ).map(([key, value]) => [key, Array.from(value)]);

    return array;
  }
}
