import { PrismaService } from '@app/prisma';
import {
  CommentPayload,
  NotificationMessage,
  PostPayload,
} from '@app/shared/entities';
import { ForbiddenError } from '@app/shared/errors/forbidden.error';
import { NOTIFICATION_SERVICE } from '@app/shared/kafka/kafka.constants';
import {
  kafkaClientProvider,
  kafkaProviderFactory,
} from '@app/shared/kafka/kafka.provider';
import { CommentLike } from '@core/src/comment/entities/comment.entity';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClientKafka,
  ClientsModule,
  MicroserviceOptions,
} from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { lastValueFrom } from 'rxjs';
import { NotificationService } from '../src/notification.service';
import { NotificationModule } from './../src/notification.module';
import { resetNotificationAutoIncrement } from './setup';

const userId = 'ab182222-5603-4b01-909b-a68fbb3a2153';

const notifications: NotificationMessage<PostPayload>[] = [
  {
    actor: 'ab182222-5603-4b01-909b-a68fbb3a2154',
    target: userId,
    data: {
      id: 1,
    },
  },
  {
    actor: 'ab182222-5603-4b01-909b-a68fbb3a2155',
    target: userId,
    data: {
      id: 2,
    },
  },
];

jest.setTimeout(30000);

describe('NotificationController (e2e)', () => {
  let app: INestApplication;
  let client: ClientKafka;
  let notificationService: NotificationService;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        NotificationModule,
        ClientsModule.registerAsync([kafkaClientProvider]),
      ],
    }).compile();

    const configService = moduleFixture.get(ConfigService);

    app = moduleFixture.createNestApplication();

    app.connectMicroservice<MicroserviceOptions>(
      kafkaProviderFactory(configService),
    );

    notificationService = moduleFixture.get(NotificationService);
    prismaService = moduleFixture.get(PrismaService);

    await app.startAllMicroservices();
    await app.init();

    // disable logging
    PinoLogger.root.level = 'silent';

    client = app.get(NOTIFICATION_SERVICE);

    client.subscribeToResponseOf('notification.get-many');
    client.subscribeToResponseOf('notification.mark-as-read');

    await client.connect();
  });

  afterAll(async () => {
    await prismaService.$disconnect();
    await client.close();
    await app.close();
  });

  describe('comment.create', () => {
    afterEach(async () => {
      await prismaService.notification.deleteMany();
    });

    it('should create a notification for comment created', async () => {
      const target = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const notification: NotificationMessage<CommentPayload> = {
        actor: userId,
        target,
        data: {
          id: 1,
          postId: 1,
        },
      };

      client.emit('comment.create', notification);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const notifications = await notificationService.getManyForUser(target);

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toEqual({
        id: expect.any(Number),
        ...notification,
        type: 'COMMENT_CREATE',
        isRead: false,
        createdAt: expect.any(Date),
      });

      // Check that createdAt is correct date
      expect(new Date(notifications[0].createdAt).getTime()).not.toBeNaN();
    });
  });

  describe('comment.like', () => {
    afterEach(async () => {
      await prismaService.notification.deleteMany();
    });

    it('should create a notification for comment liked', async () => {
      const target = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const notification: NotificationMessage<CommentLike> = {
        actor: userId,
        target,
        data: {
          id: 1,
          postId: 1,
          likesCount: 1,
        },
      };

      client.emit('comment.like', notification);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const notifications = await notificationService.getManyForUser(target);

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toEqual({
        id: expect.any(Number),
        ...notification,
        type: 'COMMENT_LIKE',
        isRead: false,
        createdAt: expect.any(Date),
      });

      // Check that createdAt is correct date
      expect(new Date(notifications[0].createdAt).getTime()).not.toBeNaN();
    });
  });

  describe('comment.unlike', () => {
    afterEach(async () => {
      await prismaService.notification.deleteMany();
    });

    it('should create a notification for comment unliked', async () => {
      const target = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const notification: NotificationMessage<CommentLike> = {
        actor: userId,
        target,
        data: {
          id: 1,
          postId: 1,
          likesCount: 0,
        },
      };

      client.emit('comment.unlike', notification);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const notifications = await notificationService.getManyForUser(target);

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toEqual({
        id: expect.any(Number),
        ...notification,
        type: 'COMMENT_UNLIKE',
        isRead: false,
        createdAt: expect.any(Date),
      });

      // Check that createdAt is correct date
      expect(new Date(notifications[0].createdAt).getTime()).not.toBeNaN();
    });
  });

  describe('post.like', () => {
    afterEach(async () => {
      await prismaService.notification.deleteMany();
    });

    it('should create a notification for post liked', async () => {
      const target = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const notification: NotificationMessage<PostPayload> = {
        actor: userId,
        target,
        data: {
          id: 1,
        },
      };

      client.emit('post.like', notification);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const notifications = await notificationService.getManyForUser(target);

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toEqual({
        id: expect.any(Number),
        ...notification,
        type: 'POST_LIKE',
        isRead: false,
        createdAt: expect.any(Date),
      });

      // Check that createdAt is correct date
      expect(new Date(notifications[0].createdAt).getTime()).not.toBeNaN();
    });
  });

  describe('post.unlike', () => {
    afterEach(async () => {
      await prismaService.notification.deleteMany();
    });

    it('should create a notification for post unliked', async () => {
      const target = 'afe39927-eb6b-4e73-8d06-239fe6b14eb4';
      const notification: NotificationMessage<PostPayload> = {
        actor: userId,
        target,
        data: {
          id: 1,
        },
      };

      client.emit('post.unlike', notification);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const notifications = await notificationService.getManyForUser(target);

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toEqual({
        id: expect.any(Number),
        ...notification,
        type: 'POST_UNLIKE',
        isRead: false,
        createdAt: expect.any(Date),
      });

      // Check that createdAt is correct date
      expect(new Date(notifications[0].createdAt).getTime()).not.toBeNaN();
    });
  });

  describe('notification.get-many', () => {
    beforeEach(async () => {
      await notificationService.postNotification(notifications[0], 'POST_LIKE');
      await notificationService.postNotification(
        notifications[1],
        'POST_UNLIKE',
      );
    });

    afterEach(async () => {
      await prismaService.notification.deleteMany();
      await resetNotificationAutoIncrement(prismaService);
    });

    it('should get notifications for userId provided', async () => {
      const response = await lastValueFrom(
        client.send('notification.get-many', {
          userId,
        }),
      );

      expect(response).toHaveLength(2);

      expect(response[0]).toEqual({
        id: expect.any(Number),
        actor: notifications[0].actor,
        target: notifications[0].target,
        data: notifications[0].data,
        type: 'POST_LIKE',
        isRead: false,
        createdAt: expect.any(String),
      });

      // Check that createdAt is correct date
      expect(new Date(response[0].createdAt).getTime()).not.toBeNaN();
    });

    it('should get notifications considering query params', async () => {
      const response = await lastValueFrom(
        client.send('notification.get-many', {
          userId,
          options: {
            take: 1,
            skip: 0,
            isRead: false,
            type: 'POST_LIKE',
          },
        }),
      );

      expect(response).toHaveLength(1);

      expect(response[0]).toEqual({
        id: expect.any(Number),
        actor: notifications[0].actor,
        target: notifications[0].target,
        data: notifications[0].data,
        type: 'POST_LIKE',
        isRead: false,
        createdAt: expect.any(String),
      });

      // Check that createdAt is correct date
      expect(new Date(response[0].createdAt).getTime()).not.toBeNaN();
    });
  });

  describe('notification.mark-as-read', () => {
    beforeEach(async () => {
      await prismaService.notification.deleteMany();
      await resetNotificationAutoIncrement(prismaService);

      await notificationService.postNotification(notifications[0], 'POST_LIKE');
      await notificationService.postNotification(
        notifications[1],
        'POST_UNLIKE',
      );
    });

    it("should mark user's notification as read", async () => {
      const response = await lastValueFrom(
        client.send('notification.mark-as-read', {
          id: 1,
          userId,
        }),
      );

      expect(response).toEqual({
        id: 1,
        actor: notifications[0].actor,
        target: notifications[0].target,
        data: notifications[0].data,
        type: 'POST_LIKE',
        isRead: true,
        createdAt: expect.any(String),
      });

      // Check that createdAt is correct date
      expect(new Date(response.createdAt).getTime()).not.toBeNaN();
    });

    it('should throw error if notification is not found', async () => {
      const response = lastValueFrom(
        client.send('notification.mark-as-read', {
          id: 3,
          userId,
        }),
      );

      await expect(response).rejects.toEqual({
        error: { message: 'No Notification found', name: 'NotFoundError' },
        message: 'No Notification found',
      });
    });

    it('should throw error if notification target is not the user', async () => {
      const error = new ForbiddenError();

      const response = lastValueFrom(
        client.send('notification.mark-as-read', {
          id: 1,
          userId: 'ab182222-5603-4b01-909b-a68fbb3a2156',
        }),
      );

      await expect(response).rejects.toEqual(JSON.parse(JSON.stringify(error)));
    });
  });
});
