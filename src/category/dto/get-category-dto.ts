import { Transform } from 'class-transformer';
import { IsOptional, IsInt, IsString } from 'class-validator';

export class GetCategoryDto {
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number.parseInt(value))
  take?: number;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number.parseInt(value))
  skip?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value.replace(/\s{2,}/g, ' ').trim())
  searchTerm?: string;
}
