import { PrismaService } from '@app/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DraftStatus, MediaRole, MediaTarget } from 'prisma/generated/client';
import slugify from 'slugify';
import { DraftRepository } from './draft.repository';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';

const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

@Injectable()
export class DraftService {
  private readonly externalHosts: Set<string>;

  constructor(
    private readonly repo: DraftRepository,
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.externalHosts = new Set(
      (configService.get<string>('EXTERNAL_MEDIA_DOMAINS') ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  getAuthorId(id: string): Promise<{ authorId: string }> {
    return this.repo.getAuthorId(id);
  }

  list(ownerId: string) {
    return this.repo.findMany(ownerId);
  }

  async get(id: string, ownerId: string) {
    const draft = await this.repo.findById(id);
    if (!draft || draft.ownerId !== ownerId) {
      throw new NotFoundException('Draft not found');
    }

    return draft;
  }

  create(ownerId: string, dto: CreateDraftDto) {
    return this.repo.create(ownerId, {
      title: dto.title ?? '',
      excerpt: dto.excerpt ?? '',
      content: dto.content ?? '',
      categoryNames: dto.categoryNames ?? [],
    });
  }

  async update(id: string, ownerId: string, dto: UpdateDraftDto) {
    const draft = await this.get(id, ownerId);
    const { mediaIds, ...draftData } = dto;

    if (mediaIds) {
      await this.syncMedia(id, ownerId, mediaIds);
    }

    if (dto.coverMediaId !== undefined) {
      await this.setCoverMedia(id, ownerId, dto.coverMediaId);
    }

    return this.repo.update(draft.id, draftData);
  }

  async publish(id: string, ownerId: string) {
    const draft = await this.get(id, ownerId);
    if (draft.status !== DraftStatus.ACTIVE) {
      throw new ConflictException('Draft has already been published');
    }

    if (!draft.title.trim() || !draft.excerpt.trim() || !draft.content.trim()) {
      throw new UnprocessableEntityException(
        'Title, excerpt, and content are required to publish',
      );
    }

    const cover = draft.media.find(
      (media) =>
        media.id === draft.coverMediaId &&
        media.role === MediaRole.COVER &&
        media.target === MediaTarget.POST,
    );
    if (!cover) {
      throw new UnprocessableEntityException(
        'A cover image attached to the draft is required to publish',
      );
    }

    this.validateMarkdownImages(draft.content, draft.media);

    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          title: draft.title,
          slug: slugify(draft.title, { lower: true }),
          excerpt: draft.excerpt,
          content: draft.content,
          coverImage: cover.publicUrl,
          authorId: ownerId,
          categories: {
            create: draft.categoryNames.map((name) => ({
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
        where: { draftId: draft.id },
        data: { draftId: null, postId: post.id },
      });

      await tx.draft.update({
        where: { id: draft.id },
        data: {
          status: DraftStatus.ARCHIVED,
          postId: post.id,
          archivedAt: new Date(),
        },
      });

      return post;
    });
  }

  private async syncMedia(id: string, ownerId: string, mediaIds: string[]) {
    const media = await this.prisma.media.findMany({
      where: {
        id: { in: mediaIds },
        ownerId,
        target: MediaTarget.POST,
      },
    });
    if (media.length !== mediaIds.length) {
      throw new BadRequestException('One or more media assets are invalid');
    }

    await this.prisma.$transaction([
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

  private async setCoverMedia(
    id: string,
    ownerId: string,
    coverMediaId: string | null,
  ) {
    if (!coverMediaId) {
      await this.prisma.media.updateMany({
        where: { draftId: id, role: MediaRole.COVER },
        data: { role: MediaRole.BODY },
      });
      return;
    }

    const media = await this.prisma.media.findFirst({
      where: {
        id: coverMediaId,
        ownerId,
        draftId: id,
        target: MediaTarget.POST,
      },
    });
    if (!media) {
      throw new BadRequestException(
        'Cover media must be attached to the draft',
      );
    }

    await this.prisma.$transaction([
      this.prisma.media.updateMany({
        where: { draftId: id, role: MediaRole.COVER },
        data: { role: MediaRole.BODY },
      }),
      this.prisma.media.update({
        where: { id: coverMediaId },
        data: { role: MediaRole.COVER },
      }),
    ]);
  }

  private validateMarkdownImages(
    content: string,
    media: { publicUrl: string }[],
  ) {
    const knownUrls = new Set(media.map(({ publicUrl }) => publicUrl));
    for (const match of content.matchAll(imagePattern)) {
      const rawUrl = match[1];
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        throw new UnprocessableEntityException(
          `Invalid image URL in Markdown: ${rawUrl}`,
        );
      }

      if (knownUrls.has(rawUrl)) continue;
      if (
        url.protocol !== 'https:' ||
        !this.externalHosts.has(url.hostname.toLowerCase())
      ) {
        throw new UnprocessableEntityException(
          `Image URL is not attached media or an allowed external host: ${rawUrl}`,
        );
      }
    }
  }
}
