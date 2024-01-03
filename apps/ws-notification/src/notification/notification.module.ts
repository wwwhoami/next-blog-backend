import { Module } from '@nestjs/common';
import { RedisPropagatorModule } from '../shared/redis-propagator/redis-propagator.module';
import { NotificationGateway } from './notification.gateway';

@Module({
  providers: [NotificationGateway],
  imports: [RedisPropagatorModule],
})
export class NotificationModule {}
