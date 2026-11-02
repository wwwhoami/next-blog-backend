import { Test, TestingModule } from '@nestjs/testing';
import { MockProxy, mock } from 'jest-mock-extended';
import { DraftController } from '../draft.controller';
import { DraftService } from '../draft.service';

describe('DraftController', () => {
  let controller: DraftController;
  let service: MockProxy<DraftService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DraftController],
      providers: [{ provide: DraftService, useValue: mock<DraftService>() }],
    }).compile();

    controller = module.get(DraftController);
    service = module.get(DraftService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('forwards draft creation to the service', async () => {
    const dto = { title: 'Title', content: 'Content' };
    const draft = { id: 'draft-id' };
    service.create.mockResolvedValue(draft as never);

    await expect(controller.create('owner-id', dto)).resolves.toBe(draft);
    expect(service.create).toHaveBeenCalledWith('owner-id', dto);
  });

  it('forwards draft updates to the service', async () => {
    const dto = { content: 'Updated content' };
    const draft = { id: 'draft-id', content: dto.content };
    service.update.mockResolvedValue(draft as never);

    await expect(controller.update('draft-id', 'owner-id', dto)).resolves.toBe(
      draft,
    );
    expect(service.update).toHaveBeenCalledWith('draft-id', 'owner-id', dto);
  });

  it('forwards publishing to the service', async () => {
    const post = { id: 1 };
    service.publish.mockResolvedValue(post as never);

    await expect(controller.publish('draft-id', 'owner-id')).resolves.toBe(
      post,
    );
    expect(service.publish).toHaveBeenCalledWith('draft-id', 'owner-id');
  });
});
