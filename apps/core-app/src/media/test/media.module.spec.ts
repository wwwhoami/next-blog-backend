import { PrismaService } from '@app/prisma';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PinoLogger } from 'nestjs-pino';
import { PrismaClient } from 'prisma/generated/client';
import { MediaEventsService } from '../media-events.service';
import { MediaProcessor } from '../media.processor';
import { MediaRepository } from '../media.repository';
import { MediaService } from '../media.service';

describe('MediaModule Components', () => {
  let mockPrismaClient: DeepMockProxy<PrismaClient>;
  let mockConfigService: DeepMockProxy<ConfigService>;
  let mockQueue: DeepMockProxy<Queue>;
  let mockLogger: DeepMockProxy<PinoLogger>;

  beforeEach(async () => {
    mockPrismaClient = mockDeep<PrismaClient>();
    mockConfigService = mockDeep<ConfigService>();
    mockQueue = mockDeep<Queue>();
    mockLogger = mockDeep<PinoLogger>();

    // Setup config service mocks
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        MINIO_MEDIA_BUCKET: 'test-bucket',
        MINIO_REGION: 'us-east-1',
        MINIO_ENDPOINT: 'https://minio.example.com',
        MINIO_ACCESS_KEY: 'test-access-key',
        MINIO_SECRET_KEY: 'test-secret-key',
      };

      return config[key];
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create MediaService', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        MediaRepository,
        MediaEventsService,
        { provide: PrismaService, useValue: mockPrismaClient },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'BullQueue_media-processor', useValue: mockQueue },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    const service = module.get<MediaService>(MediaService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(MediaService);
  });

  it('should create MediaRepository', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaRepository,
        { provide: PrismaService, useValue: mockPrismaClient },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    const repository = module.get<MediaRepository>(MediaRepository);
    expect(repository).toBeDefined();
    expect(repository).toBeInstanceOf(MediaRepository);
  });

  it('should create MediaProcessor', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaProcessor,
        MediaRepository,
        MediaEventsService,
        { provide: PrismaService, useValue: mockPrismaClient },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    const processor = module.get<MediaProcessor>(MediaProcessor);
    expect(processor).toBeDefined();
    expect(processor).toBeInstanceOf(MediaProcessor);
  });

  it('should create MediaEventsService', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaEventsService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PinoLogger, useValue: mockLogger },
      ],
    }).compile();

    const eventsService = module.get<MediaEventsService>(MediaEventsService);
    expect(eventsService).toBeDefined();
    expect(eventsService).toBeInstanceOf(MediaEventsService);
  });
});
