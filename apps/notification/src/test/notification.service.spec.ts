import {
  CommentPayload,
  NotificationMessage,
  PostPayload,
} from '@app/shared/entities';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@prisma/client';
import { REDIS_SOCKET_EVENT_EMIT_ALL_NAME } from '@ws-notification/src/shared/redis-propagator/redis-propagator.constants';
import { REDIS_PUBLISHER_CLIENT } from '@app/shared/redis/redis.constants';
import { MockProxy, mock } from 'jest-mock-extended';
import { NotificationRepository } from '../notification.repository';
import { NotificationService } from '../notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let notificationRepository: MockProxy<NotificationRepository>;
  let redisPublisherClient: MockProxy<ClientProxy>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: NotificationRepository,
          useValue: mock<NotificationRepository>(),
        },
        { provide: REDIS_PUBLISHER_CLIENT, useValue: mock<ClientProxy>() },
      ],
    }).compile();

    notificationRepository = module.get(NotificationRepository);
    redisPublisherClient = module.get(REDIS_PUBLISHER_CLIENT);
    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('commentNotification', () => {
    it('should create a comment notification', async () => {
      const message: NotificationMessage<CommentPayload> = {
        target: 'target',
        actor: 'actor',
        data: {
          id: 1,
          postId: 1,
        },
      };
      const type: NotificationType = 'COMMENT_CREATE';

      await service.commentNotification(message, type);

      expect(notificationRepository.create).toHaveBeenCalledWith(message, type);
      expect(redisPublisherClient.emit).toHaveBeenCalledWith(
        REDIS_SOCKET_EVENT_EMIT_ALL_NAME,
        {
          event: `${type}:${message.data.postId}`,
          userId: message.target,
          data: message.data,
        },
      );
    });
  });

  describe('postNotification', () => {
    it('should create a post notification', async () => {
      const message: NotificationMessage<PostPayload> = {
        target: 'target',
        actor: 'actor',
        data: {
          id: 1,
        },
      };
      const type: NotificationType = 'POST_LIKE';

      await service.postNotification(message, type);

      expect(notificationRepository.create).toHaveBeenCalledWith(message, type);
      expect(redisPublisherClient.emit).toHaveBeenCalledWith(
        REDIS_SOCKET_EVENT_EMIT_ALL_NAME,
        {
          event: `${type}:${message.data.id}`,
          userId: message.target,
          data: message.data,
        },
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read if user is authorized', async () => {
      const userId = 'userId';
      const id = 1;
      const target = 'userId';

      notificationRepository.getTargetId.mockResolvedValue({ target });

      await service.markAsRead(userId, id);

      expect(notificationRepository.getTargetId).toHaveBeenCalledWith(id);
      expect(notificationRepository.markAsRead).toHaveBeenCalledWith(id);
    });

    it('should throw an error if the user is not authorized', async () => {
      const userId = 'userId';
      const id = 1;
      const target = 'notUserId';

      notificationRepository.getTargetId.mockResolvedValue({ target });

      await expect(service.markAsRead(userId, id)).rejects.toThrowError(
        RpcException,
      );
    });
  });

  describe('getManyForUser', () => {
    it('should get many notifications for a user', async () => {
      const userId = 'userId';
      const skip = 0;
      const take = 10;

      await service.getManyForUser(userId, { skip, take });

      expect(notificationRepository.getManyForUser).toHaveBeenCalledWith(
        userId,
        { skip, take },
      );
    });
  });
});
