import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { StorageService } from './storage.service';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('StorageService', () => {
  let service: StorageService;
  let mockConfigService: DeepMockProxy<ConfigService>;
  let mockS3Client: DeepMockProxy<S3Client>;

  beforeEach(async () => {
    mockConfigService = mockDeep<ConfigService>();
    mockS3Client = mockDeep<S3Client>();

    // Mock S3Client constructor
    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () => mockS3Client as any,
    );

    // Setup config mocks
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
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
        StorageService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with bucket from config', () => {
    expect(service.bucket).toBe('test-bucket');
    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith(
      'MINIO_MEDIA_BUCKET',
    );
  });

  it('should initialize S3 client with correct config', () => {
    expect(S3Client).toHaveBeenCalledWith({
      region: 'us-east-1',
      endpoint: 'https://minio.example.com',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      },
    });
  });

  describe('buildPublicUrl', () => {
    it('should build public URL correctly', () => {
      mockConfigService.get.mockReturnValue('https://cdn.example.com');

      const url = service.buildPublicUrl('uploads/test.jpg');

      expect(url).toBe('https://cdn.example.com/test-bucket/uploads/test.jpg');
    });

    it('should use MINIO_ENDPOINT as fallback', () => {
      mockConfigService.get
        .mockReturnValueOnce(null) // MEDIA_BASE_URL
        .mockReturnValueOnce('https://minio.example.com'); // MINIO_ENDPOINT

      const url = service.buildPublicUrl('uploads/test.jpg');

      expect(url).toBe(
        'https://minio.example.com/test-bucket/uploads/test.jpg',
      );
    });

    it('should handle empty base URL', () => {
      mockConfigService.get.mockReturnValue(null);

      const url = service.buildPublicUrl('uploads/test.jpg');

      expect(url).toBe('/test-bucket/uploads/test.jpg');
    });
  });

  describe('getPresignedUrl', () => {
    it('should generate presigned URL with custom TTL', async () => {
      const expectedUrl = 'https://example.com/presigned-url';
      (getSignedUrl as jest.Mock).mockResolvedValue(expectedUrl);

      const result = await service.getPresignedUrl(
        'test-bucket',
        'test-key',
        3600,
      );

      expect(result).toBe(expectedUrl);
      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(GetObjectCommand),
        { expiresIn: 3600 },
      );
    });

    it('should use default TTL when not specified', async () => {
      const expectedUrl = 'https://example.com/presigned-url';
      (getSignedUrl as jest.Mock).mockResolvedValue(expectedUrl);

      await service.getPresignedUrl('test-bucket', 'test-key');

      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(GetObjectCommand),
        { expiresIn: 600 },
      );
    });
  });

  describe('uploadBuffer', () => {
    it('should upload buffer to S3 with public ACL', async () => {
      const buffer = Buffer.from('test-data');
      mockS3Client.send.mockResolvedValue({} as never);

      await service.uploadBuffer(buffer, 'test-key', 'image/webp', true);

      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(PutObjectCommand),
      );
    });

    it('should upload buffer to S3 with private ACL', async () => {
      const buffer = Buffer.from('test-data');
      mockS3Client.send.mockResolvedValue({} as never);

      await service.uploadBuffer(buffer, 'test-key', 'image/webp', false);

      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(PutObjectCommand),
      );
    });

    it('should handle upload errors', async () => {
      const buffer = Buffer.from('test-data');
      const error = new Error('Upload failed');
      mockS3Client.send.mockRejectedValue(error);

      await expect(
        service.uploadBuffer(buffer, 'test-key', 'image/webp', true),
      ).rejects.toThrow('Upload failed');
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

      const result = await service.downloadToBuffer('test-key');

      expect(result).toBeInstanceOf(Buffer);
      expect(result).toEqual(Buffer.from([1, 2, 3, 4]));
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(GetObjectCommand),
      );
    });

    it('should return empty buffer when body is undefined', async () => {
      const mockResponse = { Body: undefined };
      mockS3Client.send.mockResolvedValue(mockResponse as never);

      const result = await service.downloadToBuffer('test-key');

      expect(result).toEqual(Buffer.from([]));
    });

    it('should handle download errors', async () => {
      const error = new Error('Download failed');
      mockS3Client.send.mockRejectedValue(error);

      await expect(service.downloadToBuffer('test-key')).rejects.toThrow(
        'Download failed',
      );
    });
  });

  describe('deleteObject', () => {
    it('should delete object from S3', async () => {
      mockS3Client.send.mockResolvedValue({} as never);

      await service.deleteObject('test-key', 'test-bucket');

      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(DeleteObjectCommand),
      );
    });

    it('should handle delete errors', async () => {
      const error = new Error('Delete failed');
      mockS3Client.send.mockRejectedValue(error);

      await expect(
        service.deleteObject('test-key', 'test-bucket'),
      ).rejects.toThrow('Delete failed');
    });
  });
});
