import { PrismaService } from '@app/prisma';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  DraftStatus,
  MediaTarget,
  MediaType,
  MediaVariant,
  MediaVariantPutIntent,
  Prisma,
} from 'prisma/generated/client';
import { MediaCreate } from './types/media-create.type';
import { originalMedia } from './util/managed-media';

const referenceLinks = {
  postMedia: { select: { postId: true }, orderBy: { postId: 'asc' } },
  draftMedia: {
    select: { draft: { select: { id: true, status: true } } },
    orderBy: { draftId: 'asc' },
  },
  commentMedia: { select: { commentId: true }, orderBy: { commentId: 'asc' } },
  avatarUsers: { select: { id: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.MediaSelect;

const hasReferences: Prisma.MediaWhereInput = {
  OR: [
    { postMedia: { some: {} } },
    { draftMedia: { some: {} } },
    { commentMedia: { some: {} } },
    { avatarUsers: { some: {} } },
  ],
};

@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the owner/author ID for a given media.
   * @param id - The media ID
   * @returns An object containing the author ID
   * @throws {PrismaClientKnownRequestError} If the media is not found
   */
  async getAuthorId(id: string) {
    const author = await this.prisma.media.findUniqueOrThrow({
      where: { id },
      select: { ownerId: true },
    });

    return { authorId: author.ownerId };
  }

  /**
   * Finds a media record by its ID.
   * @param id - The media ID
   * @returns The media record or null if not found
   */
  async findById(id: string) {
    return this.prisma.media.findUnique({ where: { id } });
  }

  /**
   * Lists media owned by a user, optionally filtered by attachment state.
   *
   * @param ownerId - The media owner's ID.
   * @param attached - Whether to return attached, unattached, or all media.
   * @returns Media records with their variants, newest first.
   */
  async findOwnedMedia(ownerId: string, attached?: boolean) {
    return this.prisma.media.findMany({
      where: {
        ownerId,
        ...originalMedia,
        ...(attached === true
          ? hasReferences
          : attached === false
            ? { NOT: hasReferences }
            : {}),
      },
      include: { variants: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findReferences(id: string, ownerId: string) {
    const media = await this.prisma.$transaction(
      (tx) =>
        tx.media.findFirst({
          where: { id, ownerId, deletedAt: null },
          select: {
            ...referenceLinks,
            parent: {
              select: { ownerId: true, deletedAt: true, ...referenceLinks },
            },
          },
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const original = media?.parent ?? media;
    if (
      !original ||
      (media?.parent &&
        (media.parent.deletedAt ||
          media.parent.ownerId !== ownerId.toLowerCase()))
    ) {
      throw new NotFoundException('Media not found');
    }
    return this.presentReferences(original);
  }

  private presentReferences(
    links: Prisma.MediaGetPayload<{ select: typeof referenceLinks }>,
  ) {
    return {
      postIds: links.postMedia.map(({ postId }) => postId),
      drafts: links.draftMedia.map(({ draft }) => draft),
      commentIds: links.commentMedia.map(({ commentId }) => commentId),
      avatarUserIds: links.avatarUsers.map(({ id }) => id),
    };
  }

  /**
   * Finds a media record by its storage key.
   * @param key - The storage key
   * @returns The media record or null if not found
   */
  async findByKey(key: string) {
    return this.prisma.media.findUnique({ where: { key } });
  }

  /**
   * Finds a media record by its ID, including all variants.
   * @param id - The media ID
   * @returns The media record with variants or null if not found
   */
  async findByIdWithVariants(id: string) {
    return this.prisma.media.findUnique({
      where: { id },
      include: { variants: true },
    });
  }

  /**
   * Finds a media record by its storage key, including all variants.
   * @param key - The storage key
   * @returns The media record with variants or null if not found
   */
  async findByKeyWithVariants(key: string) {
    return this.prisma.media.findUnique({
      where: { key },
      include: { variants: true },
    });
  }

  /**
   * Reuses media within the upload scope or reserves a key before writing to
   * storage outside the transaction.
   *
   * @param ownerId - Media owner.
   * @param hash - Content hash used for deduplication.
   * @param type - Media type in the upload scope.
   * @param target - Intended use in the upload scope.
   * @param draftId - Draft attachment scope, if supplied.
   * @param object - Storage bucket and key to reserve for a new upload.
   * @param upload - Writes the object and returns the metadata to persist.
   * @returns The reused or newly created original.
   * @throws {NotFoundException} If the supplied draft is missing, inactive, or owned by someone else.
   * @throws {ServiceUnavailableException} If the reservation cannot be acquired or is lost.
   */
  async reuseOrCreateUpload(
    ownerId: string,
    hash: string,
    type: MediaType,
    target: MediaTarget,
    draftId: string | undefined,
    object: { key: string; bucket: string },
    upload: () => Promise<MediaCreate>,
  ) {
    const scope = JSON.stringify([ownerId.toLowerCase(), hash, type, target]);
    const where: Prisma.MediaWhereInput = {
      ownerId,
      hash,
      type,
      target,
      ...originalMedia,
    };
    const deadline = Date.now() + 40_000;
    do {
      const claim = await this.withUploadLock(scope, async (tx) => {
        await this.checkUploadDraft(tx, ownerId, draftId);
        const existing = await this.findReusableUpload(tx, where, draftId);
        if (existing) return { existing };
        const current = await this.lockReservation(tx, scope);
        if (current && current.expiresAt > current.now) return {};
        if (current) await this.abandonUpload(tx, current);
        const [{ now }] = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT clock_timestamp() AS "now"`;
        await tx.mediaUploadReservation.create({
          data: {
            scope,
            ...object,
            expiresAt: new Date(now.getTime() + 30_000),
          },
        });
        return { claimed: true };
      });
      if (claim.existing) return claim.existing;
      if (claim.claimed) {
        // Leave the reservation for expiry if storage fails or the commit result is unknown.
        const data = await upload();
        const media = await this.withUploadLock(scope, async (tx) => {
          await this.checkUploadDraft(tx, ownerId, draftId);
          const current = await this.lockReservation(tx, scope);
          if (
            !current ||
            current.key !== object.key ||
            current.expiresAt <= current.now
          )
            return null;
          const existing = await this.findReusableUpload(tx, where, draftId);
          if (existing) {
            await this.abandonUpload(tx, current);
            return existing;
          }
          const created = await tx.media.create({ data });
          await this.attachUpload(tx, created.id, draftId);
          await tx.mediaUploadReservation.delete({ where: { scope } });
          return created;
        });
        if (media) return media;
        break;
      }
      await delay(
        Math.min(100 + Math.random() * 200, Math.max(0, deadline - Date.now())),
      );
    } while (Date.now() < deadline);
    throw new ServiceUnavailableException(
      'Media upload is busy. Retry the upload.',
    );
  }

  private async findReusableUpload(
    tx: Prisma.TransactionClient,
    where: Prisma.MediaWhereInput,
    draftId?: string,
  ) {
    const existing = await tx.media.findFirst({ where });
    if (!existing) return null;

    await this.lockMedia(tx, existing.id);
    const current = await tx.media.findFirst({
      where: { ...where, id: existing.id },
    });
    if (!current) return null;

    await this.attachUpload(tx, current.id, draftId);
    await tx.$executeRaw`
      UPDATE "Media" SET "retention_refreshed_at" = clock_timestamp()
      WHERE "id" = ${current.id}::uuid
    `;
    return current;
  }

  /**
   * Links a new or reused upload to a draft and refreshes the draft's
   * `updatedAt` for retention cleanup, even when the link already exists.
   *
   * @param tx - Upload transaction that commits the link and timestamp together.
   * @param mediaId - ID of the uploaded or reused media record.
   * @param draftId - Draft to attach to. Omit for a standalone upload.
   */
  private async attachUpload(
    tx: Prisma.TransactionClient,
    mediaId: string,
    draftId?: string,
  ) {
    if (!draftId) return;

    await tx.draft.update({
      where: { id: draftId },
      data: { updatedAt: new Date() },
    });
    await tx.draftMedia.createMany({
      data: { draftId, mediaId },
      skipDuplicates: true,
    });
  }

  /**
   * Serializes reservation changes within an upload scope using a
   * transaction-scoped advisory lock.
   *
   * @param scope - Serialized deduplication scope used as the lock key.
   * @param run - Work to execute while the advisory lock is held.
   * @returns The callback result after the transaction commits.
   * @throws {ServiceUnavailableException} If transaction acquisition or locking times out.
   */
  private async withUploadLock<T>(
    scope: string,
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
          return run(tx);
        },
        { maxWait: 1_000, timeout: 3_000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (['P2024', 'P2028'].includes(error.code) ||
          (error.code === 'P2010' && error.meta?.code === '55P03'))
      ) {
        throw new ServiceUnavailableException(
          'Media upload is busy. Retry the upload.',
        );
      }
      throw error;
    }
  }

  /**
   * Locks the target draft and verifies that it can accept the upload.
   *
   * @param tx - Upload transaction that holds the draft lock.
   * @param ownerId - Expected draft owner.
   * @param draftId - Target draft ID. Omit for a draftless upload.
   * @throws {NotFoundException} If the draft is missing, inactive, or owned by someone else.
   */
  private async checkUploadDraft(
    tx: Prisma.TransactionClient,
    ownerId: string,
    draftId?: string,
  ) {
    if (!draftId) return;
    const [draft] = await tx.$queryRaw<
      { ownerId: string; status: DraftStatus }[]
    >`
      SELECT "owner_id" AS "ownerId", "status" FROM "Draft" WHERE "id" = ${draftId}::uuid FOR UPDATE
    `;
    if (
      draft?.ownerId !== ownerId.toLowerCase() ||
      draft.status !== DraftStatus.ACTIVE
    ) {
      throw new NotFoundException('Draft not found');
    }
  }

  /**
   * Locks the reservation row until the transaction ends.
   *
   * @param tx - Upload transaction acquiring the lock.
   * @param scope - Serialized upload deduplication scope.
   * @returns The reservation with the database time for checking expiry, or undefined if absent.
   */
  private async lockReservation(tx: Prisma.TransactionClient, scope: string) {
    const [reservation] = await tx.$queryRaw<
      {
        scope: string;
        key: string;
        bucket: string;
        expiresAt: Date;
        now: Date;
      }[]
    >`
      SELECT *, clock_timestamp() AS "now" FROM "MediaUploadReservation"
      WHERE "scope" = ${scope} FOR UPDATE
    `;
    return reservation;
  }

  /**
   * Queues delayed object cleanup and removes the reservation in the
   * same transaction.
   *
   * @param tx - Transaction that owns the reservation lock.
   * @param reservation - Reservation scope, object location, and expiration.
   */
  private async abandonUpload(
    tx: Prisma.TransactionClient,
    {
      scope,
      key,
      bucket,
      expiresAt,
    }: { scope: string; key: string; bucket: string; expiresAt: Date },
  ) {
    await tx.mediaStorageDeletion.createMany({
      data: {
        key,
        bucket,
        nextAttemptAt: new Date(expiresAt.getTime() + 60_000),
      },
      skipDuplicates: true,
    });
    await tx.mediaUploadReservation.delete({ where: { scope } });
  }

  /**
   * Removes up to 20 expired upload reservations in expiration order, skipping
   * rows locked by another transaction. Records storage cleanup in the same
   * transaction, with new deletion entries due one minute after expiration.
   */
  async expireUploadReservations() {
    await this.prisma.$transaction(async (tx) => {
      const expired = await tx.$queryRaw<
        { scope: string; key: string; bucket: string; expiresAt: Date }[]
      >`
        SELECT * FROM "MediaUploadReservation" WHERE "expiresAt" <= clock_timestamp()
        ORDER BY "expiresAt" LIMIT 20 FOR UPDATE SKIP LOCKED
      `;
      for (const reservation of expired)
        await this.abandonUpload(tx, reservation);
    });
  }

  /**
   * Finds all variants for a parent media record.
   * @param parentId - The parent media ID
   * @returns An array of variant media records
   */
  async findVariants(parentId: string) {
    return this.prisma.media.findMany({
      where: { parentId },
    });
  }

  /**
   * Claims a missing variant and records its cleanup intent before the
   * storage PUT.
   *
   * @param parentId - Original media ID.
   * @param key - Deterministic object key for the variant.
   * @param bucket - Destination storage bucket.
   * @param variant - Variant type to generate.
   * @returns The leased intent, or null if the original is missing or the variant exists.
   * @throws {ConflictException} If another attempt holds an active lease.
   */
  async beginVariantPut(
    parentId: string,
    key: string,
    bucket: string,
    variant: MediaVariant,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockMedia(tx, parentId);
      const parent = await tx.media.findUnique({
        where: { id: parentId, parentId: null, variant: MediaVariant.ORIGINAL },
        select: { variants: { where: { variant }, select: { id: true } } },
      });
      if (!parent || parent.variants.length) return null;
      const previous = await tx.mediaVariantPutIntent.findUnique({
        where: { key },
      });
      const [{ now }] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS "now"`;
      if (previous && !previous.released && previous.leaseUntil > now) {
        throw new ConflictException('A variant upload is already in progress');
      }
      const attempt = {
        parentId,
        key,
        bucket,
        token: randomUUID(),
        leaseUntil: new Date(now.getTime() + 30_000),
        released: false,
      };
      return tx.mediaVariantPutIntent.upsert({
        where: { key },
        create: attempt,
        update: attempt,
      });
    });
  }

  /**
   * Lets a failed attempt retry while preserving its cleanup deadline and
   * any replacement lease.
   *
   * @param attempt - Object key and token of the failed attempt.
   */
  async releaseVariantPut({
    key,
    token,
  }: Pick<MediaVariantPutIntent, 'key' | 'token'>) {
    await this.prisma.mediaVariantPutIntent.updateMany({
      where: { key, token },
      data: { released: true },
    });
  }

  /**
   * Finalizes the matching attempt with the parent’s current links or queues
   * cleanup if the parent is gone.
   *
   * @param attempt - Intent for the successful PUT.
   * @param data - Metadata for the stored variant.
   * @throws {ConflictException} If the original still exists but the attempt token no longer matches.
   */
  async finishVariantPut(
    attempt: MediaVariantPutIntent,
    data: Pick<MediaCreate, 'publicUrl' | 'mimeType' | 'sizeBytes' | 'variant'>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockMedia(tx, attempt.parentId);
      const parent = await tx.media.findUnique({
        where: { id: attempt.parentId },
      });
      if (!parent) {
        await tx.mediaVariantPutIntent.deleteMany({
          where: { key: attempt.key, token: attempt.token },
        });
        await this.deferVariantDeletion(tx, attempt, Date.now() + 60_000);
        return;
      }

      const current = await tx.mediaVariantPutIntent.findUnique({
        where: { key: attempt.key },
      });
      if (current?.token !== attempt.token) {
        throw new ConflictException('The variant upload lease was replaced');
      }
      await tx.media.create({
        data: {
          ...data,
          key: attempt.key,
          bucket: attempt.bucket,
          parentId: parent.id,
          type: parent.type,
          target: parent.target,
          ownerId: parent.ownerId,
        },
      });
      await tx.mediaVariantPutIntent.delete({ where: { key: attempt.key } });
    });
  }

  /**
   * Moves intents whose originals were deleted elsewhere into the storage
   * deletion outbox.
   */
  async recoverOrphanedVariantPuts() {
    await this.prisma.$transaction(async (tx) => {
      const orphaned = await tx.$queryRaw<MediaVariantPutIntent[]>`
        SELECT intent.* FROM "MediaVariantPutIntent" intent
        WHERE NOT EXISTS (SELECT 1 FROM "Media" parent WHERE parent."id" = intent."parentId")
        ORDER BY intent."key" LIMIT 20 FOR UPDATE SKIP LOCKED
      `;
      for (const attempt of orphaned) {
        await this.deferVariantDeletion(tx, attempt);
        await tx.mediaVariantPutIntent.delete({ where: { key: attempt.key } });
      }
    });
  }

  /**
   * Queues deletion after the lease grace period and preserves any later
   * deadline.
   *
   * @param tx - Transaction recording the deletion.
   * @param intent - Object location and lease deadline.
   * @param minimumTime - Earliest allowed retry time in epoch milliseconds.
   */
  private async deferVariantDeletion(
    tx: Prisma.TransactionClient,
    { key, bucket, leaseUntil }: MediaVariantPutIntent,
    minimumTime = 0,
  ) {
    const nextAttemptAt = new Date(
      Math.max(leaseUntil.getTime() + 60_000, minimumTime),
    );
    await tx.$executeRaw`
      INSERT INTO "MediaStorageDeletion" ("key", "bucket", "nextAttemptAt")
      VALUES (${key}, ${bucket}, ${nextAttemptAt})
      ON CONFLICT ("bucket", "key") DO UPDATE
      SET "nextAttemptAt" = GREATEST("MediaStorageDeletion"."nextAttemptAt", EXCLUDED."nextAttemptAt")
    `;
  }

  private unattachedBefore(cutoff: Date): Prisma.MediaWhereInput {
    return {
      ...originalMedia,
      NOT: hasReferences,
      createdAt: { lte: cutoff },
      OR: [
        { retentionRefreshedAt: null },
        { retentionRefreshedAt: { lte: cutoff } },
      ],
    };
  }

  findUnattachedBefore(cutoff: Date) {
    return this.prisma.media.findMany({
      where: this.unattachedBefore(cutoff),
      select: { id: true },
    });
  }

  /**
   * Rechecks retention and attachment claims under the original lock before
   * deleting the family.
   *
   * @param id - Original media ID selected for cleanup.
   * @param cutoff - Retention threshold for creation and refresh timestamps.
   * @returns Whether the family was deleted and its objects queued for cleanup.
   */
  async deleteUnattachedBefore(id: string, cutoff: Date) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockMedia(tx, id);
      const media = await tx.media.findFirst({
        where: { id, ...this.unattachedBefore(cutoff) },
        include: { variants: true },
      });
      if (!media) return false;

      await this.recordStorageDeletion(tx, media, media.variants);
      return true;
    });
  }

  private async lockUsage(
    tx: Prisma.TransactionClient,
    { drafts, avatarUserIds }: ReturnType<MediaRepository['presentReferences']>,
  ) {
    // Match the lock order used by draft publication, uploads and avatar updates.
    if (avatarUserIds.length) {
      await tx.$queryRaw`
        SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(avatarUserIds.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY "id" FOR NO KEY UPDATE
      `;
    }
    if (drafts.length) {
      await tx.$queryRaw`
        SELECT "id" FROM "Draft" WHERE "id" IN (${Prisma.join(drafts.map(({ id }) => Prisma.sql`${id}::uuid`))})
        ORDER BY "id" FOR NO KEY UPDATE
      `;
    }
  }

  async removeReference(id: string, force = false) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await this.prisma.$transaction(async (tx) => {
        const initialLinks = await tx.media.findUnique({
          where: { id },
          select: referenceLinks,
        });
        if (!initialLinks) throw new NotFoundException('Media not found');
        const initial = this.presentReferences(initialLinks);
        await this.lockUsage(tx, initial);
        await this.lockMedia(tx, id);

        const media = await tx.media.findUnique({
          where: { id },
          include: { variants: true, ...referenceLinks },
        });
        if (!media) throw new NotFoundException('Media not found');
        if (media.parentId || media.variant !== MediaVariant.ORIGINAL) {
          throw new ConflictException({
            code: 'MEDIA_VARIANT',
            message: 'Remove generated variants through their original',
            canForce: false,
          });
        }

        const usage = this.presentReferences(media);
        const { drafts, avatarUserIds, postIds, commentIds } = usage;
        // Retry if a writer installed a reference whose owning row we have yet to lock.
        if (
          drafts.some(
            ({ id }) => !initial.drafts.some((draft) => draft.id === id),
          ) ||
          avatarUserIds.some((id) => !initial.avatarUserIds.includes(id))
        )
          return null;

        if (drafts.some(({ status }) => status === DraftStatus.PUBLISHING)) {
          throw new ConflictException({
            code: 'MEDIA_DRAFT_PUBLISHING',
            message: 'Media is attached to a publishing draft',
            canForce: false,
          });
        }
        if (
          !force &&
          (drafts.length ||
            postIds.length ||
            commentIds.length ||
            avatarUserIds.length)
        ) {
          throw new ConflictException({
            code: 'MEDIA_IN_USE',
            message:
              'Deleting this media may break images or covers in saved content and resets any active avatar.',
            canForce: true,
          });
        }

        if (avatarUserIds.length) {
          await tx.user.updateMany({
            where: { avatarMediaId: id },
            data: { image: null, avatarMediaId: null },
          });
        }
        const { deleted, objects } = await this.recordStorageDeletion(
          tx,
          media,
          media.variants,
        );
        return { media: deleted, objects };
      });
      if (result) return result;
    }
    throw new ServiceUnavailableException(
      'Media usage is changing. Retry the request.',
    );
  }

  private async lockMedia(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`
      SELECT "id" FROM "Media" WHERE "id" = ${id}::uuid FOR UPDATE
    `;
  }

  /**
   * Records cleanup for stored objects and in-flight variant keys before
   * removing the media rows.
   *
   * @param tx - Transaction holding the original row lock.
   * @param media - Original ID and object location.
   * @param variants - Existing variant object locations.
   * @returns The deleted original and all object locations recorded for cleanup.
   */
  private async recordStorageDeletion(
    tx: Prisma.TransactionClient,
    media: { id: string; key: string; bucket: string },
    variants: { key: string; bucket: string }[],
  ) {
    const objects = [media, ...variants].map(({ key, bucket }) => ({
      key,
      bucket,
    }));
    await tx.mediaStorageDeletion.createMany({
      data: objects,
      skipDuplicates: true,
    });
    const attempts = await tx.mediaVariantPutIntent.findMany({
      where: { parentId: media.id },
      orderBy: { key: 'asc' },
    });
    for (const attempt of attempts) {
      await this.deferVariantDeletion(tx, attempt);
      objects.push({ key: attempt.key, bucket: attempt.bucket });
    }
    await tx.mediaVariantPutIntent.deleteMany({
      where: { parentId: media.id },
    });
    await tx.media.deleteMany({ where: { parentId: media.id } });
    const deleted = await tx.media.delete({ where: { id: media.id } });
    return { deleted, objects };
  }

  /**
   * Returns due deletions for the supplied objects or the next 20 due outbox
   * entries.
   *
   * @param objects - Optional bucket and key pairs to limit the lookup.
   * @returns Due entries in outbox ID order.
   */
  findPendingStorageDeletions(objects?: { key: string; bucket: string }[]) {
    return this.prisma.mediaStorageDeletion.findMany({
      where: {
        nextAttemptAt: { lte: new Date() },
        ...(objects ? { OR: objects } : {}),
      },
      take: objects ? undefined : 20,
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Reschedules a failed storage deletion for one hour from now. The update
   * preserves any later schedule recorded after the caller read the entry.
   * The comparison includes the full observed millisecond because PostgreSQL
   * stores finer timestamp precision than JavaScript Date can represent.
   *
   * @param id - Identifier of the deletion outbox entry.
   * @param scheduledAt - The next attempt time observed before deletion.
   */
  async deferStorageDeletion(id: bigint, scheduledAt: Date) {
    await this.prisma.mediaStorageDeletion.updateMany({
      where: { id, nextAttemptAt: { lt: new Date(scheduledAt.getTime() + 1) } },
      data: { nextAttemptAt: new Date(Date.now() + 3_600_000) },
    });
  }

  /**
   * Removes the outbox entry after its object has been deleted, preserving any
   * newer schedule recorded since the caller read the entry. The comparison
   * includes the full observed millisecond to account for PostgreSQL timestamp
   * precision beyond what JavaScript Date can represent.
   *
   * @param id - Identifier of the deletion outbox entry.
   * @param scheduledAt - The next attempt time observed before deletion.
   */
  async acknowledgeStorageDeletion(id: bigint, scheduledAt: Date) {
    await this.prisma.mediaStorageDeletion.deleteMany({
      where: { id, nextAttemptAt: { lt: new Date(scheduledAt.getTime() + 1) } },
    });
  }

  /**
   * Creates a new media record.
   * @param data - The media creation data
   * @returns The created media record
   */
  async create(data: MediaCreate) {
    return this.prisma.media.create({ data });
  }

  /**
   * Creates multiple media records in a single transaction.
   * @param data - An array of media creation data
   * @returns An object containing the count of created records
   */
  async createMany(data: MediaCreate[]) {
    return this.prisma.media.createMany({ data });
  }

  /**
   * Deletes a media record by its ID.
   * @param id - The media ID
   * @returns The deleted media record
   */
  async delete(id: string) {
    return this.prisma.media.delete({ where: { id } });
  }

  /**
   * Updates a media record with partial data.
   * @param id - The media ID
   * @param data - Partial media data to update
   * @returns The updated media record
   */
  async update(id: string, data: Partial<MediaCreate>) {
    return this.prisma.media.update({
      where: { id },
      data,
    });
  }
}
