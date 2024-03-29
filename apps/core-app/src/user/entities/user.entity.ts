import { ApiProperty, OmitType, PickType } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';

export class UserEntity implements User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  password: string;

  @ApiProperty({ enum: Role })
  role: Role;
}

export class UserNameImageEntity extends PickType(UserEntity, [
  'name',
  'image',
] as const) {}

export class UserNameImage {
  user: UserNameImageEntity;
}

export class UserNoIdEntity extends OmitType(UserEntity, ['id'] as const) {}

export class UserNoPasswordEntity extends OmitType(UserEntity, [
  'password',
] as const) {}

export class UserNoIdPasswordEntity extends OmitType(UserEntity, [
  'password',
  'id',
] as const) {}
