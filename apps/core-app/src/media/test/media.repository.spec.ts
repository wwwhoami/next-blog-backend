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
    refCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    postId: null,
    commentId: null,
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
        Variants: [{ id: 'variant-1', variant: MediaVariant.THUMBNAIL }],
      };
      mockPrismaClient.media.findUnique.mockResolvedValue(
        mediaWithVariants as any,
      );

      const result = await repository.findByIdWithVariants('media-id-1');

      expect(result).toEqual(mediaWithVariants);
      expect(mockPrismaClient.media.findUnique).toHaveBeenCalledWith({
        where: { id: 'media-id-1' },
        include: { Variants: true },
      });
    });
  });

  describe('findByHashAndType', () => {
    it('should find media by hash and type', async () => {
      mockPrismaClient.media.findUnique.mockResolvedValue(
        mockMediaRecord as any,
      );

      const result = await repository.findByHashAndType(
        'abcd1234',
        MediaType.IMAGE,
      );

      expect(result).toEqual(mockMediaRecord);
      expect(mockPrismaClient.media.findUnique).toHaveBeenCalledWith({
        where: {
          hash_type: {
            hash: 'abcd1234',
            type: MediaType.IMAGE,
          },
        },
      });
    });
  });

  describe('incrementRefCount', () => {
    it('should increment reference count', async () => {
      const updatedMedia = { ...mockMediaRecord, refCount: 2 };
      mockPrismaClient.media.update.mockResolvedValue(updatedMedia as any);

      const result = await repository.incrementRefCount('media-id-1');

      expect(result).toEqual(updatedMedia);
      expect(mockPrismaClient.media.update).toHaveBeenCalledWith({
        where: { id: 'media-id-1' },
        data: { refCount: { increment: 1 } },
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
      const updatedMedia = { ...mockMediaRecord, refCount: 2 };
      mockPrismaClient.media.update.mockResolvedValue(updatedMedia);

      const result = await repository.update('media-id-1', { refCount: 2 });

      expect(result).toEqual(updatedMedia);
      expect(mockPrismaClient.media.update).toHaveBeenCalledWith({
        where: { id: 'media-id-1' },
        data: { refCount: 2 },
      });
    });
  });
});
