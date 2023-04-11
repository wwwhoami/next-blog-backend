import { RedisSocketEventEmitDTO } from './socket-event-emit';

export class RedisSocketEventSendDTO extends RedisSocketEventEmitDTO {
  readonly userId: string;
  readonly socketId?: string;
}
