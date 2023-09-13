import { AppModule as CoreAppModule } from '@core/src/app.module';
import { AuthCredentialsDto } from '@core/src/auth/dto/auth-credentials.dto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { initAdapters } from '@ws-notification/src/adapters.init';
import { RedisSocketEventEmitDTO } from '@ws-notification/src/shared/redis-propagator/dto/socket-event-emit';
import { RedisSocketEventSendDTO } from '@ws-notification/src/shared/redis-propagator/dto/socket-event-send';
import {
  REDIS_SOCKET_EVENT_EMIT_ALL_NAME,
  REDIS_SOCKET_EVENT_EMIT_AUTHENTICATED_NAME,
  REDIS_SOCKET_EVENT_SEND_NAME,
} from '@ws-notification/src/shared/redis-propagator/redis-propagator.constants';
import { RedisService } from '@ws-notification/src/shared/redis/redis.service';
import { Socket, io } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';

async function eventDataReception(
  from: Socket,
  event: string,
): Promise<string> {
  return new Promise<string>((resolve) => {
    setTimeout(() => resolve('timeout'), 100);

    from.on(event, (data: string) => {
      resolve(data);
    });
  });
}

describe('NotificationServiceController (e2e)', () => {
  let wsApp: INestApplication;
  let coreApp: INestApplication;
  let port: number;
  let redisService: RedisService;
  let unauthedWS: Socket;
  let aliceWS: Socket;
  let secondAliceWS: Socket;
  let johnWs: Socket;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const configService = moduleFixture.get(ConfigService);
    port = configService.getOrThrow<number>('APP_WS_NOTIFICATION_PORT');

    redisService = moduleFixture.get(RedisService);
    wsApp = moduleFixture.createNestApplication();

    initAdapters(wsApp);

    await wsApp.init();
    await wsApp.listen(port);

    const coreAppModuleRef: TestingModule = await Test.createTestingModule({
      imports: [CoreAppModule],
    }).compile();

    coreApp = coreAppModuleRef.createNestApplication();

    await coreApp.init();
  });

  beforeAll(async () => {
    const aliceAuthCredentials: AuthCredentialsDto = {
      name: 'Alice Johnson',
      email: 'alice@prisma.io',
      password: 'password',
    };
    const johnAuthCredentials: AuthCredentialsDto = {
      name: 'John Doe',
      email: 'john@prisma.io',
      password: 'password',
    };

    const aliceAccessToken: string = (
      await request
        .agent(coreApp.getHttpServer())
        .post(`/auth/login`)
        .send(aliceAuthCredentials)
    ).body['accessToken'];
    const johnAccessToken: string = (
      await request
        .agent(coreApp.getHttpServer())
        .post(`/auth/login`)
        .send(johnAuthCredentials)
    ).body['accessToken'];

    unauthedWS = io(`ws://localhost:${port}`);
    aliceWS = io(`ws://localhost:${port}`, {
      auth: {
        token: aliceAccessToken,
      },
    });
    secondAliceWS = io(`ws://localhost:${port}`, {
      auth: {
        token: aliceAccessToken,
      },
    });
    johnWs = io(`ws://localhost:${port}`, {
      auth: {
        token: johnAccessToken,
      },
    });

    unauthedWS.connect();
    aliceWS.connect();
    secondAliceWS.connect();
    johnWs.connect();

    unauthedWS.on('connect_error', (error) => console.log(error));
    aliceWS.on('connect_error', (error) => console.log(error));
    secondAliceWS.on('connect_error', (error) => console.log(error));
    johnWs.on('connect_error', (error) => console.log(error));

    await Promise.all([
      new Promise<void>((resolve) => unauthedWS.on('connect', resolve)),
      new Promise<void>((resolve) => aliceWS.on('connect', resolve)),
      new Promise<void>((resolve) => secondAliceWS.on('connect', resolve)),
      new Promise<void>((resolve) => johnWs.on('connect', resolve)),
    ]);

    console.log('All sockets connected');
  });

  afterAll(async () => {
    aliceWS.disconnect();
    secondAliceWS.disconnect();
    johnWs.disconnect();
    unauthedWS.disconnect();

    await wsApp.close();
    await coreApp.close();
  });

  describe('Socket authentication', () => {
    it('should authenticate socket with valid token in handshake auth token', async () => {
      const authCredentials: AuthCredentialsDto = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        password: 'password',
      };

      const accessToken: string = (
        await request
          .agent(coreApp.getHttpServer())
          .post(`/auth/login`)
          .send(authCredentials)
      ).body['accessToken'];

      const authedWS = io(`ws://localhost:${port}`, {
        auth: {
          token: accessToken,
        },
      });
      authedWS.connect();

      await new Promise<void>((resolve) => authedWS.on('connect', resolve));

      authedWS.close();
    });

    it('should authenticate socket with valid token in handshake query token', async () => {
      const authCredentials: AuthCredentialsDto = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        password: 'password',
      };
      const accessToken: string = (
        await request
          .agent(coreApp.getHttpServer())
          .post(`/auth/login`)
          .send(authCredentials)
      ).body['accessToken'];

      const authedWS = io(`ws://localhost:${port}`, {
        query: {
          token: accessToken,
        },
      });
      authedWS.connect();

      await new Promise<void>((resolve) => authedWS.on('connect', resolve));

      authedWS.close();
    });

    it('should authenticate socket with valid token in handshake authorization header', async () => {
      const authCredentials: AuthCredentialsDto = {
        name: 'Alice Johnson',
        email: 'alice@prisma.io',
        password: 'password',
      };
      const accessToken: string = (
        await request
          .agent(coreApp.getHttpServer())
          .post(`/auth/login`)
          .send(authCredentials)
      ).body['accessToken'];

      const authedWS = io(`ws://localhost:${port}`, {
        extraHeaders: {
          authorization: accessToken,
        },
      });
      authedWS.connect();

      await new Promise<void>((resolve) => authedWS.on('connect', resolve));

      authedWS.close();
    });

    it('should not authenticate socket with invalid token', async () => {
      const expectedErrorMessage = 'Invalid auth token';
      const authedWS = io(`ws://localhost:${port}`, {
        auth: {
          token: 'invalid token',
        },
        autoConnect: false,
      });

      const errorMessage = new Promise<string>((resolve) => {
        authedWS.on('connect_error', (error) => {
          resolve(error.message);
        });
      });
      authedWS.connect();

      await expect(errorMessage).resolves.toEqual(expectedErrorMessage);

      authedWS.close();
    });
  });

  describe('REDIS_SOCKET_EVENT_SEND_NAME', () => {
    it("should emit event to all user's sockets", async () => {
      const redisMessage: RedisSocketEventSendDTO = {
        event: 'testEvent',
        data: 'testData',
        userId: 'ab182222-5603-4b01-909b-a68fbb3a2153',
      };

      const unauthedSocketData = eventDataReception(
        unauthedWS,
        redisMessage.event,
      );
      const aliceSocketData = eventDataReception(aliceWS, redisMessage.event);
      const secondAliceSocketData = eventDataReception(
        secondAliceWS,
        redisMessage.event,
      );
      const johnSocketData = eventDataReception(johnWs, redisMessage.event);

      await redisService.publish(REDIS_SOCKET_EVENT_SEND_NAME, redisMessage);

      await expect(aliceSocketData).resolves.toEqual(redisMessage.data);
      await expect(secondAliceSocketData).resolves.toEqual(redisMessage.data);
      await expect(johnSocketData).resolves.toEqual('timeout');
      await expect(unauthedSocketData).resolves.toEqual('timeout');
    });
  });

  describe('REDIS_SOCKET_EVENT_EMIT_ALL_NAME', () => {
    it('should emit event to all connected sockets', async () => {
      const redisMessage: RedisSocketEventEmitDTO = {
        event: 'testEvent',
        data: 'testData',
      };

      const unauthedSocketData = eventDataReception(
        unauthedWS,
        redisMessage.event,
      );
      const aliceSocketData = eventDataReception(aliceWS, redisMessage.event);
      const secondAliceSocketData = eventDataReception(
        secondAliceWS,
        redisMessage.event,
      );
      const johnSocketData = eventDataReception(johnWs, redisMessage.event);

      await redisService.publish(
        REDIS_SOCKET_EVENT_EMIT_ALL_NAME,
        redisMessage,
      );

      await expect(unauthedSocketData).resolves.toEqual(redisMessage.data);
      await expect(aliceSocketData).resolves.toEqual(redisMessage.data);
      await expect(secondAliceSocketData).resolves.toEqual(redisMessage.data);
      await expect(johnSocketData).resolves.toEqual(redisMessage.data);
    });
  });

  describe('REDIS_SOCKET_EVENT_EMIT_AUTHENTICATED_NAME', () => {
    it('should emit event to all authenticated sockets', async () => {
      const redisMessage: RedisSocketEventEmitDTO = {
        event: 'testEvent',
        data: 'testData',
      };

      const unauthedSocketData = eventDataReception(
        unauthedWS,
        redisMessage.event,
      );
      const aliceSocketData = eventDataReception(aliceWS, redisMessage.event);
      const secondAliceSocketData = eventDataReception(
        secondAliceWS,
        redisMessage.event,
      );
      const johnSocketData = eventDataReception(johnWs, redisMessage.event);

      await redisService.publish(
        REDIS_SOCKET_EVENT_EMIT_AUTHENTICATED_NAME,
        redisMessage,
      );

      await expect(aliceSocketData).resolves.toEqual(redisMessage.data);
      await expect(secondAliceSocketData).resolves.toEqual(redisMessage.data);
      await expect(johnSocketData).resolves.toEqual(redisMessage.data);
      await expect(unauthedSocketData).resolves.toEqual('timeout');
    });
  });
});
