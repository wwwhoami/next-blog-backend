import { UseInterceptors } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { RedisPropagatorInterceptor } from '../shared/redis-propagator/redis-propagator.interceptor';

@UseInterceptors(RedisPropagatorInterceptor)
@WebSocketGateway()
export class NotificationGateway {}
