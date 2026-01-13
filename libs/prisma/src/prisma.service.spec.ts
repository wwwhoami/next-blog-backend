import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  let configService: DeepMockProxy<ConfigService>;

  beforeEach(async () => {
    configService = mockDeep<ConfigService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
