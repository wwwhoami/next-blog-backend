export class UserEntity {
  id?: string;
  email: string;
  name: string;
  image: string;
}

export class UserWithPasswordEntity extends UserEntity {
  password: string;
}
