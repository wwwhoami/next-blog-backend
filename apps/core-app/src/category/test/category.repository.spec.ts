import { Test, TestingModule } from '@nestjs/testing';
import { Category, Post, Prisma, PrismaClient } from '@prisma/client';
import { DeepMockProxy, mock, mockDeep, MockProxy } from 'jest-mock-extended';
import { PostRepository } from '@core/src/post/post.repository';
import { PrismaService } from '@core/src/prisma/prisma.service';
import { CategoryRepository } from '../category.repository';
import { CreateCategoriesDto } from '../dto/create-category.dto';
import { CategoryWithHotness } from '../entities/category.entity';

describe('CategoryRepository', () => {
  let repository: CategoryRepository;
  let postRepository: MockProxy<PostRepository>;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryRepository,
        {
          provide: PostRepository,
          useValue: mock<PostRepository>(),
        },
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaClient>(),
        },
      ],
    }).compile();

    repository = module.get<CategoryRepository>(CategoryRepository);
    postRepository = module.get(PostRepository);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getMany', () => {
    it('should get categories', () => {
      const payload = [
        { name: 'name1', hexColor: 'hexColor1' },
        { name: 'name2', hexColor: 'hexColor2' },
      ] as unknown as Prisma.Prisma__CategoryClient<Array<Category>>;

      prisma.category.findMany.mockResolvedValue(payload);

      expect(
        repository.getMany({ take: undefined, skip: undefined }),
      ).resolves.toEqual(payload);
    });
  });

  describe('findMany', () => {
    it('should find categories, map return to CategoryWithHotness[]', () => {
      const searchTerm = 'name';
      const payload = [
        {
          name: 'name1',
          hexColor: 'hexColor1',
          description: 'description1',
          _count: { PostToCategory: 34 },
        },
        {
          name: 'name2',
          hexColor: 'hexColor2',
          description: 'description2',
          _count: { PostToCategory: 34 },
        },
      ];
      const expectedPayload: CategoryWithHotness[] = payload.map(
        (category) => ({
          name: category.name,
          description: category.description,
          hexColor: category.hexColor,
          hotness: category._count.PostToCategory,
        }),
      );

      prisma.category.findMany.mockResolvedValue(payload);

      expect(repository.findMany({ searchTerm })).resolves.toEqual(
        expectedPayload,
      );
    });
  });

  describe('getCombinations', () => {
    it('should get category combinations', () => {
      const payload = [
        {
          category_list: 'CSS,non',
        },
        {
          category_list: 'dolores,eveniet',
        },
        {
          category_list: 'impedit,magnam',
        },
        {
          category_list: 'cumque,maxime',
        },
      ] as unknown as Prisma.Prisma__CategoryClient<Array<Category>>;
      const expected = [
        ['CSS', 'non'],
        ['dolores', 'eveniet'],
        ['impedit', 'magnam'],
        ['cumque', 'maxime'],
      ];

      prisma.$queryRaw.mockResolvedValue(payload);

      expect(repository.getCombinations()).resolves.toEqual(expected);
    });
  });

  describe('getCombinationsForSearchTerm', () => {
    it('should get category combinations if postIds found for searchTerm', () => {
      const PostRepositoryPayload = [
        { id: 1 },
        { id: 2 },
        { id: 12 },
      ] as unknown as Prisma.Prisma__PostClient<Array<Post>>;
      const prismaPayload = [
        {
          category_list: 'CSS,non',
        },
        {
          category_list: 'dolores,eveniet',
        },
        {
          category_list: 'impedit,magnam',
        },
        {
          category_list: 'cumque,maxime',
        },
      ] as unknown as Prisma.Prisma__CategoryClient<Array<Category>>;
      const searchTerm = 'test';
      const expected = [
        ['CSS', 'non'],
        ['dolores', 'eveniet'],
        ['impedit', 'magnam'],
        ['cumque', 'maxime'],
      ];

      postRepository.findIds.mockResolvedValue(PostRepositoryPayload);
      prisma.$queryRaw.mockResolvedValue(prismaPayload);

      expect(
        repository.getCombinationsForSearchTerm(searchTerm),
      ).resolves.toEqual(expected);
    });

    it('should get empty array if no postIds found for searchTerm', () => {
      const PostRepositoryPayload = [] as unknown as Prisma.Prisma__PostClient<
        Array<Post>
      >;
      const prismaPayload = [] as unknown as Prisma.Prisma__CategoryClient<
        Array<Category>
      >;
      const searchTerm = 'test';
      const expected: any[] = [];

      postRepository.findIds.mockResolvedValue(PostRepositoryPayload);
      prisma.$queryRaw.mockResolvedValue(prismaPayload);

      expect(
        repository.getCombinationsForSearchTerm(searchTerm),
      ).resolves.toEqual(expected);
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

      prisma.category.createMany.mockResolvedValue(expected);

      expect(repository.create(categoriesToCreate)).resolves.toEqual(expected);
    });
  });
});
