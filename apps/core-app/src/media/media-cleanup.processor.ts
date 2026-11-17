import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { StorageService } from '../storage/storage.service';
import { drainStorageDeletions } from './drain-storage-deletions';
import { MediaRepository } from './media.repository';

export const MEDIA_CLEANUP_QUEUE = 'media-cleanup';
const DAY_MS = 24 * 60 * 60 * 1000;

@Processor(MEDIA_CLEANUP_QUEUE)
export class MediaCleanupProcessor extends WorkerHost {
  constructor(
    @InjectQueue(MEDIA_CLEANUP_QUEUE) private readonly queue: Queue,
    private readonly repo: MediaRepository,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(MediaCleanupProcessor.name);
  }

  /**
   * Registers recurring retention cleanup and outbox draining with queue-
   * wide concurrency of one.
   */
  async onModuleInit() {
    await this.queue.setGlobalConcurrency(1);
    const opts = { removeOnComplete: true, removeOnFail: 100 };
    await this.queue.upsertJobScheduler(
      'cleanupUnattached',
      { every: DAY_MS },
      {
        name: 'cleanupUnattached',
        opts,
      },
    );
    await this.queue.upsertJobScheduler(
      'drainStorage',
      { every: 5 * 60 * 1000 },
      {
        name: 'drainStorage',
        opts,
      },
    );
  }

  /**
   * Deletes expired unattached media or recovers interrupted uploads before
   * draining the storage outbox.
   *
   * @param job - Scheduled retention cleanup or outbox drain job.
   * @returns The deleted-family count for retention jobs.
   */
  async process(job: Job) {
    if (job.name === 'cleanupUnattached') {
      const days = Number(
        this.config.get<number>('MEDIA_UNATTACHED_RETENTION_DAYS') ?? 30,
      );
      const cutoff = new Date(Date.now() - days * DAY_MS);
      let deleted = 0;
      for (const { id } of await this.repo.findUnattachedBefore(cutoff)) {
        if (await this.repo.deleteUnattachedBefore(id, cutoff)) deleted++;
      }
      return { deleted };
    }
    if (job.name === 'drainStorage') {
      await this.repo.expireUploadReservations();
      await this.repo.recoverOrphanedVariantPuts();
      await drainStorageDeletions(this.repo, this.storage, this.logger);
    }
  }
}
