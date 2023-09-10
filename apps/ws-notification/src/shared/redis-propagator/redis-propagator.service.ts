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

  /**
   * @param server Socket server to be injected
   * @description Inject socket server to be used to emit events
   * @returns RedisPropagatorService
   */
  injectSocketServer(server: Server): RedisPropagatorService {
    this.socketServer = server;
    return this;
  }

  /**
   * @param eventInfo Event to be emitted
   * @description Emit event to all connected sockets of a user
   */
  private consumeSendEvent = (eventInfo: RedisSocketEventSendDTO) => {
    const { userId, event, data, socketId } = eventInfo;

    const userSockets = this.socketStateService.get(userId);

    return userSockets
      .filter((socket) => socket.id !== socketId)
      .forEach((socket) => socket.emit(event, data));
  };

  /**
   *
   * @param eventInfo Event to be emitted
   * @description Emit event to all connected sockets
   */
  private consumeEmitToAllEvent = (eventInfo: RedisSocketEventEmitDTO) => {
    this.socketServer.emit(eventInfo.event, eventInfo.data);
  };

  /**
   * @param eventInfo Event to be emitted
   * @description Emit event to all authenticated sockets
   * @todo Add support to emit to a specific socket
   */
  private consumeEmitToAuthenticatedEvent = (
    eventInfo: RedisSocketEventEmitDTO,
  ) => {
    const { event, data } = eventInfo;

    return this.socketStateService.getAll().forEach((socket) => {
      socket.emit(event, data);
    });
  };

  /**
   * @param eventInfo Event to be emitted
   * @description Propagate to emit event to all connected sockets of a user
   * @returns true if event was propagated
   */
  propagateSendEvent(eventInfo: RedisSocketEventSendDTO): boolean {
    if (!eventInfo.userId) {
      return false;
    }

    this.redisService.publish(REDIS_SOCKET_EVENT_SEND_NAME, eventInfo);

    return true;
  }

  /**
   * @param eventInfo Event to be emitted
   * @description Propagate to emit event to all connected sockets
   */
  propagateEmitToAll(eventInfo: RedisSocketEventEmitDTO) {
    this.redisService.publish(REDIS_SOCKET_EVENT_EMIT_ALL_NAME, eventInfo);
  }

  /**
   * @param eventInfo Event to be emitted
   * @description Propagate to emit event to all authenticated sockets
   */
  propagateEmitToAuthenticated(eventInfo: RedisSocketEventEmitDTO) {
    this.redisService.publish(
      REDIS_SOCKET_EVENT_EMIT_AUTHENTICATED_NAME,
      eventInfo,
    );
  }
}
