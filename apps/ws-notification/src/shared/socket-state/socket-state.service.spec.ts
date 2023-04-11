import { Test, TestingModule } from '@nestjs/testing';
import { SocketStateService } from './socket-state.service';

describe('SocketStateService', () => {
  let service: SocketStateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SocketStateService],
    }).compile();

    service = module.get<SocketStateService>(SocketStateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
