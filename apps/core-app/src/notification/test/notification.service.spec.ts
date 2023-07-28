import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from '../notification.service';
import { NOTIFICATION_SERVICE } from '@core/src/kafka-client/kafka.constants';
import { ClientKafka } from '@nestjs/microservices';
import { MockProxy, mock } from 'jest-mock-extended';
import { lastValueFrom, of, throwError } from 'rxjs';

describe('NotificationService', () => {
  let service: NotificationService;
  let client: MockProxy<ClientKafka>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: NOTIFICATION_SERVICE, useValue: mock<ClientKafka>() },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    client = module.get(NOTIFICATION_SERVICE);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMany', () => {
    const getMany = async () =>
      await service.getMany('afe39927-eb6b-4e73-8d06-239fe6b14eb4');

    it('should return an array of notifications', async () => {
      const getNotificationsObs = of([
        {
          actor: 'afe39927-eb6b-4e73-8d06-239fe6b14eb4',
          target: '2',
          data: {
            id: 1,
          },
        },
      ]);

      client.send.mockReturnValueOnce(getNotificationsObs);

      expect(await getMany()).toBe(await lastValueFrom(getNotificationsObs));
    });

    it('should throw an error if the client returns an error', async () => {
      const getNotificationsObs = throwError(() => 'error');

      client.send.mockReturnValueOnce(getNotificationsObs);

      expect(getMany()).rejects.toBe('error');
    });

    it('should throw an error entry if the client returns an error with err.error entry', async () => {
      const error = {
        message: 'error',
      };
      const getNotificationsObs = throwError(() => ({
        error,
      }));

      client.send.mockReturnValueOnce(getNotificationsObs);

      expect(getMany()).rejects.toBe(error);
    });
  });

  describe('markAsRead', () => {
    const markAsRead = async () =>
      await service.markAsRead(1, 'afe39927-eb6b-4e73-8d06-239fe6b14eb4');

    it('should return an array of notifications', async () => {
      const getNotificationsObs = of([
        {
          actor: 'afe39927-eb6b-4e73-8d06-239fe6b14eb4',
          target: '2',
          data: {
            id: 1,
          },
        },
      ]);

      client.send.mockReturnValueOnce(getNotificationsObs);

      expect(await markAsRead()).toBe(await lastValueFrom(getNotificationsObs));
    });

    it('should throw an error if the client returns an error', async () => {
      const getNotificationsObs = throwError(() => 'error');

      client.send.mockReturnValueOnce(getNotificationsObs);

      expect(markAsRead()).rejects.toBe('error');
    });

    it('should throw an error entry if the client returns an error with err.error entry', async () => {
      const error = {
        message: 'error',
      };
      const getNotificationsObs = throwError(() => ({
        error,
      }));

      client.send.mockReturnValueOnce(getNotificationsObs);

      expect(markAsRead()).rejects.toBe(error);
    });
  });
});
