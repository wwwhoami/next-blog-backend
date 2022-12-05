import { ApiProperty } from '@nestjs/swagger';
import { Post, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { SortOrder } from 'src/common/sort-order.enum';
import { UnionOfObjKeys } from 'src/common/types/union-of-obj-keys.types';
import { PostEntityKeysEnum } from '../entities/post.entity';

export class GetPostDto {
  @Type(() => Number)
  take?: number;

  @Type(() => Number)
  skip?: number;

  @IsOptional()
  @IsEnum(PostEntityKeysEnum)
  @ApiProperty({ enum: PostEntityKeysEnum })
  orderBy?: UnionOfObjKeys<Post>;

  @IsOptional()
  @IsEnum(SortOrder)
  @ApiProperty({ enum: SortOrder })
  order?: Prisma.SortOrder;

  @Type(() => Boolean)
  content?: boolean;
}

export class SearchPostDto extends GetPostDto {
  searchTerm: string;
}

export class GetPostsByCategoriesDto extends GetPostDto {
  category: string;
}

export class SearchPostsByCategoriesDto extends GetPostDto {
  searchTerm: string;
  category?: string;
}
