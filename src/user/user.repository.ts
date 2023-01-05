import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
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
  async getByUuid<B extends boolean, T extends boolean>(
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
  async getByName<B extends boolean, T extends boolean>(
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
  async getByEmail<B extends boolean, T extends boolean>(
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

  async create(user: CreateUserDto): Promise<UserNoPasswordEntity> {
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
}
