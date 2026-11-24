import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DraftMaintenanceService } from '../draft-maintenance.service';
import { DraftPublicationRepository } from '../draft-publication.repository';

describe('DraftMaintenanceService', () => {
  let service: DraftMaintenanceService;
  let repository: DeepMockProxy<DraftPublicationRepository>;
  let queue: { add: jest.Mock; getJobState: jest.Mock; getJob: jest.Mock };

  beforeEach(() => {
    repository = mockDeep<DraftPublicationRepository>();
    queue = { add: jest.fn(), getJobState: jest.fn(), getJob: jest.fn() };
    service = new DraftMaintenanceService(repository, queue as never);
  });

  it('preserves claims while Redis state is unavailable or the enqueue grace period is open', async () => {
    repository.pendingClaims.mockResolvedValue([
      { id: 'old', publicationAttemptId: 'a', updatedAt: new Date(0) },
      { id: 'new', publicationAttemptId: 'b', updatedAt: new Date() },
    ]);
    queue.getJobState
      .mockRejectedValueOnce(new Error('Redis unavailable'))
      .mockResolvedValueOnce('unknown');
    await service.reconcile();
    expect(repository.markValidationFailed).not.toHaveBeenCalled();
    expect(queue.getJob).not.toHaveBeenCalled();
  });
});
