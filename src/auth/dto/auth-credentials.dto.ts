import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AuthCredentialsDto {
  @ValidateIf((user: AuthCredentialsDto) => Boolean(user.name))
  @IsOptional()
  @IsString()
  name?: string;

  @ValidateIf((user: AuthCredentialsDto) => Boolean(!user.name))
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(60)
  password: string;
}
