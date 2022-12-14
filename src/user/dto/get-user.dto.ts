import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';

export class GetUserDto {
  @ValidateIf((user: GetUserDto) => Boolean(user.name))
  @IsOptional()
  @IsString()
  name?: string;

  @ValidateIf((user: GetUserDto) => Boolean(!user.name))
  @IsOptional()
  @IsEmail()
  email?: string;
}
