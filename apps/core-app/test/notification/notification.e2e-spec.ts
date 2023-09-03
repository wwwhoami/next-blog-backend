import { NotificationMessage, PostPayload } from '@app/shared/entities';
import { AppModule } from '@core/src/app.module';
import { AuthCredentialsDto } from '@core/src/auth/dto/auth-credentials.dto';
import { ErrorInterceptor } from '@core/src/common/interceptors/error.interceptor';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { NotificationModule } from 'apps/notification/src/notification.module';
import { NotificationService } from 'apps/notification/src/notification.service';
import cookieParser from 'cookie-parser';
import request from 'supertest';

const notifications: NotificationMessage<PostPayload>[] = [
  {
    actor: 'ab182222-5603-4b01-909b-a68fbb3a2154',
    target: 'ab182222-5603-4b01-909b-a68fbb3a2153',
    data: {
      id: 1,
    },
  },
  {
    actor: 'ab182222-5603-4b01-909b-a68fbb3a2155',
    target: 'ab182222-5603-4b01-909b-a68fbb3a2153',
    data: {
      id: 2,
    },
  },
  {
    actor: 'ab182222-5603-4b01-909b-a68fbb3a2155',
    target: 'ab182222-5603-4b01-909b-a68fbb3a2154',
    data: {
      id: 3,
    },
  },
];

jest.setTimeout(20000);

describe('Notification (e2e)', () => {
  let app: INestApplication;
  let notificationService: NotificationService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, NotificationModule],
    }).compile();

    const configService = moduleRef.get(ConfigService);

    const kafkaPort = configService.get<number>('KAFKA_PORT');

    app = moduleRef.createNestApplication();

    app.connectMicroservice<MicroserviceOptions>(
      {
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'notification',
            brokers: [`localhost:${kafkaPort}`],
          },
          consumer: {
            groupId: 'notification-consumer',
          },
        },
      },
      {
        inheritAppConfig: true,
      },
    );

    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new ErrorInterceptor());
    app.use(cookieParser());

    notificationService = moduleRef.get(NotificationService);

    await app.startAllMicroservices();
    await app.init();
  });

  beforeAll(async () => {
    await notificationService.postNotification(notifications[0], 'POST_LIKE');
    await notificationService.postNotification(notifications[1], 'POST_UNLIKE');
    await notificationService.postNotification(notifications[2], 'POST_UNLIKE');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/notification (GET)', () => {
    let agent: request.SuperAgentTest;
    let accessToken: string;

    beforeAll(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        password: 'password',
      };

      agent = request.agent(app.getHttpServer());

      accessToken = (await agent.post(`/auth/login`).send(authCredentials))
        .body['accessToken'];
    });

    it('should get user notifications', () => {
      return agent
        .get('/notification')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK)
        .expect((res: request.Response) => {
          expect(res.body).toHaveLength(2);

          expect(res.body[0]).toEqual({
            id: expect.any(Number),
            actor: notifications[0].actor,
            target: notifications[0].target,
            data: notifications[0].data,
            isRead: false,
            type: 'POST_LIKE',
            createdAt: expect.any(String),
          });

          // Check that createdAt is correct date
          expect(new Date(res.body[0].createdAt).getTime()).not.toBeNaN();
        });
    });

    it('should get user notifications considering query params', () => {
      return agent
        .get('/notification')
        .query({ take: 1, isRead: false, type: 'POST_LIKE' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK)
        .expect((res: request.Response) => {
          expect(res.body).toHaveLength(1);

          expect(res.body[0]).toEqual({
            id: 1,
            actor: notifications[0].actor,
            target: notifications[0].target,
            data: notifications[0].data,
            isRead: false,
            type: 'POST_LIKE',
            createdAt: expect.any(String),
          });

          // Check that createdAt is correct date
          expect(new Date(res.body[0].createdAt).getTime()).not.toBeNaN();
        });
    });

    it('should get 401 Unauthorized if user is not logged in', () => {
      return agent.get('/notification').expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('/notification/:id (PATCH)', () => {
    let agent: request.SuperAgentTest;
    let accessToken: string;

    beforeAll(async () => {
      const authCredentials: AuthCredentialsDto = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        password: 'password',
      };

      agent = request.agent(app.getHttpServer());

      accessToken = (await agent.post(`/auth/login`).send(authCredentials))
        .body['accessToken'];
    });

    it('should mark notification as read', () => {
      return agent
        .patch('/notification/1')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK)
        .expect((res: request.Response) => {
          expect(res.body).toEqual({
            id: expect.any(Number),
            actor: notifications[0].actor,
            target: notifications[0].target,
            data: notifications[0].data,
            type: 'POST_LIKE',
            isRead: true,
            createdAt: expect.any(String),
          });

          // Check that createdAt is correct date
          expect(new Date(res.body.createdAt).getTime()).not.toBeNaN();
        });
    });

    it('should get 401 Unauthorized if user is not logged in', () => {
      return agent.patch('/notification/1').expect(HttpStatus.UNAUTHORIZED);
    });

    it('should get 403 Forbidden if user tries to mark notification that he is not the target of as read', async () => {
      return agent
        .patch('/notification/3')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should get 404 Not Found if notification does not exist', async () => {
      return agent
        .patch('/notification/100')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
