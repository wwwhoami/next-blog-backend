import { PickType } from '@nestjs/swagger';
import { CategoryNoDescription } from 'src/category/entities/category.entity';

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
  likesCount = 'likesCount',
}

export class Slug {
  slug: string;
}

class AuthorEntity {
  name: string;
  image: string | null;
}

class PostCategory {
  category: CategoryNoDescription;
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
  categories?: PostCategory[];
  likesCount: number;
}

export class PostLike extends PickType(PostEntity, [
  'id',
  'likesCount',
] as const) {}
