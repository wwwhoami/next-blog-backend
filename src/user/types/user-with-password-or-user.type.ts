import { UserEntity, UserWithPasswordEntity } from '../entities/user.entity';

export type UserWithPasswordOrUserType<B extends boolean> = [B] extends [true]
  ? UserWithPasswordEntity | null
  : UserEntity | null;
