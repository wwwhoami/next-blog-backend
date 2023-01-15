import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCommentDto {
  @IsOptional()
  @IsNumber()
  ancestorId?: number;

  @IsNumber()
  postId: number;

  @IsString()
  content: string;
}
export class CreateResponseToCommentDto {
  @IsNumber()
  ancestorId: number;

  @IsNumber()
  postId: number;

  @IsString()
  content: string;
}
