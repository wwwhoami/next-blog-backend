import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SocketStateService } from './socket-state.service';

@Module({
  providers: [SocketStateService],
  exports: [SocketStateService],
  imports: [JwtModule.register({})],
})
export class SocketStateModule {}
