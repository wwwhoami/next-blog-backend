import { StorageService } from '@core/src/storage/storage.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PinoLogger } from 'nestjs-pino';
import { MediaVariant } from 'prisma/generated/client';
import sharp from 'sharp';
import { MediaEventsService } from '../media-events.service';
import { MediaProcessor } from '../media.processor';
import { MediaRepository } from '../media.repository';

// Mock sharp
jest.mock('sharp');

describe('MediaProcessor', () => {
  let processor: MediaProcessor;
  let mockRepository: DeepMockProxy<MediaRepository>;
  let mockEventsService: DeepMockProxy<MediaEventsService>;
  let mockLogger: DeepMockProxy<PinoLogger>;
  let mockSharp: jest.MockedFunction<typeof sharp>;
  let mockStorageService: DeepMockProxy<StorageService>;

  const mockOriginalMedia = {
    id: 'media-id-1',
    key: 'uploads/image/user-1/original.jpg',
    bucket: 'test-bucket',
    ownerId: 'user-1',
    type: 'IMAGE' as const,
    target: 'POST' as const,
    variant: MediaVariant.ORIGINAL,
    mimeType: 'image/jpeg',
    sizeBytes: BigInt(2048),
    publicUrl: 'https://example.com/original.jpg',
    hash: 'abcd1234',
    refCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    postId: null,
    commentId: null,
    parentId: null,
  };

  const mockJob: Partial<Job<{ mediaId: string }>> = {
    id: 'job-1',
    name: 'generateVariants',
    data: { mediaId: 'media-id-1' },
  };

  beforeEach(async () => {
    mockRepository = mockDeep<MediaRepository>();
    mockEventsService = mockDeep<MediaEventsService>();
    mockLogger = mockDeep<PinoLogger>();
    mockStorageService = mockDeep<StorageService>();

    // Mock storage service properties and methods
    mockStorageService.bucket = 'test-bucket';
    mockStorageService.buildPublicUrl.mockImplementation(
      (key: string) => `https://example.com/media/test-bucket/${key}`,
    );

    // Mock sharp
    mockSharp = sharp as jest.MockedFunction<typeof sharp>;
    const mockSharpInstance = {
      resize: jest.fn().mockReturnThis(),
      webp: jest.fn().mockReturnThis(),
      toBuffer: jest
        .fn()
        .mockResolvedValue(Buffer.from('processed-image-data')),
    };
    mockSharp.mockReturnValue(mockSharpInstance as any);

    const mockConfigService = mockDeep<ConfigService>();
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        MEDIA_BASE_URL: 'https://example.com/media',
        MINIO_ENDPOINT: 'https://minio.example.com',
      };
      return config[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaProcessor,
        { provide: MediaRepository, useValue: mockRepository },
        { provide: StorageService, useValue: mockStorageService },
        { provide: MediaEventsService, useValue: mockEventsService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    processor = module.get<MediaProcessor>(MediaProcessor);

    // Set up environment variable
    process.env.MEDIA_BASE_URL = 'https://example.com/media';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.MEDIA_BASE_URL;
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    beforeEach(() => {
      mockRepository.findById.mockResolvedValue(mockOriginalMedia as any);
      mockStorageService.downloadToBuffer.mockResolvedValue(
        Buffer.from('original-image-data'),
      );
      mockStorageService.uploadBuffer.mockResolvedValue(undefined);
      const variants: Awaited<ReturnType<MediaRepository['findVariants']>> = [];
      mockRepository.findVariants.mockResolvedValue(variants);
      mockRepository.beginVariantPut.mockImplementation(
        async (parentId, key, bucket) => ({
          parentId,
          key,
          bucket,
          leaseUntil: new Date(),
          token: 'attempt',
          released: false,
        }),
      );
      mockRepository.finishVariantPut.mockImplementation(
        async (attempt, data) => {
          variants.push({
            ...mockOriginalMedia,
            ...data,
            key: attempt.key,
            sizeBytes: BigInt(data.sizeBytes),
          } as (typeof variants)[number]);
        },
      );
      mockRepository.findByIdWithVariants.mockResolvedValue({
        ...mockOriginalMedia,
        Variants: variants,
      } as never);

      mockRepository.releaseVariantPut.mockResolvedValue(undefined);
      mockEventsService.publishUploadStatus.mockResolvedValue(undefined);
    });

    it('should process media variants successfully', async () => {
      const result = await processor.process(
        mockJob as Job<{ mediaId: string }>,
      );

      expect(mockRepository.findById).toHaveBeenCalledWith('media-id-1');
      expect(mockStorageService.downloadToBuffer).toHaveBeenCalledWith(
        mockOriginalMedia.key,
      );

      expect(mockStorageService.uploadBuffer).toHaveBeenCalledTimes(3);
      expect(mockRepository.finishVariantPut).toHaveBeenCalledTimes(3);
      expect(mockRepository.finishVariantPut).toHaveBeenCalledWith(
        expect.objectContaining({
          key: expect.stringContaining('__thumb.webp'),
          parentId: 'media-id-1',
        }),
        expect.objectContaining({
          variant: MediaVariant.THUMBNAIL,
          mimeType: 'image/webp',
        }),
      );

      expect(mockEventsService.publishUploadStatus).toHaveBeenCalledWith({
        status: 'completed',
        payload: {
          ownerId: 'user-1',
          mediaId: 'media-id-1',
          variants: expect.arrayContaining([
            expect.objectContaining({
              key: expect.any(String),
              publicUrl: expect.any(String),
            }),
          ]),
        },
      });

      expect(result).toEqual({
        mediaId: 'media-id-1',
        variants: expect.any(Array),
      });
    });

    it('should return early when original media not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await processor.process(
        mockJob as Job<{ mediaId: string }>,
      );

      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Original media not found for mediaId: media-id-1',
      );
    });

    it('should use sharp with correct parameters for each variant', async () => {
      await processor.process(mockJob as Job<{ mediaId: string }>);

      // Should call sharp with the downloaded buffer
      expect(mockSharp).toHaveBeenCalledWith(
        Buffer.from('original-image-data'),
      );

      // Check that resize and webp were called for each variant
      const mockSharpInstance = mockSharp.mock.results[0].value;
      expect(mockSharpInstance.resize).toHaveBeenCalledWith({
        width: 300,
        withoutEnlargement: true,
      });
      expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 65 });
    });

    it.each(['PUT', 'finalization'])(
      'repairs only the missing key after a %s failure',
      async (step) => {
        const error = new Error(`${step} failed`);
        if (step === 'PUT') {
          mockStorageService.uploadBuffer.mockRejectedValueOnce(error);
        } else {
          mockRepository.finishVariantPut.mockRejectedValueOnce(error);
        }
        await expect(
          processor.process(mockJob as Job<{ mediaId: string }>),
        ).rejects.toThrow(error);
        const failedKey = mockStorageService.uploadBuffer.mock.calls[0][1];
        expect(mockRepository.releaseVariantPut).toHaveBeenCalledWith(
          expect.objectContaining({ key: failedKey, token: 'attempt' }),
        );
        mockStorageService.uploadBuffer.mockClear();

        await expect(
          processor.process(mockJob as Job<{ mediaId: string }>),
        ).resolves.toMatchObject({
          variants: [
            expect.any(Object),
            expect.any(Object),
            expect.any(Object),
          ],
        });
        expect(mockStorageService.uploadBuffer).toHaveBeenCalledTimes(1);
        expect(mockStorageService.uploadBuffer.mock.calls[0][1]).toBe(
          failedKey,
        );
      },
    );
  });

  describe('onFailed', () => {
    it('should log error when job fails', () => {
      const mockError = new Error('Processing failed');
      const mockFailedJob = {
        id: 'job-1',
        name: 'generateVariants',
        data: { mediaId: 'media-id-1' },
      } as Job<{ mediaId: string }>;

      processor.onFailed(mockFailedJob, mockError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Job job-1 failed for mediaId: media-id-1',
        mockError,
      );
    });
  });
});
