import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class GetCategoryDto {
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number.parseInt(value))
  take?: number;

  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number.parseInt(value))
  skip?: number;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value.replace(/\s{2,}/g, ' ').trim())
  searchTerm?: string;
}

export class FindCategoryDto extends GetCategoryDto {
  @ApiProperty({ type: String, required: false })
  @IsString()
  @Transform(({ value }) => value.replace(/\s{2,}/g, ' ').trim())
  declare searchTerm: string;
}

export class GetCategoryCombinationsDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value.replace(/\s{2,}/g, ' ').trim())
  searchTerm?: string;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value.replace(/(\s{2,}|,{1,})/g, ' ').trim())
  categories?: string;
}
