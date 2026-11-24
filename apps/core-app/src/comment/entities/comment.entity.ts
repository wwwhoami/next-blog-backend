import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PickType,
} from '@nestjs/swagger';
import { Comment } from 'prisma/generated/client';

export class CommentImage {
  id: string;

  publicUrl: string;

  mimeType: string;
}

export class CommentEntity implements Comment {
  @ApiProperty({ type: [CommentImage] })
  images?: CommentImage[];

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

export class CommentListItem extends OmitType(CommentEntity, [
  'images',
  'likesCount',
] as const) {
  @ApiProperty({ type: [CommentImage] })
  images: CommentImage[];

  @ApiProperty({ type: 'integer' })
  depth: number;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Descendant count at the requested depth limit.',
  })
  childrenCount?: number;
}

export class CommentEntityWithDescendants extends CommentEntity {
  descendants?: Comment[];
}
