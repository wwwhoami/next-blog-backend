import { SortOrder } from '@core/src/common/sort-order.enum';
import { UnionOfObjKeys } from '@core/src/common/types/union-of-obj-keys.types';
import { ApiProperty, IntersectionType, OmitType } from '@nestjs/swagger';
import { Post, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PostEntityKeysEnum } from '../entities/post.entity';

export type PostOrderBy = UnionOfObjKeys<Post>;

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
  orderBy?: PostOrderBy;

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

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  published?: boolean;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value.replace(/\s{2,}/g, ' ').trim())
  searchTerm?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    value
      .replace(/\s{2,}/g, ' ')
      .trim()
      .toLowerCase(),
  )
  category?: string;

  @IsOptional()
  @IsUUID()
  authorId?: string;
}

export class GetPostPublicDto extends OmitType(GetPostDto, ['published']) {}

export class SearchPostDto extends GetPostDto {
  @IsString()
  @Transform(({ value }) => value.replace(/\s{2,}/g, ' ').trim())
  searchTerm: string;
}

export class GetPostsByCategoriesDto extends GetPostDto {
  @IsString()
  @Transform(({ value }) =>
    value
      .replace(/\s{2,}/g, ' ')
      .trim()
      .toLowerCase(),
  )
  category: string;
}

export class SearchPostsByCategoriesDto extends IntersectionType(
  SearchPostDto,
  GetPostsByCategoriesDto,
) {}
