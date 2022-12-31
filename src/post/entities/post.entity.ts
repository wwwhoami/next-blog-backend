import { ApiProperty } from '@nestjs/swagger';

export enum PostEntityKeysEnum {
  id = 'id',
  title = 'title',
  content = 'content',
  published = 'published',
  coverImage = 'coverImage',
  authorId = 'authorId',
  createdAt = 'createdAt',
  updatedAt = 'updatedAt',
  excerpt = 'excerpt',
  slug = 'slug',
}

export class Slug {
  slug: string;
}

class CategoryEntity {
  category: {
    name: string;
    hexColor: string | null;
  };
}
class AuthorEntity {
  name: string;
  image: string | null;
}

export class PostEntity {
  id: number;
  title: string;
  content?: string;
  coverImage: string;
  createdAt: Date;
  updatedAt: Date;
  excerpt: string;
  slug: string;
  author?: AuthorEntity;
  @ApiProperty({ type: CategoryEntity, isArray: true })
  categories?: CategoryEntity[];
}
