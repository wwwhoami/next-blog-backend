import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { CategoryRepository } from '../category.repository';
import { CategoryService } from '../category.service';

describe('CategoryService', () => {
  let service: CategoryService;
  let categoryRepository: DeepMockProxy<CategoryRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: CategoryRepository,
          useValue: mockDeep<CategoryRepository>(),
        },
      ],
    }).compile();

    categoryRepository = module.get(CategoryRepository);
    service = module.get<CategoryService>(CategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCategories', () => {
    it('should get categories', () => {
      const payload = [
        { name: 'name1', hexColor: 'hexColor1' },
        { name: 'name2', hexColor: 'hexColor2' },
      ];

      categoryRepository.getCategories.mockResolvedValue(payload);

      expect(service.getCategories({})).resolves.toEqual(payload);
    });
  });

  describe('getCategoryCombinations', () => {
    it('should get category combinations invoking repo.getCategoryCombinations if NO searchTerm provided', () => {
      const payload = [
        ['CSS', 'non'],
        ['dolores', 'eveniet'],
        ['impedit', 'magnam'],
        ['cumque', 'maxime'],
      ];

      categoryRepository.getCategoryCombinations.mockResolvedValue(payload);

      expect(service.getCategoryCombinations({})).resolves.toEqual(payload);
    });

    it('should get category combinations invoking repo.getCategoryCombinationsForSearchTerm if searchTerm IS provided', () => {
      const payload = [
        ['CSS', 'non'],
        ['dolores', 'eveniet'],
        ['impedit', 'magnam'],
        ['cumque', 'maxime'],
      ];
      const searchTerm = 'test';

      categoryRepository.getCategoryCombinationsForSearchTerm.mockResolvedValue(
        payload,
      );

      expect(service.getCategoryCombinations({ searchTerm })).resolves.toEqual(
        payload,
      );
    });
  });
});
