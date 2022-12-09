import { Post } from '@prisma/client';

export type PostRawQueryResult = Omit<Post, 'content'> & {
  content?: string;
};
