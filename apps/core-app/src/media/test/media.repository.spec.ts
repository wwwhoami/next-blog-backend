import { PrismaService } from '@app/prisma';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import {
  MediaTarget,
  MediaType,
  MediaVariant,
  PrismaClient,
} from 'prisma/generated/client';
import { MediaRepository } from '../media.repository';

describe('MediaRepository', () => {
  let repository: MediaRepository;
  let mockPrismaClient: DeepMockProxy<PrismaClient>;

  const mockMediaRecord = {
    id: 'media-id-1',
    key: 'uploads/image/user-1/test.webp',
    bucket: 'test-bucket',
    ownerId: 'user-1',
    type: MediaType.IMAGE,
    target: MediaTarget.POST,
    variant: MediaVariant.ORIGINAL,
    mimeType: 'image/webp',
    sizeBytes: BigInt(1024),
    publicUrl: 'https://example.com/media/test.webp',
    hash: 'abcd1234',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    retentionRefreshedAt: null,
    parentId: null,
  };

  beforeEach(async () => {
    mockPrismaClient = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaRepository,
        { provide: PrismaService, useValue: mockPrismaClient },
      ],
    }).compile();

    repository = module.get<MediaRepository>(MediaRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getAuthorId', () => {
    it('should return author id', async () => {
      const expectedResult = { authorId: 'user-1' };
      mockPrismaClient.media.findUniqueOrThrow.mockResolvedValue({
        ownerId: expectedResult.authorId,
      } as any);

      const result = await repository.getAuthorId('media-id-1');

      expect(result).toEqual(expectedResult);
      expect(mockPrismaClient.media.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'media-id-1' },
        select: { ownerId: true },
      });
    });
  });

  describe('findById', () => {
    it('should find media by id', async () => {
      mockPrismaClient.media.findUnique.mockResolvedValue(
        mockMediaRecord as any,
      );

      const result = await repository.findById('media-id-1');

      expect(result).toEqual(mockMediaRecord);
      expect(mockPrismaClient.media.findUnique).toHaveBeenCalledWith({
        where: { id: 'media-id-1' },
      });
    });
  });

  describe('findOwnedMedia', () => {
    it('should list owned media with attachment filtering', async () => {
      mockPrismaClient.media.findMany.mockResolvedValue([]);

      await repository.findOwnedMedia('user-1', true);
      await repository.findOwnedMedia('user-1', false);
      const attached =
        mockPrismaClient.media.findMany.mock.calls[0][0]?.where?.OR;
      expect(attached).toEqual([
        { postMedia: { some: {} } },
        { draftMedia: { some: {} } },
        { commentMedia: { some: {} } },
        { avatarUsers: { some: {} } },
      ]);
      expect(
        mockPrismaClient.media.findMany.mock.calls[1][0]?.where,
      ).toMatchObject({
        ownerId: 'user-1',
        parentId: null,
        variant: MediaVariant.ORIGINAL,
        NOT: { OR: attached },
      });
    });
  });

  it('blocks retention and confirmed deletion when a publishing draft references an original', async () => {
    const media = {
      ...mockMediaRecord,
      variants: [],
      draftMedia: [{ draft: { id: 'draft-id', status: 'PUBLISHING' } }],
      postMedia: [],
      commentMedia: [],
      avatarUsers: [],
    };
    (mockPrismaClient.$transaction as jest.Mock).mockImplementation(
      (callback) => callback(mockPrismaClient),
    );
    mockPrismaClient.media.findFirst.mockResolvedValue(null);
    mockPrismaClient.media.findUnique.mockResolvedValue(media);
    mockPrismaClient.$queryRaw.mockResolvedValue([{ id: media.id }]);

    await expect(
      repository.deleteUnattachedBefore(media.id, new Date()),
    ).resolves.toBe(false);
    await expect(
      repository.removeReference(media.id, true),
    ).rejects.toMatchObject({
      response: { code: 'MEDIA_DRAFT_PUBLISHING', canForce: false },
    });
    expect(
      mockPrismaClient.mediaStorageDeletion.createMany,
    ).not.toHaveBeenCalled();
  });

  describe('findByKey', () => {
    it('should find media by key', async () => {
      mockPrismaClient.media.findUnique.mockResolvedValue(
        mockMediaRecord as any,
      );

      const result = await repository.findByKey('test-key');

      expect(result).toEqual(mockMediaRecord);
      expect(mockPrismaClient.media.findUnique).toHaveBeenCalledWith({
        where: { key: 'test-key' },
      });
    });
  });

  describe('findByIdWithVariants', () => {
    it('should find media by id with variants', async () => {
      const mediaWithVariants = {
        ...mockMediaRecord,
        variants: [{ id: 'variant-1', variant: MediaVariant.THUMBNAIL }],
      };
      mockPrismaClient.media.findUnique.mockResolvedValue(
        mediaWithVariants as any,
      );

      const result = await repository.findByIdWithVariants('media-id-1');

      expect(result).toEqual(mediaWithVariants);
      expect(mockPrismaClient.media.findUnique).toHaveBeenCalledWith({
        where: { id: 'media-id-1' },
        include: { variants: true },
      });
    });
  });

  describe('reuseOrCreateUpload', () => {
    it('should find a live original in the same ownership context', async () => {
      mockPrismaClient.media.findFirst.mockResolvedValue(mockMediaRecord);
      mockPrismaClient.$queryRaw.mockResolvedValue([]);

      (mockPrismaClient.$transaction as jest.Mock).mockImplementation(
        (callback) => callback(mockPrismaClient),
      );
      const upload = jest.fn();
      const result = await repository.reuseOrCreateUpload(
        'user-1',
        'abcd1234',
        MediaType.IMAGE,
        MediaTarget.POST,
        undefined,
        { key: 'unused', bucket: 'test-bucket' },
        upload,
      );
      const [lookup] = mockPrismaClient.media.findFirst.mock.calls[0];
      expect(mockPrismaClient.media.findFirst).toHaveBeenLastCalledWith({
        where: { ...lookup?.where, id: mockMediaRecord.id },
      });
      expect(mockPrismaClient.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrismaClient.$executeRaw).toHaveBeenCalledTimes(3);
      expect(upload).not.toHaveBeenCalled();

      expect(result).toEqual(mockMediaRecord);
      expect(mockPrismaClient.media.findFirst).toHaveBeenCalledWith({
        where: {
          ownerId: 'user-1',
          hash: 'abcd1234',
          type: MediaType.IMAGE,
          target: MediaTarget.POST,
          parentId: null,
          variant: MediaVariant.ORIGINAL,
          deletedAt: null,
        },
      });
    });
  });

  describe('create', () => {
    it('should create new media record', async () => {
      const createData = {
        key: 'test-key',
        bucket: 'test-bucket',
        type: MediaType.IMAGE,
        target: MediaTarget.POST,
        variant: MediaVariant.ORIGINAL,
        mimeType: 'image/webp',
        publicUrl: 'https://example.com/test.webp',
        sizeBytes: 1024,
        ownerId: 'user-1',
        hash: 'abcd1234',
      };

      mockPrismaClient.media.create.mockResolvedValue(mockMediaRecord as any);

      const result = await repository.create(createData);

      expect(result).toEqual(mockMediaRecord);
      expect(mockPrismaClient.media.create).toHaveBeenCalledWith({
        data: createData,
      });
    });
  });

  describe('delete', () => {
    it('should delete media record', async () => {
      mockPrismaClient.media.delete.mockResolvedValue(mockMediaRecord);

      const result = await repository.delete('media-id-1');

      expect(result).toEqual(mockMediaRecord);
      expect(mockPrismaClient.media.delete).toHaveBeenCalledWith({
        where: { id: 'media-id-1' },
      });
    });
  });

  describe('update', () => {
    it('should update media record', async () => {
      const updatedMedia = { ...mockMediaRecord, mimeType: 'image/png' };
      mockPrismaClient.media.update.mockResolvedValue(updatedMedia);

      const result = await repository.update('media-id-1', {
        mimeType: 'image/png',
      });

      expect(result).toEqual(updatedMedia);
      expect(mockPrismaClient.media.update).toHaveBeenCalledWith({
        where: { id: 'media-id-1' },
        data: { mimeType: 'image/png' },
      });
    });
  });
});
