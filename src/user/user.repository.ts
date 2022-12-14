import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserEntity } from './entities/user.entity';
import { UserWithPasswordOrUserType } from './types/user-with-password-or-user.type';

@Injectable()
export class UserRepository {
  constructor(private prisma: PrismaService) {}

  async getByUuid<B extends boolean>(
    uuid: string,
    returnPassword?: B,
  ): Promise<UserWithPasswordOrUserType<B>> {
    return this.prisma.user.findUnique({
      select: {
        name: true,
        email: true,
        image: true,
        password: returnPassword as boolean,
      },
      where: {
        id: uuid,
      },
    });
  }

  async getByName<B extends boolean>(
    name: string,
    returnPassword?: B,
  ): Promise<UserWithPasswordOrUserType<B>> {
    return this.prisma.user.findUnique({
      select: {
        name: true,
        email: true,
        image: true,
        password: returnPassword as boolean,
      },
      where: {
        name,
      },
    });
  }

  async getByEmail<B extends boolean>(
    email: string,
    returnPassword?: B,
  ): Promise<UserWithPasswordOrUserType<B>> {
    return this.prisma.user.findUnique({
      select: {
        name: true,
        email: true,
        image: true,
        password: returnPassword as boolean,
      },
      where: {
        email,
      },
    });
  }

  async createUser(user: CreateUserDto): Promise<UserEntity> {
    return this.prisma.user.create({
      data: user,
      select: {
        name: true,
        email: true,
        image: true,
      },
    });
  }
}
