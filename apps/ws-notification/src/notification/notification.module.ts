import { Module } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';
import { RedisPropagatorModule } from '../shared/redis-propagator/redis-propagator.module';

@Module({
  providers: [NotificationGateway],
  imports: [RedisPropagatorModule],
})
export class NotificationModule {}
