import {
  REDIS_PUBLISHER_CLIENT,
  REDIS_SUBSCRIBER_CLIENT,
} from '@app/shared/redis';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { Observable, Observer, filter, map } from 'rxjs';
import { RedisSocketEventSendDTO } from '../redis-propagator/dto/socket-event-send';

export type RedisSubscribeMessage = {
  readonly channel: string;
  readonly message: string;
};

@Injectable()
export class RedisService {
  constructor(
    @Inject(REDIS_SUBSCRIBER_CLIENT) private readonly subscriber: Redis,
    @Inject(REDIS_PUBLISHER_CLIENT) private readonly publisher: Redis,
  ) {}

  /**
   * @param eventName Event to be subscribed to
   * @description Subscribe to a Redis channel
   * @returns Observable
   */
  fromEvent<T extends RedisSocketEventSendDTO>(
    eventName: string,
  ): Observable<T> {
    this.subscriber.subscribe(eventName);

    return new Observable((observer: Observer<RedisSubscribeMessage>) =>
      this.subscriber.on('message', (channel, message) =>
        observer.next({ channel, message }),
      ),
    ).pipe(
      filter(({ channel }) => channel === eventName),
      map(({ message }) => JSON.parse(message)),
    );
  }

  /**
   * @param channel Channel to publish to
   * @param data Data to be published
   * @description Publish data to a Redis channel
   */
  async publish(channel: string, data: unknown): Promise<number> {
    return this.publisher.publish(channel, JSON.stringify(data));
  }
}
