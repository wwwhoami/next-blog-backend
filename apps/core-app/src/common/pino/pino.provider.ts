import { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

export const pinoParams: Params = {
  pinoHttp: {
    redact: ['req.headers.authorization', 'req.headers.cookie'],

    customProps: () => ({
      context: 'Core:HTTP',
    }),

    genReqId: (req, res) => {
      const existingID = req.id ?? req.headers['x-request-id'];

      if (existingID) return existingID;

      const id = randomUUID();
      res.setHeader('X-Request-Id', id);

      return id;
    },

    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 500 || err) {
        return 'error';
      }
      if (res.statusCode >= 400) {
        return 'warn';
      }
      if (res.statusCode >= 300 && res.statusCode < 400) {
        return 'silent';
      }
      return 'info';
    },

    customSuccessMessage: function (req, res, responseTime) {
      const { method, url } = req;
      const { statusCode, statusMessage } = res;

      return `${method} ${url} ${statusCode} ${statusMessage} +${responseTime}ms`;
    },

    customErrorMessage: function (req, res, err) {
      const { method, url } = req;
      const { statusCode, statusMessage } = res;

      return `${method} ${url} ${statusCode} ${statusMessage} ${err}`;
    },

    transport:
      process.env.NODE_ENV !== 'prod'
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
            },
          }
        : {
            targets: [
              {
                target: 'pino/file',
                options: { destination: `${__dirname}/core-app.log` },
              },
              {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                },
              },
            ],
          },

    level: process.env.NODE_ENV === 'prod' ? 'info' : 'debug',
  },
};
