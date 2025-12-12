import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import Redis from 'ioredis';

export const MEDIA_VARIANTS_READY_EVENT = 'variants-ready';

export type MediaVariantsReadyPayload = {
  mediaId: string;
  variants: Array<{
    key: string;
    publicUrl: string;
  }>;
};

@Injectable()
export class MediaEventsService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private pub: Redis;
  private sub: Redis;
  private channel = 'media:variants-ready';

  constructor(private readonly configService: ConfigService) {
    super();

    const host = configService.get<string>('REDIS_HOST') ?? '127.0.0.1';
    const port = configService.get<number>('REDIS_PORT') ?? 6379;
    const password = configService.get<string>('REDIS_PASSWORD') ?? undefined;

    this.pub = new Redis({
      host,
      port,
      password,
    });
    this.sub = new Redis({
      host,
      port,
      password,
    });
  }

  async onModuleInit() {
    await this.sub.subscribe(this.channel);
    this.sub.on('message', (_channel, message) => {
      try {
        const payload = JSON.parse(message);
        // Emit locally so SSE endpoints (same process) can subscribe using EventEmitter
        this.emit(MEDIA_VARIANTS_READY_EVENT, payload);
      } catch (err) {
        console.error('Failed to parse pubsub message', err);
      }
    });
  }

  async onModuleDestroy() {
    await this.pub.quit();
    await this.sub.quit();
  }

  // Publish an event to all instances
  async publishVariantsReady(payload: MediaVariantsReadyPayload) {
    await this.pub.publish(this.channel, JSON.stringify(payload));
    // Also emit locally for immediate local listeners
    this.emit(MEDIA_VARIANTS_READY_EVENT, payload);
  }
}
