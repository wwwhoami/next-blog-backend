import { UseInterceptors } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { RedisPropagatorInterceptor } from '../shared/redis-propagator/redis-propagator.interceptor';

@UseInterceptors(RedisPropagatorInterceptor)
@WebSocketGateway()
export class NotificationGateway {
  // @UseGuards(AuthGuard('jwt-access'))
  // @SubscribeMessage('message')
  // handleMessage(client: any, payload: any): WsResponse<string> {
  //   return { event: 'message', data: 'Hello world!' };
  // }
  // @SubscribeMessage('events')
  // handleEvent(client: any, payload: any) {
  //   this.redisPropogatorService.consumeUserUnsentEvents(payload.userId);
  // }
}
