import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(private prisma: PrismaService) {}

  async getByUuid(uuid: string): Promise<UserEntity | null> {
    return this.prisma.user.findUnique({
      select: {
        name: true,
        email: true,
        image: true,
      },
      where: {
        id: uuid,
      },
    });
  }

  async getByName(username: string): Promise<UserEntity | null> {
    return this.prisma.user.findUnique({
      select: {
        name: true,
        email: true,
        image: true,
      },
      where: {
        name: username,
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
