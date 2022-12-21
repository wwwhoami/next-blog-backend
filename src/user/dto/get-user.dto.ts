import { IsEmail, IsString, IsUUID, ValidateIf } from 'class-validator';

export class GetUserDto {
  @ValidateIf((user: GetUserDto) => Boolean(user.id))
  @IsUUID()
  id?: string;

  @ValidateIf((user: GetUserDto) => Boolean(!user.id))
  @IsString()
  name?: string;

  @ValidateIf((user: GetUserDto) => Boolean(!user.name))
  @IsEmail()
  email?: string;
}
