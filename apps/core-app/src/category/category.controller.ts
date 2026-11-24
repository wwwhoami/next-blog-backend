import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
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
    description: 'Categories returned.',
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
  @ApiBadRequestResponse({
    description: 'Invalid category search or pagination parameters.',
  })
  @ApiOperation({
    summary: 'List or search categories',
    description:
      'With a non-empty `searchTerm`, searches by name prefix and includes descriptions and hotness scores. Otherwise, returns category names and colors.',
  })
  getMany(
    @Query() getCategoriesQuery: GetCategoryDto,
  ): Promise<CategoryNoDescription[] | CategoryWithHotness[]> {
    return this.categoryService.getMany(getCategoriesQuery);
  }

  @Get('combo')
  @ApiOkResponse({
    description: 'Matching category names returned.',
    type: [String],
  })
  @ApiOperation({
    summary: 'Find related category names',
    description:
      'Provide category names to find tags used together on posts. Use `searchTerm` to limit the results to tags on matching posts.',
  })
  async getCombinations(
    @Query() getCategoryCombinationsQuery: GetCategoryCombinationsDto,
  ): Promise<Array<string>> {
    return this.categoryService.getCombinations(getCategoryCombinationsQuery);
  }
}
