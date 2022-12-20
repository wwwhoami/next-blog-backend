import {
  UserEntity,
  UserNoIdEntity,
  UserNoIdPasswordEntity,
  UserNoPasswordEntity,
} from '../entities/user.entity';

export type UserType<B extends boolean, T extends boolean> = [B] extends [true]
  ? [T] extends [true]
    ? UserEntity | null
    : UserNoIdEntity | null
  : [T] extends [true]
  ? UserNoPasswordEntity | null
  : UserNoIdPasswordEntity | null;
