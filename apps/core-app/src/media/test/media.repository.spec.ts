import { PrismaService } from '@app/prisma';
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MediaTarget,
  MediaType,
  MediaVariant,
  PrismaClient,
} from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PinoLogger } from 'nestjs-pino';
import { MediaRepository } from '../media.repository';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('MediaRepository', () => {
  let repository: MediaRepository;
  let mockPrismaClient: DeepMockProxy<PrismaClient>;
  let mockConfigService: DeepMockProxy<ConfigService>;
  let mockLogger: DeepMockProxy<PinoLogger>;
  let mockS3Client: DeepMockProxy<S3Client>;

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
    postId: null,
    commentId: null,
    parentId: null,
  };

  beforeEach(async () => {
    mockPrismaClient = mockDeep<PrismaClient>();
    mockConfigService = mockDeep<ConfigService>();
    mockLogger = mockDeep<PinoLogger>();
    mockS3Client = mockDeep<S3Client>();

    // Mock S3Client constructor
    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () => mockS3Client as any,
    );

    // Setup config mocks
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        MINIO_MEDIA_BUCKET: 'test-bucket',
        MINIO_REGION: 'us-east-1',
        MINIO_ENDPOINT: 'https://minio.example.com',
        MINIO_ACCESS_KEY: 'test-access-key',
        MINIO_SECRET_KEY: 'test-secret-key',
      };

      return config[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaRepository,
        { provide: PrismaService, useValue: mockPrismaClient },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    repository = module.get<MediaRepository>(MediaRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getAuthorId', () => {
    it('should return author id', async () => {
      const expectedResult = { ownerId: 'user-1' };
      mockPrismaClient.media.findUnique.mockResolvedValue(
        expectedResult as any,
      );

      const result = await repository.getAuthorId('media-id-1');

      expect(result).toEqual(expectedResult);
      expect(mockPrismaClient.media.findUnique).toHaveBeenCalledWith({
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

  describe('decrementRefCountOrRemove', () => {
    it('should decrement ref count when count > 1', async () => {
      const mediaWithHighRefCount = { ...mockMediaRecord, refCount: 2 };
      const updatedMedia = { ...mockMediaRecord, refCount: 1 };

      mockPrismaClient.media.findUnique.mockResolvedValue(
        mediaWithHighRefCount as any,
      );
      mockPrismaClient.media.update.mockResolvedValue(updatedMedia as any);

      const result = await repository.decrementRefCountOrRemove('media-id-1');

      expect(result).toEqual(updatedMedia);
      expect(mockPrismaClient.media.update).toHaveBeenCalledWith({
        where: { id: 'media-id-1' },
        data: { refCount: 1 },
      });
    });

    it('should delete media when ref count reaches 0', async () => {
      const mediaWithLowRefCount = { ...mockMediaRecord, refCount: 1 };

      mockPrismaClient.media.findUnique.mockResolvedValue(
        mediaWithLowRefCount as any,
      );
      mockPrismaClient.media.delete.mockResolvedValue(mockMediaRecord as any);
      mockS3Client.send.mockResolvedValue({} as never);

      const result = await repository.decrementRefCountOrRemove('media-id-1');

      expect(result).toEqual(mockMediaRecord);
      expect(mockS3Client.send).toHaveBeenCalled(); // S3 delete command
      expect(mockPrismaClient.media.delete).toHaveBeenCalledWith({
        where: { id: 'media-id-1' },
      });
    });

    it('should return null when media not found', async () => {
      mockPrismaClient.media.findUnique.mockResolvedValue(null);

      const result =
        await repository.decrementRefCountOrRemove('non-existent-id');

      expect(result).toBeNull();
    });

    it('should handle S3 delete errors gracefully', async () => {
      const mediaWithLowRefCount = { ...mockMediaRecord, refCount: 1 };

      mockPrismaClient.media.findUnique.mockResolvedValue(
        mediaWithLowRefCount as any,
      );
      mockPrismaClient.media.delete.mockResolvedValue(mockMediaRecord as any);
      mockS3Client.send.mockRejectedValue(new Error('S3 Error') as never);

      const result = await repository.decrementRefCountOrRemove('media-id-1');

      expect(result).toEqual(mockMediaRecord);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete object'),
        expect.any(Error),
      );
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

  describe('uploadBuffer', () => {
    it('should upload buffer to S3', async () => {
      const buffer = Buffer.from('test-data');
      mockS3Client.send.mockResolvedValue({} as never);

      await repository.uploadBuffer(buffer, 'test-key', 'image/webp', true);

      expect(mockS3Client.send).toHaveBeenCalled();
    });
  });

  describe('downloadToBuffer', () => {
    it('should download file from S3 as buffer', async () => {
      const mockResponse = {
        Body: {
          transformToByteArray: jest
            .fn()
            .mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
        },
      };
      mockS3Client.send.mockResolvedValue(mockResponse as never);

      const result = await repository.downloadToBuffer('test-key');

      expect(result).toBeInstanceOf(Buffer);
      expect(mockS3Client.send).toHaveBeenCalled();
    });

    it('should return empty buffer when body is undefined', async () => {
      const mockResponse = { Body: undefined };
      mockS3Client.send.mockResolvedValue(mockResponse as never);

      const result = await repository.downloadToBuffer('test-key');

      expect(result).toEqual(Buffer.from([]));
    });
  });
});
