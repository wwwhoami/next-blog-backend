import { Test, TestingModule } from '@nestjs/testing';
import { mock, MockProxy } from 'jest-mock-extended';
import { CategoryController } from '../category.controller';
import { CategoryService } from '../category.service';

describe('CategoryService', () => {
  let controller: CategoryController;
  let categoryService: MockProxy<CategoryService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryController],
      providers: [
        {
          provide: CategoryService,
          useValue: mock<CategoryService>(),
        },
      ],
    }).compile();

    categoryService = module.get(CategoryService);
    controller = module.get<CategoryController>(CategoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMany', () => {
    it('should get categories', () => {
      const payload = [
        { name: 'name1', hexColor: 'hexColor1' },
        { name: 'name2', hexColor: 'hexColor2' },
      ];

      categoryService.getMany.mockResolvedValue(payload);

      expect(controller.getMany({})).resolves.toEqual(payload);
    });
  });

  describe('getCombinations', () => {
    it('should get category combinations', () => {
      const payload = new Map([
        ['CSS', ['CSS', 'non']],
        ['non', ['non', 'CSS']],
        ['dolores', ['dolores', 'eveniet']],
        ['eveniet', ['eveniet', 'dolores']],
        ['impedit', ['impedit', 'magnam']],
        ['magnam', ['magnam', 'impedit']],
        ['cumque', ['cumque', 'maxime']],
        ['maxime', ['maxime', 'cumque']],
      ]) as unknown as Map<string, Set<string>>;
      const expected = Array.from(payload.entries()).map(([key, value]) => [
        key,
        Array.from(value),
      ]);

      for (const [key, value] of payload) {
        payload.set(key, new Set(value));
      }

      categoryService.getCombinations.mockResolvedValue(payload);

      expect(controller.getCombinations({})).resolves.toEqual(expected);
    });
  });
});
