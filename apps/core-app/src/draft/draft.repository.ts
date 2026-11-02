import { PrismaService } from '@app/prisma';
import { Injectable } from '@nestjs/common';
import { DraftStatus } from 'prisma/generated/client';

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

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.draft.update({
      where: { id },
      data,
      include: { media: true },
    });
  }
}
