import { Module } from '@nestjs/common';
import { PrismaModule } from '@core/src/prisma/prisma.module';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';

@Module({
  providers: [UserService, UserRepository],
  imports: [PrismaModule],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
