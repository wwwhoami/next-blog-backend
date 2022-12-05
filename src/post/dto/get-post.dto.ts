import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class GetPostDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  take?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  skip?: number;

  @IsOptional()
  @IsObject()
  orderBy?: Prisma.PostOrderByWithAggregationInput;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
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

export class SearchPostsByCategoriesDto extends GetPostDto {
  @IsString()
  searchTerm: string;

  @IsOptional()
  @IsString()
  category?: string;
}
