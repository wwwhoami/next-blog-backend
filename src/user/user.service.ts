import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { genSalt, hash } from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { GetUserDto } from './dto/get-user.dto';
import { UserWithPasswordOrUserType } from './types/user-with-password-or-user.type';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(private userRepository: UserRepository) {}

  async getUser<B extends boolean>(
    { name = undefined, email = undefined }: GetUserDto,
    returnPassword?: B,
  ): Promise<NonNullable<UserWithPasswordOrUserType<B>>> {
    let user: UserWithPasswordOrUserType<B>;

    if (name) {
      user = await this.userRepository.getByName(name, returnPassword);

      if (!user)
        throw new NotFoundException(`User with name ${name} not found`);

      return user;
    } else if (email) {
      user = await this.userRepository.getByEmail(email, returnPassword);

      if (!user)
        throw new NotFoundException(`User with email ${email} not found`);

      return user;
    }

    throw new Error('Neither name nor email was provided');
  }

  async createUser(user: CreateUserDto) {
    const salt = await genSalt(10);
    const encryptedPassword = await hash(user.password, salt);

    try {
      return await this.userRepository.createUser({
        ...user,
        password: encryptedPassword,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        if (error.meta?.target instanceof Array) {
          if (error.meta.target.includes('name'))
            throw new ConflictException(
              `User with provided name already exists`,
            );
          else if (error.meta.target.includes('email'))
            throw new ConflictException(
              `User with provided email already exists`,
            );
        }
    }
  }
}
