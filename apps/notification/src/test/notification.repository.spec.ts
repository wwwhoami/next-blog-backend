import { PrismaService } from '@app/prisma';
import { Test, TestingModule } from '@nestjs/testing';
import { Notification, Prisma, PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { NotificationRepository } from '../notification.repository';
import { NotificationMessage } from '@app/shared/entities';

const notifications: Notification[] = [
  {
    id: 1,
    isRead: false,
    actor: 'actor-id',
    target: 'target-id',
    data: {
      id: 1,
      content: 'content',
    },
    type: 'COMMENT_CREATE',
    createdAt: new Date(),
  },
  {
    id: 2,
    isRead: false,
    actor: 'actor-id',
    target: 'target-id',
    data: {
      id: 1,
      content: 'content',
    },
    type: 'COMMENT_CREATE',
    createdAt: new Date(),
  },
  {
    id: 3,
    isRead: false,
    actor: 'actor-id',
    target: 'target-id',
    data: {
      id: 1,
      content: 'content',
    },
    type: 'COMMENT_CREATE',
    createdAt: new Date(),
  },
];

describe('NotificaitonRepository', () => {
  let repository: NotificationRepository;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRepository,
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaClient>(),
        },
      ],
    }).compile();

    prisma = module.get(PrismaService);
    repository = module.get<NotificationRepository>(NotificationRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getManyForUser', () => {
    it('should return formatted notifications', async () => {
      const userId = 'user-id';

      prisma.notification.findMany.mockResolvedValueOnce(notifications);

      const result = await repository.getManyForUser(userId);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(Number),
            actor: expect.any(String),
            target: expect.any(String),
            isRead: expect.any(Boolean),
            data: expect.any(Object),
          }),
        ]),
      );
    });
  });

  describe('create', () => {
    it('should create a notification', async () => {
      const notification: NotificationMessage<unknown> = {
        actor: 'actor-id',
        target: 'target-id',
        data: {
          id: 1,
          content: 'content',
        },
      };

      prisma.notification.create.mockResolvedValueOnce(notifications[0]);

      const result = await repository.create(notification, 'COMMENT_CREATE');

      expect(result).toMatchObject({
        id: expect.any(Number),
        actor: notification.actor,
        target: notification.target,
        data: expect.objectContaining(notification.data),
        type: 'COMMENT_CREATE',
      });
    });
  });

  describe('getTargetId', () => {
    it('should return target', async () => {
      const id = 1;

      prisma.notification.findUniqueOrThrow.mockResolvedValueOnce({
        target: 'target-id',
      } as any as Prisma.Prisma__NotificationClient<Notification>);

      const result = await repository.getTargetId(id);

      expect(result).toEqual({
        target: expect.any(String),
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const userId = 'user-id';
      const id = 1;

      prisma.notification.findUniqueOrThrow.mockResolvedValueOnce({
        target: userId,
      } as any as Prisma.Prisma__NotificationClient<Notification>);

      prisma.notification.update.mockResolvedValueOnce(notifications[0]);

      const result = await repository.markAsRead(id);

      expect(result).toEqual(notifications[0]);
    });
  });
});
