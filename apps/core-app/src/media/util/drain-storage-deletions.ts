import { PinoLogger } from 'nestjs-pino';
import { StorageService } from '../../storage/storage.service';
import { MediaRepository } from '../media.repository';

/**
 * Processes due entries in the media storage deletion outbox. Acknowledges each
 * entry after deleting its object. Logs failures and attempts to defer the
 * affected entry for retry before continuing with the next one.
 *
 * @param repo - Repository that reads and updates the deletion outbox.
 * @param storage - Storage service that deletes objects by bucket and key.
 * @param logger - Logger for deletion and retry scheduling failures.
 * @param objects - Optional bucket and key pairs that limit processing to those
 * objects. When omitted, processes up to 20 due entries.
 */
export async function drainStorageDeletions(
  repo: MediaRepository,
  storage: StorageService,
  logger: PinoLogger,
  objects?: { key: string; bucket: string }[],
) {
  const pending = await repo.findPendingStorageDeletions(objects);
  for (const { id, key, bucket, nextAttemptAt } of pending) {
    try {
      await storage.deleteObject(key, bucket);
      await repo.acknowledgeStorageDeletion(id, nextAttemptAt);
    } catch (error) {
      logger.warn({ err: error, key, bucket }, 'Media storage deletion failed');
      await repo
        .deferStorageDeletion(id, nextAttemptAt)
        .catch((deferError: unknown) => {
          logger.warn(
            { err: deferError, key, bucket },
            'Media deletion retry could not be deferred',
          );
        });
    }
  }
}
