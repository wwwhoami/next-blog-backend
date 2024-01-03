import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { PrismaService } from './prisma.service';

@Module({
  imports: [LoggerModule.forRoot({ useExisting: true })],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
