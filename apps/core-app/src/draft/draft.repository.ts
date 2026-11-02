import { PrismaService } from '@app/prisma';
import { Injectable } from '@nestjs/common';
import { DraftStatus, MediaTarget } from 'prisma/generated/client';

@Injectable()
export class DraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  getAuthorId(id: string): Promise<{ authorId: string }> {
    return this.prisma.draft
      .findUniqueOrThrow({
        where: { id },
        select: { ownerId: true },
      })
      .then(({ ownerId }) => ({ authorId: ownerId }));
  }

  create(ownerId: string, data: Record<string, unknown>) {
    return this.prisma.draft.create({
      data: { ...data, ownerId },
      include: { media: true },
    });
  }

  findMany(ownerId: string) {
    return this.prisma.draft.findMany({
      where: { ownerId, status: DraftStatus.ACTIVE },
      include: { media: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.draft.findUnique({
      where: { id },
      include: { media: true, post: true },
    });
  }

  /**
   * Finds a draft for validating media attachment ownership and lifecycle.
   */
  findForMediaAttachment(id: string) {
    return this.prisma.draft.findUnique({
      where: { id },
      select: { ownerId: true, status: true },
    });
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.draft.update({
      where: { id },
      data,
      include: { media: true },
    });
  }

  markPublishing(id: string, ownerId: string) {
    return this.prisma.draft.updateMany({
      where: { id, ownerId, status: DraftStatus.ACTIVE },
      data: { status: DraftStatus.PUBLISHING, validationError: null },
    });
  }

  markValidationFailed(id: string, error: string) {
    return this.prisma.draft.update({
      where: { id },
      data: { status: DraftStatus.ACTIVE, validationError: error },
      include: { media: true },
    });
  }

  findAttachableMedia(ownerId: string, mediaIds: string[]) {
    return this.prisma.media.findMany({
      where: {
        id: { in: mediaIds },
        ownerId,
        target: MediaTarget.POST,
      },
    });
  }

  attachMedia(id: string, mediaIds: string[]) {
    return this.prisma.$transaction([
      this.prisma.media.updateMany({
        where: { draftId: id },
        data: { draftId: null },
      }),
      this.prisma.media.updateMany({
        where: { id: { in: mediaIds } },
        data: { draftId: id },
      }),
    ]);
  }

  clearCoverMedia(id: string) {
    return this.prisma.draft.update({
      where: { id },
      data: { coverMediaId: null },
    });
  }

  findCoverCandidate(id: string, ownerId: string, mediaId: string) {
    return this.prisma.media.findFirst({
      where: {
        id: mediaId,
        ownerId,
        draftId: id,
        target: MediaTarget.POST,
      },
    });
  }

  setCoverMedia(id: string, mediaId: string) {
    return this.prisma.draft.update({
      where: { id },
      data: { coverMediaId: mediaId },
    });
  }

  publish(
    draftId: string,
    ownerId: string,
    data: {
      title: string;
      slug: string;
      excerpt: string;
      content: string;
      coverImage: string;
      categoryNames: string[];
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt,
          content: data.content,
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

      await tx.media.updateMany({
        where: { draftId },
        data: { draftId: null, postId: post.id },
      });

      await tx.draft.update({
        where: { id: draftId },
        data: {
          status: DraftStatus.ARCHIVED,
          postId: post.id,
          archivedAt: new Date(),
        },
      });

      return post;
    });
  }
}
