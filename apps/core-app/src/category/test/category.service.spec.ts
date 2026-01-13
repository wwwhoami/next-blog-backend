import { Test, TestingModule } from '@nestjs/testing';
import { MockProxy, mock } from 'jest-mock-extended';
import { CategoryRepository } from '../category.repository';
import { CategoryService } from '../category.service';
import { CreateCategoriesDto } from '../dto/create-category.dto';

describe('CategoryService', () => {
  let service: CategoryService;
  let categoryRepository: MockProxy<CategoryRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: CategoryRepository,
          useValue: mock<CategoryRepository>(),
        },
      ],
    }).compile();

    categoryRepository = module.get(CategoryRepository);
    service = module.get<CategoryService>(CategoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMany', () => {
    it('should get categories', () => {
      const payload = [
        { name: 'name1', hexColor: 'hexColor1' },
        { name: 'name2', hexColor: 'hexColor2' },
      ];

      categoryRepository.getMany.mockResolvedValue(payload);

      expect(service.getMany({})).resolves.toEqual(payload);
    });

    it('should find categories if searchTerm provided', () => {
      const searchTerm = 'name';
      const payload = [
        {
          name: 'name1',
          hexColor: 'hexColor1',
          description: 'description1',
          hotness: 34,
        },
        {
          name: 'name2',
          hexColor: 'hexColor2',
          description: 'description2',
          hotness: 34,
        },
      ];

      categoryRepository.findMany.mockResolvedValue(payload);

      expect(service.getMany({ searchTerm })).resolves.toEqual(payload);
    });
  });

  describe('getCombinations', () => {
    it('should get category combinations invoking repo.getCategoryCombinations if NO searchTerm provided', () => {
      const payload = [
        ['CSS', 'non'],
        ['dolores', 'eveniet'],
        ['impedit', 'magnam'],
        ['cumque', 'maxime'],
      ];
      categoryRepository.getCombinations.mockResolvedValue(payload);

      expect(service.getCombinations({})).resolves.toEqual(payload);
    });

    it('should get category combinations invoking repo.getCategoryCombinationsForSearchTerm if searchTerm IS provided', () => {
      const payload = [
        ['CSS', 'non'],
        ['dolores', 'eveniet'],
        ['impedit', 'magnam'],
        ['cumque', 'maxime'],
      ];
      const searchTerm = 'test';

      categoryRepository.getCombinationsForSearchTerm.mockResolvedValue(
        payload,
      );

      expect(service.getCombinations({ searchTerm })).resolves.toEqual(payload);
    });
  });

  describe('create', () => {
    const categoriesToCreate: CreateCategoriesDto = {
      categories: [
        { name: 'category1', description: 'description' },
        { name: 'category2', description: 'description' },
        { name: 'category3', description: 'description' },
        { name: 'category4', description: 'description' },
      ],
    };

    it('should create one or many categories', () => {
      const expected = {
        count: categoriesToCreate.categories.length,
      };

      categoryRepository.create.mockResolvedValue(expected);

      expect(service.create(categoriesToCreate)).resolves.toEqual(expected);
    });
  });
});
