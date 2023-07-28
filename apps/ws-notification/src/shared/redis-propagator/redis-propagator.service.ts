import { Injectable } from '@nestjs/common';
import { tap } from 'rxjs';
import { Server } from 'socket.io';
import { RedisService } from '../redis/redis.service';
import { SocketStateService } from '../socket-state/socket-state.service';
import { RedisSocketEventEmitDTO } from './dto/socket-event-emit';
import { RedisSocketEventSendDTO } from './dto/socket-event-send';
import {
  REDIS_SOCKET_EVENT_EMIT_ALL_NAME,
  REDIS_SOCKET_EVENT_EMIT_AUTHENTICATED_NAME,
  REDIS_SOCKET_EVENT_SEND_NAME,
} from './redis-propagator.constants';

@Injectable()
export class RedisPropagatorService {
  private socketServer: Server;

  constructor(
    private readonly socketStateService: SocketStateService,
    private readonly redisService: RedisService,
  ) {
    this.redisService
      .fromEvent(REDIS_SOCKET_EVENT_SEND_NAME)
      .pipe(tap(this.consumeSendEvent))
      .subscribe();

    this.redisService
      .fromEvent(REDIS_SOCKET_EVENT_EMIT_ALL_NAME)
      .pipe(tap(this.consumeEmitToAllEvent))
      .subscribe();

    this.redisService
      .fromEvent(REDIS_SOCKET_EVENT_EMIT_AUTHENTICATED_NAME)
      .pipe(tap(this.consumeEmitToAuthenticatedEvent))
      .subscribe();
  }

  injectSocketServer(server: Server): RedisPropagatorService {
    this.socketServer = server;
    return this;
  }

  private consumeSendEvent = (eventInfo: RedisSocketEventSendDTO) => {
    const { userId, event, data, socketId } = eventInfo;

    const userSockets = this.socketStateService.get(userId);

    return userSockets
      .filter((socket) => socket.id !== socketId)
      .forEach((socket) => socket.emit(event, data));
  };

  private consumeEmitToAllEvent = (eventInfo: RedisSocketEventEmitDTO) => {
    this.socketServer.emit(eventInfo.event, eventInfo.data);
  };

  private consumeEmitToAuthenticatedEvent = (
    eventInfo: RedisSocketEventEmitDTO,
  ) => {
    const { event, data } = eventInfo;

    return this.socketStateService.getAll().forEach((socket) => {
      socket.emit(event, data);
    });
  };

  propagateEvent(eventInfo: RedisSocketEventSendDTO): boolean {
    if (!eventInfo.userId) {
      return false;
    }

    this.redisService.publish(REDIS_SOCKET_EVENT_SEND_NAME, eventInfo);
    return true;
  }

  emitToAuthenticated(eventInfo: RedisSocketEventEmitDTO) {
    this.redisService.publish(
      REDIS_SOCKET_EVENT_EMIT_AUTHENTICATED_NAME,
      eventInfo,
    );
  }

  emitToAll(eventInfo: RedisSocketEventEmitDTO) {
    this.redisService.publish(REDIS_SOCKET_EVENT_EMIT_ALL_NAME, eventInfo);
  }
}
