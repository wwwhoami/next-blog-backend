import { PrismaModule } from '@app/prisma';
import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

@Module({
  providers: [UserService, UserRepository],
  imports: [PrismaModule],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
