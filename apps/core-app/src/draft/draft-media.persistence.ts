import { BadRequestException } from '@nestjs/common';
import { MediaTarget, Prisma } from 'prisma/generated/client';
import { originalMedia } from '../media/util/managed-media';

export const includeDraftMedia = {
  draftMedia: { where: { media: originalMedia }, include: { media: true } },
} satisfies Prisma.DraftInclude;

/**
 * Verifies that each media ID identifies an undeleted post media original
 * owned by the specified user.
 *
 * @param tx - Transaction client for the eligibility check.
 * @param ownerId - Expected media owner's user ID.
 * @param mediaIds - Distinct media IDs to validate. An empty list passes.
 * @throws {BadRequestException} If any media ID fails the eligibility check.
 */
export async function assertOwnedOriginals(
  tx: Prisma.TransactionClient,
  ownerId: string,
  mediaIds: string[],
) {
  if (!mediaIds.length) return;
  const count = await tx.media.count({
    where: {
      id: { in: mediaIds },
      ownerId,
      target: MediaTarget.POST,
      ...originalMedia,
    },
  });
  if (count !== mediaIds.length) {
    throw new BadRequestException('One or more media assets are invalid');
  }
}

export async function findDraftOriginalIds(
  tx: Prisma.TransactionClient,
  draftId: string,
) {
  const rows = await tx.draftMedia.findMany({
    where: { draftId },
    select: { mediaId: true },
  });
  return rows.map(({ mediaId }) => mediaId);
}
