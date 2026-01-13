import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PinoLogger } from 'nestjs-pino';
import {
  MEDIA_UPLOAD_STATUS_CHANNEL,
  MediaEventsService,
  MediaVariantsReadyPayload,
} from '../media-events.service';

// Mock Redis
jest.mock('ioredis');

describe('MediaEventsService', () => {
  let service: MediaEventsService;
  let module: TestingModule;
  let mockConfigService: DeepMockProxy<ConfigService>;
  let mockPubRedis: DeepMockProxy<Redis>;
  let mockSubRedis: DeepMockProxy<Redis>;
  let mockLogger: DeepMockProxy<PinoLogger>;

  beforeEach(async () => {
    mockConfigService = mockDeep<ConfigService>();
    mockPubRedis = mockDeep<Redis>();
    mockSubRedis = mockDeep<Redis>();
    mockLogger = mockDeep<PinoLogger>();

    // Mock Redis quit methods to avoid connection issues
    mockPubRedis.quit.mockResolvedValue('OK');
    mockSubRedis.quit.mockResolvedValue('OK');

    // Mock Redis constructor
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(
      () => mockPubRedis as any,
    );

    // Setup config mocks
    mockConfigService.get.mockImplementation((key: string) => {
      const config = {
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
      } as const;

      return config[key];
    });

    module = await Test.createTestingModule({
      providers: [
        MediaEventsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<MediaEventsService>(MediaEventsService);

    // Manually set the Redis instances for testing
    (service as any).pub = mockPubRedis;
    (service as any).sub = mockSubRedis;
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should subscribe to Redis channel and setup message handler', async () => {
      mockSubRedis.subscribe.mockResolvedValue(1);
      mockSubRedis.on.mockReturnValue(mockSubRedis);

      await service.onModuleInit();

      expect(mockSubRedis.subscribe).toHaveBeenCalledWith(
        MEDIA_UPLOAD_STATUS_CHANNEL,
      );
      expect(mockSubRedis.on).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
    });

    it('should emit local event when valid message received', async () => {
      const payload: MediaVariantsReadyPayload = {
        mediaId: 'media-1',
        variants: [
          { key: 'test.webp', publicUrl: 'https://example.com/test.webp' },
        ],
        ownerId: 'owner-1',
      };

      mockSubRedis.subscribe.mockResolvedValue(1);
      mockSubRedis.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          // Simulate message received
          setTimeout(
            () =>
              callback(MEDIA_UPLOAD_STATUS_CHANNEL, JSON.stringify(payload)),
            0,
          );
        }
        return mockSubRedis;
      });

      const emitSpy = jest.spyOn(service, 'emit');

      await service.onModuleInit();

      // Wait for async callback
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(emitSpy).toHaveBeenCalledWith('upload.status.media-1', {
        status: 'completed',
        mediaId: 'media-1',
        variants: [
          { key: 'test.webp', publicUrl: 'https://example.com/test.webp' },
        ],
      });
    });

    it('should handle invalid JSON messages gracefully', async () => {
      const loggerErrorSpy = jest.spyOn(mockLogger, 'error');

      mockSubRedis.subscribe.mockResolvedValue(1);
      mockSubRedis.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          // Simulate invalid JSON message
          setTimeout(
            () => callback(MEDIA_UPLOAD_STATUS_CHANNEL, 'invalid-json'),
            0,
          );
        }
        return mockSubRedis;
      });

      await service.onModuleInit();

      // Wait for async callback
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(loggerErrorSpy.mock.calls[0][0]).toContain(
        'Failed to parse pubsub message',
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit both Redis connections', async () => {
      mockPubRedis.quit.mockResolvedValue('OK');
      mockSubRedis.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockPubRedis.quit).toHaveBeenCalled();
      expect(mockSubRedis.quit).toHaveBeenCalled();
    });
  });

  describe('publishUploadStatus', () => {
    it('should publish message to Redis and emit locally', async () => {
      const payload: MediaVariantsReadyPayload = {
        mediaId: 'media-1',
        variants: [
          { key: 'test.webp', publicUrl: 'https://example.com/test.webp' },
        ],
        ownerId: 'owner-1',
      };

      mockPubRedis.publish.mockResolvedValue(1);
      const emitSpy = jest.spyOn(service, 'emit');

      const message = {
        status: 'completed' as const,
        payload,
      };

      await service.publishUploadStatus(message);

      expect(mockPubRedis.publish).toHaveBeenCalledWith(
        MEDIA_UPLOAD_STATUS_CHANNEL,
        JSON.stringify(message),
      );
      expect(emitSpy).toHaveBeenCalledWith('upload.status.media-1', message);
    });
  });
});
