import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UserEntity } from './entities/user.entity';
import { UserRepository } from './user.repository';
import { genSalt, hash } from 'bcrypt';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private userRepository: UserRepository) {}

  async getUser(username: string): Promise<UserEntity> {
    const user = await this.userRepository.getByName(username);

    if (!user)
      throw new NotFoundException(`User with name ${username} not found`);

    return user;
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
