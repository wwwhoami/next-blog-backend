import { PartialType } from '@nestjs/mapped-types';
import { Prisma } from '@prisma/client';
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
  take?: number;

  @IsOptional()
  @IsNumber()
  skip?: number;

  @IsOptional()
  @IsObject()
  orderBy?: Prisma.PostOrderByWithAggregationInput;

  @IsOptional()
  @IsBoolean()
  content?: boolean;
}

export class SearchPostDto extends PartialType(GetPostDto) {
  @IsString()
  searchTerm: string;
}

export class GetPostsByCategoriesDto extends PartialType(GetPostDto) {
  @IsString()
  category: string;
}

export class FindPostsByDto extends PartialType(GetPostsByCategoriesDto) {
  @IsString()
  searchTerm: string;
}
