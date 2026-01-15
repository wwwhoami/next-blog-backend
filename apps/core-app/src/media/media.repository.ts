import { PrismaService } from '@app/prisma';
import { Injectable } from '@nestjs/common';
import { MediaType } from 'prisma/generated/client';
import { MediaCreate } from './types/media-create.type';

@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAuthorId(id: string) {
    const author = await this.prisma.media.findUniqueOrThrow({
      where: { id },
      select: { ownerId: true },
    });

    return { authorId: author.ownerId };
  }

  async findById(id: string) {
    return this.prisma.media.findUnique({ where: { id } });
  }

  async findByKey(key: string) {
    return this.prisma.media.findUnique({ where: { key } });
  }

  async findByIdWithVariants(id: string) {
    return this.prisma.media.findUnique({
      where: { id },
      include: { Variants: true },
    });
  }

  async findByKeyWithVariants(key: string) {
    return this.prisma.media.findUnique({
      where: { key },
      include: { Variants: true },
    });
  }

  async findByHashAndType(hash: string, type: MediaType) {
    return this.prisma.media.findUnique({
      where: {
        hash_type: {
          hash,
          type,
        },
      },
    });
  }

  async findVariants(parentId: string) {
    return this.prisma.media.findMany({
      where: { parentId },
    });
  }

  async incrementRefCount(id: string) {
    return this.prisma.media.update({
      where: { id },
      data: { refCount: { increment: 1 } },
    });
  }

  async create(data: MediaCreate) {
    return this.prisma.media.create({ data });
  }

  async createMany(data: MediaCreate[]) {
    return this.prisma.media.createMany({ data });
  }

  async delete(id: string) {
    return this.prisma.media.delete({ where: { id } });
  }

  async update(id: string, data: Partial<MediaCreate>) {
    return this.prisma.media.update({
      where: { id },
      data,
    });
  }
}
