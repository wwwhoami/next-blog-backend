import { SortOrder } from '@core/src/common/sort-order.enum';
import { UnionOfObjKeys } from '@core/src/common/types/union-of-obj-keys.types';
import { ApiProperty } from '@nestjs/swagger';
import { Comment, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';

enum CommentOrderByKeyEnum {
  createdAt = 'createdAt',
  updatedAt = 'updatedAt',
  likesCount = 'likesCount',
}

export type CommentOrderBy = UnionOfObjKeys<
  Pick<Comment, 'createdAt' | 'updatedAt' | 'likesCount'>
>;

export class GetCommentDto {
  @IsOptional()
  @IsEnum(CommentOrderByKeyEnum)
  @ApiProperty({ enum: CommentOrderByKeyEnum })
  orderBy?: CommentOrderBy;

  @IsOptional()
  @IsEnum(SortOrder)
  @ApiProperty({ enum: SortOrder })
  order?: Prisma.SortOrder;

  // depth is used to get comments with a specific depth in the tree structure of comments
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number.parseInt(value))
  depth?: number;
}
