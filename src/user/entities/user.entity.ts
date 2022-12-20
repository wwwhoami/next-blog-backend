import { User } from '@prisma/client';

export class UserEntity implements User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  password: string;
}

export class UserNoIdEntity implements Omit<User, 'id'> {
  email: string;
  name: string;
  image: string | null;
  password: string;
}

export class UserNoPasswordEntity implements Omit<User, 'password'> {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export class UserNoIdPasswordEntity implements Omit<User, 'id' | 'password'> {
  email: string;
  name: string;
  image: string | null;
}
