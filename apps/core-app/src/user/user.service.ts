import { WrongParamsError } from '@core/src/common/errors/wrong-params.error';
import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { GetUserDto } from './dto/get-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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
  async get<B extends boolean, T extends boolean>(
    { name, email, id }: GetUserDto,
    returnOptions?: { id?: T; password?: B },
  ): Promise<UserType<B, T>> {
    if (id) return this.userRepository.getByUuid(id, returnOptions);
    else if (name) return this.userRepository.getByName(name, returnOptions);
    else if (email) return this.userRepository.getByEmail(email, returnOptions);

    throw new WrongParamsError(
      'Neither of { name, email, id } parameters provided',
    );
  }

  async create(user: CreateUserDto): Promise<UserNoPasswordEntity | undefined> {
    return this.userRepository.create(user);
  }

  async update(id: string, user: UpdateUserDto): Promise<UserNoPasswordEntity> {
    return this.userRepository.update(id, user);
  }

  follow(
    followerId: string,
    followedId: string,
  ): Promise<{ followerId: string; followingId: string }> {
    return this.userRepository.follow(followerId, followedId);
  }

  unfollow(
    followerId: string,
    followedId: string,
  ): Promise<{ followerId: string; followingId: string }> {
    return this.userRepository.unfollow(followerId, followedId);
  }

  /**
   * @param {string} userId - Id of the user to find the followers list for.
   * @param {Object} returnOptions - Additional user's data to return.
   * @param {boolean} [returnOptions.id] - If not provided, user's data with no id will be returned.
   * @returns List of followers
   * @description
   * If returnOptions.id is not provided, user's data with no id will be returned.
   */
  getFollowers<T extends boolean>(
    userId: string,
    returnOptions?: { id?: T },
  ): Promise<NonNullable<UserType<false, T>>[]> {
    return this.userRepository.getFollowers(userId, returnOptions);
  }

  /**
   * @param {string} userId - Id of the user to find the following list for.
   * @param {Object} returnOptions - Additional user's data to return.
   * @param {boolean} [returnOptions.id] - If not provided, user's data with no id will be returned.
   * @returns List of following
   * @description
   * If returnOptions.id is not provided, user's data with no id will be returned
   */
  getFollowing<T extends boolean>(
    userId: string,
    returnOptions?: { id?: T },
  ): Promise<NonNullable<UserType<false, T>>[]> {
    return this.userRepository.getFollowing(userId, returnOptions);
  }
}
