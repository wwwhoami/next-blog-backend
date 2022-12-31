import { Injectable } from '@nestjs/common';
import { genSalt, hash } from 'bcrypt';
import { WrongParamsError } from 'src/common/errors/wrong-params.error';
import { CreateUserDto } from './dto/create-user.dto';
import { GetUserDto } from './dto/get-user.dto';
import { UserNoPasswordEntity } from './entities/user.entity';
import { UserType } from './types/user-with-password-or-user.type';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(private userRepository: UserRepository) {}

  /**
   *
   * @param {Object} param0 - Params to find the user by, one of should be defined, finding by name being prioritized.
   * @param {string} param0.name - User's name.
   * @param {string} param0.email - User's email.
   * @param {Object} returnOptions - Additional user's data to return.
   * @param {boolean} [returnOptions.id] - If provided, user's data with id will be returned.
   * @param {boolean} [returnOptions.password] - If provided, user's data with password will be returned.
   * if fully omitted (or partly) data with no id and (or) password will be returned
   * @returns User's data
   */
  async getUser<B extends boolean, T extends boolean>(
    { name = undefined, email = undefined, id = undefined }: GetUserDto,
    returnOptions?: { id?: T; password?: B },
  ): Promise<UserType<B, T>> {
    if (id) return this.userRepository.getByUuid(id, returnOptions);
    else if (name) return this.userRepository.getByName(name, returnOptions);
    else if (email) return this.userRepository.getByEmail(email, returnOptions);

    throw new WrongParamsError(
      'Neither of { name, email, id } parameters provided',
    );
  }

  async createUser(
    user: CreateUserDto,
  ): Promise<UserNoPasswordEntity | undefined> {
    const salt = await genSalt(10);
    const encryptedPassword = await hash(user.password, salt);

    return this.userRepository.createUser({
      ...user,
      password: encryptedPassword,
    });
  }
}
