import { PrismaService } from '@app/prisma';
import { Injectable } from '@nestjs/common';
import { MediaType } from 'prisma/generated/client';
import { MediaCreate } from './types/media-create.type';

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
        ...(attached === undefined
          ? {}
          : attached
            ? {
                OR: [
                  { draftId: { not: null } },
                  { postId: { not: null } },
                  { commentId: { not: null } },
                ],
              }
            : { draftId: null, postId: null, commentId: null }),
      },
      include: { Variants: true },
      orderBy: { createdAt: 'desc' },
    });
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
      include: { Variants: true },
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
      include: { Variants: true },
    });
  }

  /**
   * Finds a media record by its hash and type.
   * @param hash - The media file hash
   * @param type - The media type
   * @returns The media record or null if not found
   */
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
   * Finds old, unattached post and comment media eligible for cleanup.
   *
   * Media linked to drafts, posts, or comments is excluded. Avatar media is
   * also excluded because user avatar ownership is represented by `User.image`
   * rather than a media relation.
   *
   * @param cutoff Media must have been created before this timestamp.
   * @returns Original media records with their stored variants.
   */
  async findUnattachedBefore(cutoff: Date) {
    return this.prisma.media.findMany({
      where: {
        draftId: null,
        postId: null,
        commentId: null,
        target: { in: ['POST', 'COMMENT'] },
        createdAt: { lt: cutoff },
      },
      include: { Variants: true },
    });
  }

  /**
   * Increments the reference count for a media record.
   * @param id - The media ID
   * @returns The updated media record
   */
  async incrementRefCount(id: string) {
    return this.prisma.media.update({
      where: { id },
      data: { refCount: { increment: 1 } },
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
