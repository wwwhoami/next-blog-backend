import { ApiProperty } from '@nestjs/swagger';
import { Comment, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { SortOrder } from 'src/common/sort-order.enum';
import { UnionOfObjKeys } from 'src/common/types/union-of-obj-keys.types';

enum CommentOrderByKeyEnum {
  createdAt = 'createdAt',
  updatedAt = 'updatedAt',
}

export type CommentOrderBy = UnionOfObjKeys<
  Pick<Comment, 'createdAt' | 'updatedAt'>
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

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number.parseInt(value))
  depth?: number;
}
