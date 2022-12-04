import { Post } from '@prisma/client';

// ==== Entity types ====

export type PostWithAuthorCategories = Omit<
  Post,
  'published' | 'authorId' | 'content'
> & {
  author: { name: string; image: string };
  categories: { category: { name: string; hexColor: string } }[];
};

export type PostWithContentAuthorCategories = Omit<
  Post,
  'published' | 'authorId'
> & {
  author: { name: string; image: string };
  categories: { category: { name: string; hexColor: string } }[];
};
