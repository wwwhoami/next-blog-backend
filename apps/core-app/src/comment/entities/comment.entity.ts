import { PickType } from '@nestjs/swagger';
import { Comment } from 'prisma/generated/client';

export class CommentEntity implements Comment {
  id: number;
  authorId: string | null;
  postId: number;
  ancestorId: number | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  likesCount: number;
}

export class CommentLike extends PickType(CommentEntity, [
  'id',
  'likesCount',
  'postId',
] as const) {}
export class CommentEntityWithDepth extends CommentEntity {
  depth: number;
}

export class CommentEntityWithChildrenCount extends CommentEntity {
  childrenCount?: number;
}

export class CommentEntityWithDescendants extends CommentEntity {
  descendants?: Comment[];
}
