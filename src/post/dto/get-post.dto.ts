import { ApiProperty, IntersectionType, PartialType } from '@nestjs/swagger';
import { Post, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { SortOrder } from 'src/common/sort-order.enum';
import { UnionOfObjKeys } from 'src/common/types/union-of-obj-keys.types';
import { PostEntityKeysEnum } from '../entities/post.entity';

export class GetPostDto {
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number.parseInt(value))
  take?: number;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number.parseInt(value))
  skip?: number;

  @IsOptional()
  @IsEnum(PostEntityKeysEnum)
  @ApiProperty({ enum: PostEntityKeysEnum })
  orderBy?: UnionOfObjKeys<Post>;

  @IsOptional()
  @IsEnum(SortOrder)
  @ApiProperty({ enum: SortOrder })
  order?: Prisma.SortOrder;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  content?: boolean;
}

export class SearchPostDto extends GetPostDto {
  @IsString()
  searchTerm: string;
}

export class GetPostsByCategoriesDto extends GetPostDto {
  @IsString()
  category: string;
}

export class SearchPostsByCategoriesDto extends IntersectionType(
  SearchPostDto,
  PartialType(GetPostsByCategoriesDto),
) {}
