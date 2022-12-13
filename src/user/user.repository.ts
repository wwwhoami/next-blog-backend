import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
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
}
