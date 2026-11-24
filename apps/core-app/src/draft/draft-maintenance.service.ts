import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  CLEANUP_ARCHIVED_REVISIONS_JOB,
  DRAFT_PROCESSOR_QUEUE,
  PENDING_CLAIM_BATCH_SIZE,
} from './constants/draft-processor.constants';
import { DraftPublicationRepository } from './draft-publication.repository';

@Injectable()
export class DraftMaintenanceService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly repo: DraftPublicationRepository,
    @InjectQueue(DRAFT_PROCESSOR_QUEUE)
    private readonly draftQueue: Queue,
  ) {}

  private reconcileTimer?: NodeJS.Timeout;
  private scanning = false;
  private readonly logger = new Logger(DraftMaintenanceService.name);

  /**
   * Checks pending publication claims against BullMQ in batches.
   *
   * Restores the matching draft to `ACTIVE` with a retryable error when its job
   * has failed terminally or when Redis confirms the job is missing after a
   * 30-second enqueue grace period. Logs lookup failures and leaves those
   * claims pending for a later pass.
   *
   * The pass runs at startup and every 15 seconds. Overlapping calls in the
   * same process are skipped.
   */
  async reconcile() {
    if (this.scanning) return;

    this.scanning = true;
    let after: string | undefined;
    let oldestAge = 0;

    try {
      for (;;) {
        const rows = await this.repo.pendingClaims(after);

        await Promise.all(
          rows.map(async ({ id, publicationAttemptId, updatedAt }) => {
            const age = Date.now() - updatedAt.getTime();
            oldestAge = Math.max(age, oldestAge);

            if (!publicationAttemptId) return;

            try {
              const state =
                await this.draftQueue.getJobState(publicationAttemptId);
              const missing =
                state === 'unknown' &&
                age >= 30000 &&
                !(await this.draftQueue.getJob(publicationAttemptId));

              if (state === 'failed' || missing) {
                await this.repo.markValidationFailed(
                  id,
                  publicationAttemptId,
                  'Publication interrupted. Please publish again.',
                );
              }
            } catch (error) {
              this.logger.error(error);
            }
          }),
        );
        if (rows.length < PENDING_CLAIM_BATCH_SIZE) break;

        after = rows[rows.length - 1].id;
      }
      if (oldestAge)
        this.logger.log(`Oldest pending publication claim: ${oldestAge} ms`);
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Clears the reconciliation timer during module shutdown
   */
  onModuleDestroy() {
    clearInterval(this.reconcileTimer);
  }

  /**
   * Starts publication reconciliation and registers daily archived revision cleanup.
   *
   * Runs the first reconciliation pass in the background and schedules later
   * passes every 15 seconds on a timer that allows the process to exit.
   * Waits for BullMQ to register the recurring cleanup job.
   */
  async onModuleInit() {
    void this.reconcile();
    this.reconcileTimer = setInterval(() => void this.reconcile(), 15000);
    this.reconcileTimer.unref();
    await this.draftQueue.add(
      CLEANUP_ARCHIVED_REVISIONS_JOB,
      {},
      {
        jobId: CLEANUP_ARCHIVED_REVISIONS_JOB,
        repeat: { every: 24 * 60 * 60 * 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
