import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  FindPostsByDto,
  GetPostDto,
  GetPostsByCategoriesDto,
  SearchPostDto,
} from './dto/get-post.dto';
import { PostEntity } from './entities/post.entity';
import { selectPostWithAuthorCategories } from './utils/select.objects';

@Injectable()
export class PostService {
  constructor(private prisma: PrismaService) {}

  async getPostIds({
    take = 10,
    skip = 0,
    orderBy = { createdAt: 'desc' },
  }: GetPostDto): Promise<{ id: number }[]> {
    return this.prisma.post.findMany({
      select: {
        id: true,
      },
      where: {
        published: true,
      },
      orderBy,
      take,
      skip,
    });
  }

  async findPostIds({
    take = 10,
    skip = 0,
    searchTerm,
  }: SearchPostDto): Promise<{ id: number }[]> {
    const search = searchTerm.split(' ').join(' & ');

    return this.prisma.post.findMany({
      select: {
        id: true,
      },
      where: {
        published: true,
        OR: [
          {
            title: {
              search,
            },
          },
          {
            excerpt: {
              search,
            },
          },
        ],
      },
      take,
      skip,
    });
  }

  async getPosts({
    take = 10,
    skip = 0,
    orderBy = { createdAt: 'desc' },
    content = false,
  }: GetPostDto): Promise<PostEntity[]> {
    return this.prisma.post.findMany({
      select: {
        ...selectPostWithAuthorCategories,
        content,
      },
      where: {
        published: true,
      },
      orderBy,
      take,
      skip,
    });
  }

  async findPosts({
    take = 10,
    skip = 0,
    orderBy = { createdAt: 'desc' },
    content = false,
    searchTerm,
  }: SearchPostDto): Promise<PostEntity[]> {
    const search = searchTerm.split(' ').join(' & ');

    return this.prisma.post.findMany({
      select: {
        ...selectPostWithAuthorCategories,
        content,
      },
      where: {
        published: true,
        OR: [
          {
            title: {
              search,
            },
          },
          {
            excerpt: {
              search,
            },
          },
        ],
      },
      orderBy: [
        {
          _relevance: {
            fields: ['title', 'excerpt'],
            search,
            sort: 'desc',
          },
        },
        orderBy,
      ],
      take,
      skip,
    });
  }

  async getPostsByCategories({
    take = 10,
    skip = 0,
    orderBy = { createdAt: 'desc' },
    content = false,
    category,
  }: GetPostsByCategoriesDto): Promise<PostEntity[]> {
    const categories = category.split(' ');

    // Get postIds with cardinality >= categories count
    const groupedPosts = await this.prisma.postToCategory.groupBy({
      by: ['postId'],
      having: {
        categoryName: {
          _count: {
            gte: categories.length,
          },
        },
      },
    });

    if (groupedPosts.length === 0) return;

    const postIds = groupedPosts.map((data) => data.postId);

    return this.prisma.post.findMany({
      select: {
        ...selectPostWithAuthorCategories,
        content,
      },
      where: {
        id: {
          in: postIds,
        },
        published: true,
        categories: {
          some: {
            categoryName: {
              in: categories,
              mode: 'insensitive',
            },
          },
        },
      },
      orderBy,
      take,
      skip,
    });
  }

  async findPostsByCategories({
    take = 10,
    skip = 0,
    orderBy = { createdAt: 'desc' },
    content = false,
    category,
    searchTerm,
  }: FindPostsByDto): Promise<PostEntity[]> {
    const categories = category.split(' ');

    // Get postIds with cardinality >= categories count
    const groupedPosts = await this.prisma.postToCategory.groupBy({
      by: ['postId'],
      having: {
        categoryName: {
          _count: {
            gte: categories.length,
          },
        },
      },
    });

    if (groupedPosts.length === 0) return;

    const search = searchTerm ? searchTerm.split(' ').join(' & ') : undefined;
    const postIds = groupedPosts.map((data) => data.postId);

    return this.prisma.post.findMany({
      select: {
        ...selectPostWithAuthorCategories,
        content,
      },
      where: {
        id: {
          in: postIds,
        },
        published: true,
        categories: {
          some: {
            categoryName: {
              in: categories,
              mode: 'insensitive',
            },
          },
        },
        OR: [
          {
            title: {
              search,
            },
          },
          {
            excerpt: {
              search,
            },
          },
        ],
      },
      orderBy: [
        {
          _relevance: {
            fields: ['title', 'excerpt'],
            search,
            sort: 'desc',
          },
        },
        orderBy,
      ],
      take,
      skip,
    });
  }

  async getPublishedPostsSlugs(): Promise<{ slug: string }[]> {
    return this.prisma.post.findMany({
      select: {
        slug: true,
      },
      where: {
        published: true,
      },
    });
  }

  async getPublishedPostBySlug(slug: string): Promise<PostEntity> {
    return this.prisma.post.findFirst({
      select: {
        ...selectPostWithAuthorCategories,
        content: true,
      },
      where: {
        slug,
        published: true,
      },
      rejectOnNotFound: true,
    });
  }

  async publishPostBySlug(slug: string): Promise<PostEntity> {
    return this.prisma.post.update({
      where: {
        slug,
      },
      data: {
        published: true,
      },
      select: {
        ...selectPostWithAuthorCategories,
        content: false,
      },
    });
  }

  async deletePostBySlug(slug: string): Promise<PostEntity> {
    return this.prisma.post.delete({
      where: {
        slug,
      },
      select: {
        ...selectPostWithAuthorCategories,
      },
    });
  }
}
