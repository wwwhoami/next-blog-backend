import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import {
  MEDIA_VARIANTS_READY_EVENT,
  MediaEventsService,
  MediaVariantsReadyPayload,
} from '../media-events.service';

// Mock Redis
jest.mock('ioredis');

describe('MediaEventsService', () => {
  let service: MediaEventsService;
  let mockConfigService: DeepMockProxy<ConfigService>;
  let mockPubRedis: DeepMockProxy<Redis>;
  let mockSubRedis: DeepMockProxy<Redis>;

  beforeEach(async () => {
    mockConfigService = mockDeep<ConfigService>();
    mockPubRedis = mockDeep<Redis>();
    mockSubRedis = mockDeep<Redis>();

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaEventsService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MediaEventsService>(MediaEventsService);

    // Manually set the Redis instances for testing
    (service as any).pub = mockPubRedis;
    (service as any).sub = mockSubRedis;
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
        'media:variants-ready',
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
      };

      mockSubRedis.subscribe.mockResolvedValue(1);
      mockSubRedis.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          // Simulate message received
          setTimeout(
            () => callback('media:variants-ready', JSON.stringify(payload)),
            0,
          );
        }
        return mockSubRedis;
      });

      const emitSpy = jest.spyOn(service, 'emit');

      await service.onModuleInit();

      // Wait for async callback
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(emitSpy).toHaveBeenCalledWith(MEDIA_VARIANTS_READY_EVENT, payload);
    });

    it('should handle invalid JSON messages gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockSubRedis.subscribe.mockResolvedValue(1);
      mockSubRedis.on.mockImplementation((event, callback) => {
        if (event === 'message') {
          // Simulate invalid JSON message
          setTimeout(() => callback('media:variants-ready', 'invalid-json'), 0);
        }
        return mockSubRedis;
      });

      await service.onModuleInit();

      // Wait for async callback
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse pubsub message',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
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

  describe('publishVariantsReady', () => {
    it('should publish message to Redis and emit locally', async () => {
      const payload: MediaVariantsReadyPayload = {
        mediaId: 'media-1',
        variants: [
          { key: 'test.webp', publicUrl: 'https://example.com/test.webp' },
        ],
      };

      mockPubRedis.publish.mockResolvedValue(1);
      const emitSpy = jest.spyOn(service, 'emit');

      await service.publishVariantsReady(payload);

      expect(mockPubRedis.publish).toHaveBeenCalledWith(
        'media:variants-ready',
        JSON.stringify(payload),
      );
      expect(emitSpy).toHaveBeenCalledWith(MEDIA_VARIANTS_READY_EVENT, payload);
    });
  });
});
