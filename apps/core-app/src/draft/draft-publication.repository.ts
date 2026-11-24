import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DraftStatus, Prisma } from 'prisma/generated/client';
import { lockOriginalMedia } from '../media/util/managed-media';
import { PENDING_CLAIM_BATCH_SIZE } from './constants/draft-processor.constants';
import {
  assertOwnedOriginals,
  findDraftOriginalIds,
  includeDraftMedia,
} from './draft-media.persistence';

interface PublicationInput {
  publicationAttemptId: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  coverMediaId: string;
  mediaIds: string[];
  categoryNames: string[];
}

@Injectable()
export class DraftPublicationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claims an active draft for asynchronous publication.
   *
   * The conditional update makes claiming atomic so concurrent publish
   * requests cannot both transition the same draft.
   *
   * @param id - Draft identifier.
   * @param ownerId - Expected draft owner.
   * @returns The claimed snapshot, or null if another request already claimed the draft.
   */
  markPublishing(id: string, ownerId: string, publicationAttemptId: string) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.draft.updateMany({
        where: { id, ownerId, status: DraftStatus.ACTIVE },
        data: {
          publicationAttemptId,
          status: DraftStatus.PUBLISHING,
          validationError: null,
        },
      });
      if (!claim.count) return null;

      return tx.draft.findUniqueOrThrow({
        where: { id },
        include: { ...includeDraftMedia, post: true },
      });
    });
  }

  /**
   * Lists publishing drafts with a recorded attempt for queue reconciliation.
   *
   * @param after - Exclusive draft ID cursor. Omit to start at the first ID.
   * @returns Up to 100 claims ordered by draft ID, with attempt IDs for job
   * lookup and update timestamps for measuring claim age.
   */
  pendingClaims(after?: string) {
    return this.prisma.draft.findMany({
      where: {
        status: DraftStatus.PUBLISHING,
        publicationAttemptId: { not: null },
        id: { gt: after },
      },
      select: { id: true, publicationAttemptId: true, updatedAt: true },
      orderBy: { id: 'asc' },
      take: PENDING_CLAIM_BATCH_SIZE,
    });
  }

  /**
   * Restores a publishing draft to `ACTIVE` and records its latest failure.
   *
   * This is used for validation failures and after the final failed worker
   * attempt so the draft remains editable and publication can be retried.
   *
   * @param id - Draft identifier.
   * @param error - User-facing or infrastructure failure description.
   * @returns The number of matching claims restored.
   */
  markValidationFailed(
    id: string,
    publicationAttemptId: string,
    error: string,
  ) {
    return this.prisma.draft.updateMany({
      where: { id, publicationAttemptId, status: DraftStatus.PUBLISHING },
      data: {
        status: DraftStatus.ACTIVE,
        publicationAttemptId: null,
        validationError: error,
      },
    });
  }

  /**
   * Locks the affected media and verifies that the validated manifest and
   * cover still match.
   *
   * @param tx - Publication transaction.
   * @param draftId - Publishing draft ID.
   * @param ownerId - Expected draft owner.
   * @param validated - IDs of the originals and cover validated by the worker.
   * @param coverMediaId - Current cover ID read under the draft lock.
   * @param postId - Source post ID when publishing a revision.
   * @returns The current original IDs ready for publication.
   * @throws {ConflictException} If the manifest changed.
   * @throws {BadRequestException} If a requested original is invalid or ineligible by ownership.
   */
  private async validatePublicationMedia(
    tx: Prisma.TransactionClient,
    draftId: string,
    ownerId: string,
    validated: { mediaIds: string[]; coverMediaId: string },
    coverMediaId: string | null,
    postId?: number,
  ) {
    const outgoing =
      postId === undefined
        ? []
        : await tx.postMedia.findMany({
            where: { postId },
            select: { mediaId: true },
          });
    await lockOriginalMedia(tx, [
      ...validated.mediaIds,
      ...outgoing.map(({ mediaId }) => mediaId),
    ]);

    const current = await findDraftOriginalIds(tx, draftId);
    if (
      coverMediaId !== validated.coverMediaId ||
      !current.includes(validated.coverMediaId) ||
      current.length !== validated.mediaIds.length ||
      current.some((id) => !validated.mediaIds.includes(id))
    ) {
      throw new ConflictException(
        'Draft attachments changed during publication',
      );
    }

    await assertOwnedOriginals(tx, ownerId, current);

    return current;
  }

  /**
   * Publishes a new-post draft in one transaction.
   *
   * Creates the post and its category links, links the draft’s media to
   * the new post, and archives the draft with its created post
   * identifier. If any step fails, the transaction rolls back all changes.
   *
   * @param draftId - The identifier of the draft being published.
   * @param ownerId - The authenticated owner's identifier.
   * @param data - Validated post content, cover image, slug, and categories.
   * @returns The newly created post with its author and categories.
   */
  publish(
    draftId: string,
    ownerId: string,
    data: PublicationInput & { slug: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draftId}::uuid FOR UPDATE`;

      const draft = await tx.draft.findFirst({
        where: {
          id: draftId,
          ownerId,
          publicationAttemptId: data.publicationAttemptId,
          status: DraftStatus.PUBLISHING,
          postId: null,
        },
        select: { coverMediaId: true },
      });
      if (!draft) throw new ConflictException('Draft is no longer publishing');

      await this.checkPublicationCategories(tx, data.categoryNames);
      const originalIds = await this.validatePublicationMedia(
        tx,
        draftId,
        ownerId,
        data,
        draft.coverMediaId,
      );
      const post = await tx.post.create({
        data: {
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt,
          content: data.content,
          published: true,
          coverImage: data.coverImage,
          authorId: ownerId,
          categories: {
            create: data.categoryNames.map((name) => ({
              category: { connect: { name } },
            })),
          },
        },
        include: {
          author: { select: { name: true, image: true } },
          categories: { include: { category: true } },
        },
      });

      await this.replacePostMedia(tx, post.id, originalIds);

      await tx.draft.update({
        where: { id: draftId },
        data: {
          publicationAttemptId: null,
          status: DraftStatus.ARCHIVED,
          postId: post.id,
          archivedAt: new Date(),
        },
      });

      return post;
    });
  }

  /**
   * Publishes an existing post revision using optimistic version control.
   *
   * Within one transaction, verifies that the post is still owned by the
   * author and has the revision's source version, replaces its content and
   * categories, replaces the live post’s media links, increments the
   * post version, and archives the revision. A changed post causes the
   * transaction to fail without applying partial updates.
   *
   * @param draftId - The identifier of the revision being published.
   * @param ownerId - The authenticated author's identifier.
   * @param data - Validated revision content, media, categories, and source
   * version information.
   * @returns The updated post with its author and categories.
   * @throws {Error} If the post no longer matches the revision's owner or
   * source version.
   */
  publishRevision(
    draftId: string,
    ownerId: string,
    data: PublicationInput & { sourceVersion: number; postId: number },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${data.postId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Draft" WHERE "id" = ${draftId}::uuid FOR UPDATE`;

      const draft = await tx.draft.findFirst({
        where: {
          id: draftId,
          ownerId,
          publicationAttemptId: data.publicationAttemptId,
          status: DraftStatus.PUBLISHING,
          postId: data.postId,
        },
        select: { sourceVersion: true, coverMediaId: true },
      });
      if (!draft) throw new ConflictException('Draft is no longer publishing');

      const postId = data.postId;
      if (draft.sourceVersion !== data.sourceVersion) {
        throw new ConflictException(
          'Post changed since this revision was created',
        );
      }

      await this.checkPublicationCategories(tx, data.categoryNames);

      const originalIds = await this.validatePublicationMedia(
        tx,
        draftId,
        ownerId,
        data,
        draft.coverMediaId,
        postId,
      );
      const updated = await tx.post.updateMany({
        where: { id: postId, authorId: ownerId, version: data.sourceVersion },
        data: {
          title: data.title,
          excerpt: data.excerpt,
          content: data.content,
          coverImage: data.coverImage,
          version: { increment: 1 },
        },
      });
      if (!updated.count) {
        throw new ConflictException(
          'Post changed since this revision was created',
        );
      }

      await tx.postToCategory.deleteMany({ where: { postId } });
      if (data.categoryNames.length) {
        await tx.postToCategory.createMany({
          data: data.categoryNames.map((categoryName) => ({
            postId,
            categoryName,
          })),
        });
      }

      await this.replacePostMedia(tx, postId, originalIds);

      await tx.draft.update({
        where: { id: draftId },
        data: {
          publicationAttemptId: null,
          status: DraftStatus.ARCHIVED,
          archivedAt: new Date(),
          validationError: null,
        },
      });

      return tx.post.findUniqueOrThrow({
        where: { id: postId },
        include: {
          author: { select: { name: true, image: true } },
          categories: { include: { category: true } },
        },
      });
    });
  }

  private async checkPublicationCategories(
    tx: Prisma.TransactionClient,
    names: string[],
  ) {
    if (!names.length) return;
    // Hold the category keys until their post links commit.
    const rows = await tx.$queryRaw<{ name: string }[]>`
      SELECT name FROM "Category" WHERE name IN (${Prisma.join(names)})
      ORDER BY name FOR KEY SHARE
    `;

    const existing = new Set(rows.map(({ name }) => name));
    const missing = names.filter((name) => !existing.has(name));
    if (missing.length)
      throw new BadRequestException(
        `Remove or replace unavailable categories: ${missing.join(', ')}`,
      );
  }

  private async replacePostMedia(
    tx: Prisma.TransactionClient,
    postId: number,
    originalIds: string[],
  ) {
    await tx.postMedia.deleteMany({
      where: { postId, mediaId: { notIn: originalIds } },
    });
    await tx.postMedia.createMany({
      data: originalIds.map((mediaId) => ({ postId, mediaId })),
      skipDuplicates: true,
    });
  }
}
