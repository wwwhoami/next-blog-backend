import { NotFoundError } from '@app/shared/errors/not-found.error';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { MediaTarget, MediaType, MediaVariant } from 'prisma/generated/client';
import sharp from 'sharp';
import { UnprocesasbleEntityError } from '../../common/errors/unprocessable-entity.errror';
import { UploadMediaDto } from '../dto/upload-media.dto';
import { MediaEventsService } from '../media-events.service';
import { MediaRepository } from '../media.repository';
import { MediaService } from '../media.service';

// Mock sharp
jest.mock('sharp');

describe('MediaService', () => {
  let service: MediaService;
  let mockRepository: DeepMockProxy<MediaRepository>;
  let mockEventsService: DeepMockProxy<MediaEventsService>;
  let mockConfigService: DeepMockProxy<ConfigService>;
  let mockQueue: DeepMockProxy<Queue>;
  let mockSharp: jest.MockedFunction<typeof sharp>;

  // Create a minimal valid PNG buffer (1x1 pixel)
  const validImageBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x5c, 0xc8, 0x5d, 0xb7, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024 * 1024, // 1MB
    buffer: validImageBuffer,
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  };

  const mockMediaDto: UploadMediaDto = {
    type: MediaType.IMAGE,
    target: MediaTarget.POST,
  };

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
    Variants: null,
  };

  beforeEach(async () => {
    mockRepository = mockDeep<MediaRepository>();
    mockEventsService = mockDeep<MediaEventsService>();
    mockConfigService = mockDeep<ConfigService>();
    mockQueue = mockDeep<Queue>();

    // Mock sharp
    mockSharp = sharp as jest.MockedFunction<typeof sharp>;
    const mockSharpInstance = {
      metadata: jest.fn().mockResolvedValue({ width: 100, height: 100 }),
      toFormat: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        data: Buffer.from('processed-image-data'),
        info: { size: 1024 },
      }),
    };
    mockSharp.mockReturnValue(mockSharpInstance as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: MediaRepository, useValue: mockRepository },
        { provide: MediaEventsService, useValue: mockEventsService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'BullQueue_media-processor', useValue: mockQueue },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);

    // Setup config service mocks
    mockConfigService.get.mockImplementation((key: string) => {
      const config = {
        MEDIA_BASE_URL: 'https://example.com/media',
        MINIO_MEDIA_BUCKET: 'test-bucket',
        MINIO_ENDPOINT: 'https://minio.example.com',
      };
      return config[key];
    });

    // Set environment variable
    process.env.MINIO_MEDIA_BUCKET = 'test-bucket';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.MINIO_MEDIA_BUCKET;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    it('should throw BadRequestException for unsupported file format', async () => {
      const invalidFile = { ...mockFile, mimetype: 'image/gif' };

      await expect(
        service.upload(invalidFile, 'user-1', mockMediaDto),
      ).rejects.toThrow(UnprocesasbleEntityError);
    });

    it('should throw BadRequestException for file too large', async () => {
      const largeFile = { ...mockFile, size: 10 * 1024 * 1024 }; // 10MB

      await expect(
        service.upload(largeFile, 'user-1', mockMediaDto),
      ).rejects.toThrow(UnprocesasbleEntityError);
    });

    it('should return existing media if hash already exists', async () => {
      mockRepository.findByHashAndType.mockResolvedValue(mockMediaRecord);
      mockRepository.incrementRefCount.mockResolvedValue(mockMediaRecord);

      const result = await service.upload(mockFile, 'user-1', mockMediaDto);

      expect(result).toEqual(mockMediaRecord);
      expect(mockRepository.findByHashAndType).toHaveBeenCalledWith(
        expect.any(String),
        MediaType.IMAGE,
      );
      expect(mockRepository.incrementRefCount).toHaveBeenCalledWith(
        mockMediaRecord.id,
      );
    });

    it('should create new media record and enqueue processing job', async () => {
      mockRepository.findByHashAndType.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue(mockMediaRecord);
      mockQueue.add.mockResolvedValue({} as any);

      const result = await service.upload(mockFile, 'user-1', mockMediaDto);

      expect(result).toEqual(mockMediaRecord);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'user-1',
          type: MediaType.IMAGE,
          target: MediaTarget.POST,
          variant: MediaVariant.ORIGINAL,
          mimeType: 'image/webp',
          hash: expect.any(String),
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'generateVariants',
        { mediaId: mockMediaRecord.id },
        expect.any(Object),
      );
    });
  });

  describe('getMediaWithVariants', () => {
    it('should return media with variants', async () => {
      const mediaWithVariants = {
        ...mockMediaRecord,
        Variants: [
          {
            id: 'variant-1',
            key: 'uploads/image/user-1/test__thumb.webp',
            ownerId: 'user-1',
            parentId: mockMediaRecord.id,
            postId: null,
            commentId: null,
            type: MediaType.IMAGE,
            variant: MediaVariant.THUMBNAIL,
            publicUrl: 'https://example.com/media/test__thumb.webp',
            mimeType: 'image/webp',
            sizeBytes: BigInt(512),
            bucket: 'test-bucket',
          },
        ],
      };

      mockRepository.findByIdWithVariants.mockResolvedValue(mediaWithVariants);

      const result = await service.getMediaWithVariants('media-id-1');

      expect(result).toEqual({
        id: mockMediaRecord.id,
        key: mockMediaRecord.key,
        type: mockMediaRecord.type,
        target: mockMediaRecord.target,
        variant: mockMediaRecord.variant,
        publicUrl: mockMediaRecord.publicUrl,
        children: [
          {
            id: 'variant-1',
            key: 'uploads/image/user-1/test__thumb.webp',
            variant: MediaVariant.THUMBNAIL,
            publicUrl: 'https://example.com/media/test__thumb.webp',
            mimeType: 'image/webp',
            sizeBytes: BigInt(512),
          },
        ],
      });
    });

    it('should throw NotFoundError when media not found', async () => {
      mockRepository.findByIdWithVariants.mockResolvedValue(null);

      await expect(
        service.getMediaWithVariants('non-existent-id'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getAuthorId', () => {
    it('should return author id', async () => {
      const expectedResult = { authorId: 'user-1' };
      mockRepository.getAuthorId.mockResolvedValue(expectedResult);

      const result = await service.getAuthorId('media-id-1');

      expect(result).toEqual(expectedResult);
      expect(mockRepository.getAuthorId).toHaveBeenCalledWith('media-id-1');
    });
  });

  describe('getPresignedUrl', () => {
    it('should return presigned URL', async () => {
      const expectedUrl = 'https://example.com/presigned-url';
      mockRepository.getPresignedUrl.mockResolvedValue(expectedUrl);

      const result = await service.getPresignedUrl('media-id-1', 600);

      expect(result).toBe(expectedUrl);
      expect(mockRepository.getPresignedUrl).toHaveBeenCalledWith(
        'media-id-1',
        600,
      );
    });

    it('should use default TTL when not specified', async () => {
      const expectedUrl = 'https://example.com/presigned-url';
      mockRepository.getPresignedUrl.mockResolvedValue(expectedUrl);

      await service.getPresignedUrl('media-id-1');

      expect(mockRepository.getPresignedUrl).toHaveBeenCalledWith(
        'media-id-1',
        600,
      );
    });
  });

  describe('removeReference', () => {
    it('should remove media reference', async () => {
      const expectedResult = mockMediaRecord;
      mockRepository.decrementRefCountOrRemove.mockResolvedValue(
        expectedResult,
      );

      const result = await service.removeReference('media-id-1');

      expect(result).toEqual(expectedResult);
      expect(mockRepository.decrementRefCountOrRemove).toHaveBeenCalledWith(
        'media-id-1',
      );
    });
  });
});
