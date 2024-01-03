import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<
    Prisma.PrismaClientOptions,
    'query' | 'error' | 'info' | 'warn'
  >
  implements OnModuleInit
{
  constructor() {
    super({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
    });
  }

  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    this.$on('query', (e) => {
      e.query = e.query.replace(/(\n|\t|\s)+/g, ' ');
      this.logger.log(e, `PrismaClient:Query +${e.duration}ms`);
    });

    this.$on('error', (e) => {
      this.logger.error(e.message, e.target, 'PrismaClient:Error');
    });

    this.$on('info', (e) => {
      this.logger.verbose(e, 'PrismaClient:Info');
    });

    this.$on('warn', (e) => {
      this.logger.warn(e, 'PrismaClient:Warn');
    });

    await this.$queryRaw`SET pg_trgm.similarity_threshold = 0.2`;
    await this.$connect();
  }
}
