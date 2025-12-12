import { Test, TestingModule } from '@nestjs/testing';
import { MediaVariant } from '@prisma/client';
import { Job } from 'bullmq';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PinoLogger } from 'nestjs-pino';
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
    data: { mediaId: 'media-id-1' },
  };

  beforeEach(async () => {
    mockRepository = mockDeep<MediaRepository>();
    mockEventsService = mockDeep<MediaEventsService>();
    mockLogger = mockDeep<PinoLogger>();

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaProcessor,
        { provide: MediaRepository, useValue: mockRepository },
        { provide: MediaEventsService, useValue: mockEventsService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    processor = module.get<MediaProcessor>(MediaProcessor);

    // Set up environment variable
    process.env.MEDIA_BASE_URL = 'https://example.com/media';
  });

  afterEach(() => {
    delete process.env.MEDIA_BASE_URL;
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    beforeEach(() => {
      mockRepository.findById.mockResolvedValue(mockOriginalMedia as any);
      mockRepository.downloadToBuffer.mockResolvedValue(
        Buffer.from('original-image-data'),
      );
      mockRepository.uploadBuffer.mockResolvedValue(undefined);
      mockRepository.create.mockImplementation(
        async (data) =>
          ({
            ...mockOriginalMedia,
            id: `variant-${data.variant}`,
            key: data.key,
            variant: data.variant,
            mimeType: data.mimeType,
            sizeBytes: data.sizeBytes,
          }) as any,
      );

      // Mock prisma update for parentId
      (mockRepository as any).prisma = {
        media: {
          update: jest.fn().mockResolvedValue({}),
        },
      };

      mockEventsService.publishVariantsReady.mockResolvedValue(undefined);
    });

    it('should process media variants successfully', async () => {
      const result = await processor.process(
        mockJob as Job<{ mediaId: string }>,
      );

      expect(mockRepository.findById).toHaveBeenCalledWith('media-id-1');
      expect(mockRepository.downloadToBuffer).toHaveBeenCalledWith(
        mockOriginalMedia.key,
      );

      // Should create 3 variants
      expect(mockRepository.create).toHaveBeenCalledTimes(3);
      expect(mockRepository.uploadBuffer).toHaveBeenCalledTimes(3);

      // Check thumbnail variant
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: MediaVariant.THUMBNAIL,
          key: expect.stringContaining('__thumb.webp'),
          mimeType: 'image/webp',
        }),
      );

      // Check medium variant
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: MediaVariant.MEDIUM,
          key: expect.stringContaining('__medium.webp'),
          mimeType: 'image/webp',
        }),
      );

      // Check large variant
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: MediaVariant.LARGE,
          key: expect.stringContaining('__large.webp'),
          mimeType: 'image/webp',
        }),
      );

      expect(mockEventsService.publishVariantsReady).toHaveBeenCalledWith({
        mediaId: 'media-id-1',
        variants: expect.arrayContaining([
          expect.objectContaining({
            key: expect.any(String),
            publicUrl: expect.any(String),
          }),
        ]),
      });

      expect(result).toEqual({
        mediaId: 'media-id-1',
        variants: expect.any(Array),
      });
    });

    it('should throw error when original media not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        processor.process(mockJob as Job<{ mediaId: string }>),
      ).rejects.toThrow('Original media not found: media-id-1');
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

    it('should set parentId for created variants', async () => {
      await processor.process(mockJob as Job<{ mediaId: string }>);

      // Should update each variant with parentId
      expect((mockRepository as any).prisma.media.update).toHaveBeenCalledTimes(
        3,
      );
      expect((mockRepository as any).prisma.media.update).toHaveBeenCalledWith({
        where: { id: expect.any(String) },
        data: { parentId: 'media-id-1' },
      });
    });
  });

  describe('onFailed', () => {
    it('should log error when job fails', () => {
      const mockError = new Error('Processing failed');
      const mockJob = { id: 'job-1' } as Job;

      processor.onFailed(mockJob, mockError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Job job-1 failed: ',
        'Processing failed',
      );
    });
  });
});
