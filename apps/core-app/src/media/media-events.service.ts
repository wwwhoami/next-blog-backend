import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

export const MEDIA_VARIANTS_READY_EVENT = 'variants-ready';

export type MediaVariantsReadyPayload = {
  mediaId: string;
  ownerId: string;
  variants: Array<{
    key: string;
    publicUrl: string;
  }>;
};

type MediaVariantsReady = {
  status: 'completed';
  payload: MediaVariantsReadyPayload;
};

type MediaVariantsPending = {
  status: 'pending';
  payload: {
    mediaId: string;
  };
};

type MediaVariantsFailed = {
  status: 'failed';
  payload: {
    mediaId: string;
    error: string;
  };
};

export type MediaVariantsStatusMsg =
  | MediaVariantsReady
  | MediaVariantsPending
  | MediaVariantsFailed;

@Injectable()
export class MediaEventsService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private pub: Redis;
  private sub: Redis;
  private channel = 'media:upload-status';

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    super();

    const host = this.configService.get<string>('REDIS_HOST') ?? '127.0.0.1';
    const port = this.configService.get<number>('REDIS_PORT') ?? 6379;
    const password =
      this.configService.get<string>('REDIS_PASSWORD') ?? undefined;

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

        // Emit per-media-ID event for SSE endpoints
        this.emit(`upload.status.${payload.mediaId}`, {
          status: 'completed',
          mediaId: payload.mediaId,
          variants: payload.variants,
        });
        console.log(
          `Emitting the ${MEDIA_VARIANTS_READY_EVENT} event with payload: ${JSON.stringify(payload)}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to parse pubsub message for channel ${this.channel}: ${err}`,
        );
      }
    });
  }

  async onModuleDestroy() {
    await this.pub.quit();
    await this.sub.quit();
  }

  /**
   * Publish an event to all instances
   */
  async publishUploadStatus(message: MediaVariantsStatusMsg) {
    await this.pub.publish(this.channel, JSON.stringify(message));

    // Also emit locally for immediate local listeners
    this.emit(`upload.status.${message.payload.mediaId}`, message);
  }
}
