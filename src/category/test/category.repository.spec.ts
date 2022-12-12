import { TestingModule, Test } from '@nestjs/testing';
import { Category, Post, Prisma, PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PostService } from 'src/post/post.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CategoryRepository } from '../category.repository';

describe('CategoryRepository', () => {
  let repository: CategoryRepository;
  let postService: DeepMockProxy<PostService>;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryRepository,
        {
          provide: PostService,
          useValue: mockDeep<PostService>(),
        },
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaClient>(),
        },
      ],
    }).compile();

    repository = module.get<CategoryRepository>(CategoryRepository);
    postService = module.get(PostService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getCategories', () => {
    it('should get categories', () => {
      const payload = [
        { name: 'name1', hexColor: 'hexColor1' },
        { name: 'name2', hexColor: 'hexColor2' },
      ] as unknown as Prisma.Prisma__CategoryClient<Array<Category>>;

      prisma.category.findMany.mockResolvedValue(payload);

      expect(
        repository.getCategories({ take: undefined, skip: undefined }),
      ).resolves.toEqual(payload);
    });
  });

  describe('getCategoryCombinations', () => {
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

      expect(repository.getCategoryCombinations()).resolves.toEqual(expected);
    });
  });

  describe('getCategoryCombinationsForSearchTerm', () => {
    it('should get category combinations if postIds found for searchTerm', () => {
      const postServicePayload = [
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

      postService.getPostIds.mockResolvedValue(postServicePayload);
      prisma.$queryRaw.mockResolvedValue(prismaPayload);

      expect(
        repository.getCategoryCombinationsForSearchTerm(searchTerm),
      ).resolves.toEqual(expected);
    });

    it('should get empty array if no postIds found for searchTerm', () => {
      const postServicePayload = [] as unknown as Prisma.Prisma__PostClient<
        Array<Post>
      >;
      const prismaPayload = [] as unknown as Prisma.Prisma__CategoryClient<
        Array<Category>
      >;
      const searchTerm = 'test';
      const expected: any[] = [];

      postService.getPostIds.mockResolvedValue(postServicePayload);
      prisma.$queryRaw.mockResolvedValue(prismaPayload);

      expect(
        repository.getCategoryCombinationsForSearchTerm(searchTerm),
      ).resolves.toEqual(expected);
    });
  });
});
