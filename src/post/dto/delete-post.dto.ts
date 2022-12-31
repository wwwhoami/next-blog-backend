import { IsNumber, IsString, ValidateIf } from 'class-validator';

export class DeletePostDto {
  @ValidateIf((user: DeletePostDto) => Boolean(user.id))
  @IsNumber()
  id?: number;

  @ValidateIf((user: DeletePostDto) => Boolean(!user.id))
  @IsString()
  slug?: string;
}
