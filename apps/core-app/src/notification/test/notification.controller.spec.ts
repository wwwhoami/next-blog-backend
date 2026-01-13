import { NotificationMessage, PostPayload } from '@app/shared/entities';
import { Test, TestingModule } from '@nestjs/testing';
import { MockProxy, mock } from 'jest-mock-extended';
import { NotificationController } from '../notification.controller';
import { NotificationService } from '../notification.service';

describe('NotificationController', () => {
  let controller: NotificationController;
  let notificationService: MockProxy<NotificationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        { provide: NotificationService, useValue: mock<NotificationService>() },
      ],
    }).compile();

    notificationService = module.get(NotificationService);
    controller = module.get<NotificationController>(NotificationController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMany', () => {
    it('should return an array of notifications', async () => {
      const userId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const getNotificationsQuery = {};
      const notifications: NotificationMessage<PostPayload>[] = [
        {
          actor: 'afe39927-eb6b-4e73-8d06-239fe6b14eb4',
          target: '2',
          data: {
            id: 1,
          },
        },
      ];

      notificationService.getMany.mockResolvedValueOnce(notifications);

      expect(await controller.getMany(userId, getNotificationsQuery)).toBe(
        notifications,
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      const id = 1;
      const userId = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const notification: NotificationMessage<PostPayload> = {
        actor: 'afe39927-eb6b-4e73-8d06-239fe6b14eb4',
        target: '2',
        data: {
          id: 1,
        },
      };

      notificationService.markAsRead.mockResolvedValueOnce(notification);

      expect(await controller.markAsRead(id, userId)).toBe(notification);
    });
  });
});
