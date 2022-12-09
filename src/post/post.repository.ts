import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  GetPostDto,
  GetPostsByCategoriesDto,
  SearchPostDto,
  SearchPostsByCategoriesDto,
} from './dto/get-post.dto';
import { PostEntity } from './entities/post.entity';
import { selectPostWithAuthorCategories } from './utils/select.objects';

@Injectable()
export class PostRepository {
  constructor(private prisma: PrismaService) {}

  async getPostIds({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
  }: GetPostDto): Promise<{ id: number }[]> {
    return this.prisma.post.findMany({
      select: {
        id: true,
      },
      where: {
        published: true,
      },
      orderBy: { [orderBy]: order },
      take,
      skip,
    });
  }

  async findPostIds({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    searchTerm,
  }: SearchPostDto): Promise<{ id: number }[]> {
    const search = searchTerm.split(' ').join(' ');
    const ordering =
      order === 'desc'
        ? Prisma.sql`order by 
        title <-> ${search},
        excerpt <-> ${search},
        ${orderBy} desc`
        : Prisma.sql`order by 
        title <-> ${search},
        excerpt <-> ${search},
        ${orderBy} asc`;

    return this.prisma.$queryRaw`
      select
        id
      from
        "Post"
      where
        title % ${search} or 
        excerpt % ${search}
      ${ordering}
      limit ${take}
      offset ${skip}`;
  }

  async getPosts({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
  }: GetPostDto) {
    return this.prisma.post.findMany({
      select: {
        ...selectPostWithAuthorCategories,
        content,
      },
      where: {
        published: true,
      },
      orderBy: { [orderBy]: order },
      take,
      skip,
    });
  }

  async findPosts({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
    searchTerm,
  }: SearchPostDto): Promise<PostEntity[]> {
    const search = searchTerm.split(' ').join(' ');

    const select = content
      ? Prisma.sql`
      select
        id,
        created_at,
        title,
        slug,
        excerpt,
        view_count,
        cover_image,
        content`
      : Prisma.sql`
      select
        id,
        created_at,
        title,
        slug,
        excerpt,
        view_count,
        cover_image
        `;

    const selectAuthorCategoriesToJsonOutput = Prisma.sql`
    ,(
        select
            array_to_json(array_agg(cate))
        from (
                select
                    row_to_json(c) as category
                from (
                        select
                            name,
                            hex_color
                        from
                            "Category" as cat
                            inner join "PostToCategory" as ptc on cat.name = ptc.category_name
                        where
                            ptc.post_id = p.id
                    ) as c
            ) as cate
    ) as categories, (
        select
            row_to_json(a) as author
        from (
                select
                    name,
                    image
                from
                    "User" as u
                where
                    u.id = p.author_id
            ) as a
    )
    `;

    const ordering =
      order === 'desc'
        ? Prisma.sql`order by 
        title <-> ${search},
        excerpt <-> ${search},
        ${orderBy} desc`
        : Prisma.sql`order by 
        title <-> ${search},
        excerpt <-> ${search},
        ${orderBy} asc`;

    return this.prisma.$queryRaw<PostEntity[]>`
      ${select}
      ${selectAuthorCategoriesToJsonOutput} 
      from "Post" as p
      where
          title % ${search}
          or excerpt % ${search}
      ${ordering}
      limit ${take}
      offset ${skip}`;
  }

  /**
   * Get postIds with cardinality >= categories count
   * @private
   */
  private async getPostsGroupedByIds(categoriesCount: number) {
    return this.prisma.postToCategory.groupBy({
      by: ['postId'],
      having: {
        categoryName: {
          _count: {
            gte: categoriesCount,
          },
        },
      },
    });
  }

  async getPostsByCategories({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
    category,
  }: GetPostsByCategoriesDto): Promise<PostEntity[]> {
    const categories = category.split(' ');

    // Get postIds with cardinality >= categories count
    const groupedPosts = await this.getPostsGroupedByIds(categories.length);

    if (groupedPosts.length === 0) return [];

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
      orderBy: { [orderBy]: order },
      take,
      skip,
    });
  }

  async findPostsByCategories({
    take = 10,
    skip = 0,
    orderBy = 'createdAt',
    order = 'desc',
    content = false,
    category,
    searchTerm,
  }: SearchPostsByCategoriesDto): Promise<PostEntity[]> {
    const categories = category.split(' ');

    // Get postIds with cardinality >= categories count
    const groupedPosts = await this.getPostsGroupedByIds(categories.length);

    if (groupedPosts.length === 0) return [];

    const search = searchTerm.split(' ').join(' & ');
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
              contains: search,
            },
          },
          {
            excerpt: {
              contains: search,
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
        { [orderBy]: order },
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

  async getPublishedPostBySlug(slug: string): Promise<PostEntity | null> {
    return this.prisma.post.findFirst({
      select: {
        ...selectPostWithAuthorCategories,
        content: true,
      },
      where: {
        slug,
        published: true,
      },
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
