import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @ValidateIf((user: UpdateUserDto) => Boolean(user.newPassword))
  @IsString()
  @MinLength(8)
  @MaxLength(60)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(60)
  newPassword?: string;

  @IsOptional()
  @IsUrl()
  image?: string;
}
