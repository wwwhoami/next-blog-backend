import { PrismaService } from '@app/prisma';
import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserNoPasswordEntity } from './entities/user.entity';
import { UserType } from './types/user-with-password-or-user.type';

@Injectable()
export class UserRepository {
  constructor(private prisma: PrismaService) {}

  /**
   *
   * @param uuid - Id to find the user by.
   * @param {Object} returnOptions - Additional user's data to return.
   * @param {boolean} [returnOptions.id] - If provided, user's data with id will be returned.
   * @param {boolean} [returnOptions.password] - If provided, user's data with password will be returned.
   * if fully omitted (or partly) data with no id and (or) password will be returned
   * @returns User's data
   */
  getByUuid<B extends boolean, T extends boolean>(
    uuid: string,
    returnOptions?: { id?: T; password?: B },
  ): Promise<UserType<B, T>> {
    return this.prisma.user.findUnique({
      select: {
        id: (returnOptions?.id as boolean) ?? false,
        name: true,
        email: true,
        image: true,
        password: (returnOptions?.password as boolean) ?? false,
        role: true,
      },
      where: {
        id: uuid,
      },
    });
  }

  /**
   *
   * @param name - Name to find the user by.
   * @param {Object} returnOptions - Additional user's data to return.
   * @param {boolean} [returnOptions.id] - If provided, user's data with id will be returned.
   * @param {boolean} [returnOptions.password] - If provided, user's data with password will be returned.
   * if fully omitted (or partly) data with no id and (or) password will be returned
   * @returns User's data
   */
  getByName<B extends boolean, T extends boolean>(
    name: string,
    returnOptions?: { id?: T; password?: B },
  ): Promise<UserType<B, T>> {
    return this.prisma.user.findUnique({
      select: {
        id: (returnOptions?.id as boolean) ?? false,
        name: true,
        email: true,
        image: true,
        password: (returnOptions?.password as boolean) ?? false,
        role: true,
      },
      where: {
        name,
      },
    });
  }

  /**
   *
   * @param email - Email to find the user by.
   * @param {Object} returnOptions - Additional user's data to return.
   * @param {boolean} [returnOptions.id] - If provided, user's data with id will be returned.
   * @param {boolean} [returnOptions.password] - If provided, user's data with password will be returned.
   * if fully omitted (or partly) data with no id and (or) password will be returned
   * @returns User's data
   */
  getByEmail<B extends boolean, T extends boolean>(
    email: string,
    returnOptions?: { id?: T; password?: B },
  ): Promise<UserType<B, T>> {
    return this.prisma.user.findUnique({
      select: {
        id: (returnOptions?.id as boolean) ?? false,
        name: true,
        email: true,
        image: true,
        password: (returnOptions?.password as boolean) ?? false,
        role: true,
      },
      where: {
        email,
      },
    });
  }

  /**
   * @param {CreateUserDto} user - User's data to create.
   * @returns User's data without password
   */
  create(user: CreateUserDto): Promise<UserNoPasswordEntity> {
    return this.prisma.user.create({
      data: user,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
      },
    });
  }

  update(
    id: string,
    { name, email, image, newPassword }: UpdateUserDto,
  ): Promise<UserNoPasswordEntity> {
    return this.prisma.user.update({
      where: {
        id,
      },
      data: {
        name,
        email,
        image,
        password: newPassword,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
      },
    });
  }

  /**
   * @param {string} followerId - Id of the user who wants to follow.
   * @param {string} followingId - Id of the user to be followed.
   */
  follow(
    followerId: string,
    followingId: string,
  ): Promise<{ followerId: string; followingId: string }> {
    return this.prisma.follows.create({
      data: {
        follower: {
          connect: {
            id: followerId,
          },
        },
        following: {
          connect: {
            id: followingId,
          },
        },
      },
      select: {
        followerId: true,
        followingId: true,
      },
    });
  }

  /**
   * @param {string} followerId - Id of the user who wants to unfollow.
   * @param {string} followingId - Id of the user to be unfollowed.
   */
  unfollow(
    followerId: string,
    followingId: string,
  ): Promise<{ followerId: string; followingId: string }> {
    return this.prisma.follows.delete({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
      select: {
        followerId: true,
        followingId: true,
      },
    });
  }

  /**
   * @param {string} userId - Id of the user to find the followers list for.
   * @param {Object} returnOptions - Additional user's data to return.
   * @param {boolean} [returnOptions.id] - If not provided, user's data with no id will be returned.
   * @returns List of user's followers
   * @description
   * If returnOptions.id is not provided, user's data with no id will be returned.
   */
  getFollowers<T extends boolean>(
    userId: string,
    returnOptions?: { id?: T },
  ): Promise<NonNullable<UserType<false, T>>[]> {
    return this.prisma.user.findMany({
      where: {
        followers: {
          some: {
            followingId: userId,
          },
        },
      },
      select: {
        id: (returnOptions?.id as boolean) ?? false,
        name: true,
        email: true,
        image: true,
        role: true,
      },
    });
  }

  /**
   * @param {string} userId - Id of the user to find the following list for.
   * @param {Object} returnOptions - Additional user's data to return.
   * @param {boolean} [returnOptions.id] - If not provided, user's data no with id will be returned.
   * @returns List of users followed by the user
   * @description
   * If returnOptions.id is not provided, user's data with no id will be returned.
   */
  getFollowing<T extends boolean>(
    userId: string,
    returnOptions?: { id?: T },
  ): Promise<NonNullable<UserType<false, T>>[]> {
    return this.prisma.user.findMany({
      where: {
        following: {
          some: {
            followerId: userId,
          },
        },
      },
      select: {
        id: (returnOptions?.id as boolean) ?? false,
        name: true,
        email: true,
        image: true,
        role: true,
      },
    });
  }
}
