import { ApiProperty } from '@nestjs/swagger';

export class Slug {
  slug: string;
}

class CategoryEntity {
  category: {
    name: string;
    hexColor: string;
  };
}
class AuthorEntity {
  name: string;
  image: string;
}

export class PostEntity {
  id: number;
  title: string;
  content?: string;
  coverImage: string;
  createdAt: Date;
  updatedAt: Date;
  viewCount: number;
  excerpt: string;
  slug: string;
  author?: AuthorEntity;
  @ApiProperty({ type: CategoryEntity, isArray: true })
  categories?: CategoryEntity[];
}
