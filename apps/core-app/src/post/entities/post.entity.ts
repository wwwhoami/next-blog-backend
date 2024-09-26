import { CategoryNoDescription } from '@core/src/category/entities/category.entity';
import { PickType } from '@nestjs/swagger';

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
  language = 'language',
}

export enum PostEntityLanguageEnum {
  simple = 'simple',
  arabic = 'arabic',
  armenian = 'armenian',
  basque = 'basque',
  catalan = 'catalan',
  danish = 'danish',
  dutch = 'dutch',
  english = 'english',
  finnish = 'finnish',
  french = 'french',
  german = 'german',
  greek = 'greek',
  hindi = 'hindi',
  hungarian = 'hungarian',
  indonesian = 'indonesian',
  irish = 'irish',
  italian = 'italian',
  lithuanian = 'lithuanian',
  nepali = 'nepali',
  norwegian = 'norwegian',
  portuguese = 'portuguese',
  romanian = 'romanian',
  russian = 'russian',
  serbian = 'serbian',
  spanish = 'spanish',
  swedish = 'swedish',
  tamil = 'tamil',
  turkish = 'turkish',
  yiddish = 'yiddish',
}

export class Slug {
  slug: string;
}

class AuthorEntity {
  name: string;
  image: string | null;
}

export class PostCategory {
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
  language: string;
}

export class PostEntityRanked extends PostEntity {
  rank?: number;
}

export class PostLike extends PickType(PostEntity, [
  'id',
  'likesCount',
] as const) {}
